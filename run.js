import { MySmartChineseClient } from "./auto_completion.js";
import { Accounts, CachedQuestions } from "./database.js";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import fs from "fs";

process.loadEnvFile(".env");

const ai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEKAPIKEY,
});

// Usage example
async function finishAccount(
    username,
    password,
    force = false,
    correct_chance = 0.7,
    verify = true,
    enable_edb = false
) {
    const client = new MySmartChineseClient({
        cookies: "ASP.NET_SessionId=" + process.env.SESSIONID,
    });

    await client.login({ username, password });
    await client.validate();
    await client.retrievePersonID();

    const exercises = await client.retrieveExercises();

    const units = exercises.edset.Table1;
    const notGradedUnits = force ? units : units.filter((u) => u.Status == "");
    let content_ids = notGradedUnits.map((u) => {
        return Number.parseInt(u["contentID"]);
    });
    let unitsExercises = await Promise.all(
        content_ids.map(async (u) => {
            return await client.retrieveUnit({ contentID: u });
        })
    ); //variable for concating edb exercises
    //fuck their api, they put a whole motherfucker html into a json object, how genius they are

    if (enable_edb) {
        const edbContentIDs = JSON.parse(
            fs.readFileSync("./edb_exercises.json")
        );
        const unitObjects = await Promise.all(
            edbContentIDs.map(async (u) => {
                const obj = await client.retrieveEDBUnit({
                    contentID: Number.parseInt(u),
                });
                obj.content_id = Number.parseInt(u);
                return obj;
            })
        );
        const notGraded = force
            ? unitObjects
            : unitObjects.filter((u) => u.edset.Table2[0].Graded != "True");
        unitsExercises = unitsExercises.concat(notGraded);
        content_ids = content_ids.concat(notGraded.map((u) => u.content_id));
    }
    fs.writeFileSync("./temp.json", JSON.stringify(unitsExercises, null, 2));

    const submissionParams = (
        await Promise.all(
            unitsExercises.map(async (ue) => {
                console.log(`>>> Processing ${ue.edset.Table1[0].ExName}`);
                const content = ue.edset;

                const questions = content.Table2.map((q) => {
                    return {
                        question_id: q.QuestionID,
                        question_text: q.QuestionText,
                        answer_options: content.Table3.filter(
                            (ans) =>
                                ans.DocumentSmartElementID ==
                                q.DocumentSmartElementID
                        ).map((ans) => {
                            return {
                                id: ans.AnswerID,
                                text: ans.AnswerText,
                            };
                        }),
                    };
                });

                const matched_cached_questions = [];

                for (const cachedQuestion of await CachedQuestions.findAll()) {
                    for (let i = questions.length - 1; i >= 0; i--) {
                        const currentQuestion = questions[i];
                        if (
                            currentQuestion.question_id ==
                            cachedQuestion.question_id
                        ) {
                            console.log(
                                `[run] ✅ Found Cached Question ${cachedQuestion.question_id} : ${cachedQuestion.answer_id}`
                            );
                            questions.splice(i, 1);
                            const push = {
                                DID: content.Table2.find(
                                    (q) =>
                                        q.QuestionID ==
                                        cachedQuestion.question_id
                                ).UserExerciseDetailID,
                                DValue: content.Table3.find(
                                    (ans) =>
                                        ans.AnswerID == cachedQuestion.answer_id
                                ).AnswerText,
                            };
                            push.Wrong = content.Table3.filter(
                                (ans) =>
                                    ans.DocumentSmartElementID ==
                                    content.Table2.find(
                                        (q) =>
                                            q.QuestionID ==
                                            cachedQuestion.question_id
                                    ).DocumentSmartElementID
                            ).find(
                                (ans) =>
                                    ans.AnswerID != cachedQuestion.answer_id
                            ).AnswerText;

                            matched_cached_questions.push(push);
                        }
                    }
                }
                if (matched_cached_questions.length != 0)
                    return matched_cached_questions;

                console.log(
                    `[run] ✅ No Matched Cached Questions. Asking for AI.`
                );

                //>>>ai part
                const articleHTMLRawText = content.Table1[0].BodyText;

                const html = cheerio.load(articleHTMLRawText);
                const article = html.text();

                const reply_format = {
                    answers: [
                        {
                            question_id: "(From question_id)",
                            answer_id:
                                "(From answer_options, exactly the same)",
                            exception:
                                "(Follow the instructions from taskPrompt)",
                        },
                    ],
                };

                const taskPrompt = `
        Task: To answer the questions using the article. 
        Requirement: Reply in JSON format
        If the article shows that it is a listening task or doesn't provide related information, set the 'exception' field to true and set the answer to the most correct one.
        `;

                const response = await ai.chat.completions.create({
                    model: "deepseek-chat",
                    messages: [
                        {
                            role: "system",
                            content: JSON.stringify({
                                taskPrompt,
                                article,
                                reply_format,
                                questions,
                            }),
                        },
                    ],
                    temperature: 0.1,
                    response_format: {
                        type: "json_object",
                    },
                });

                const json = JSON.parse(response.choices[0].message.content);

                //<<<ai part

                const submissions = json.answers.map((a) => {
                    const wrong = content.Table3.filter(
                        (ans) => ans.AnswerID != a.answer_id
                    );
                    return {
                        DID: content.Table2.find(
                            (q) => q.QuestionID == a.question_id
                        ).UserExerciseDetailID,
                        DValue: content.Table3.find(
                            (ans) => ans.AnswerID == a.answer_id
                        ).AnswerText,
                        Wrong: wrong[Math.floor(Math.random() * wrong.length)]
                            .AnswerText,
                    };
                });

                for (const ans of json.answers) {
                    await CachedQuestions.create({
                        question_id: ans.question_id,
                        answer_id: ans.answer_id,
                    });
                }

                return submissions;
            })
        )
    ).flatMap((a) => a);
    for (const sub of submissionParams) {
        const chance = correct_chance;
        const random = Math.random();
        const result = random > chance;

        if (result) {
            sub.DValue = sub.Wrong; //correct_chance, fake the teachers panel data

            process.stdout.write("\x1b[31mRANDOM WRONG FLAG\x1b[0m ");
        }
        await client.submitAnswer({ DID: sub.DID, DValue: sub.DValue });
    }
    for (const u of content_ids) {
        await client.submitUnit({ contentID: u });
    }

    //==================after graded, verify caches================because of untrusted state of "isCorrect" and "isWrong" flags before submitting===================
    if (verify) {
        console.log(
            "===================Answers Caching Verification====================="
        );
        await Promise.all(
            content_ids.map(async (e) => {
                const unit = await client.retrieveUnit({
                    contentID: Number.parseInt(e),
                });
                const content = unit.edset;
                const answers = content.Table3;
                for (const ans of answers) {
                    if (ans.isCorrent == "0" || ans.isWrong == "1") continue;
                    const questionTracerFlag = ans.DocumentSmartElementID; //I don't know why the fuck they called it a fucking smart element and used 1000 id for only one object, that's genius database design
                    const question = content.Table2.find(
                        (q) => q.DocumentSmartElementID === questionTracerFlag
                    );
                    const targetedCache = await CachedQuestions.findOne({
                        where: { question_id: question.QuestionID },
                    });
                    if (targetedCache == null) {
                        console.log(
                            `[run] ✅ Created Cached Question ${question.QuestionID} Answer to ${ans.AnswerID}`
                        );
                        await CachedQuestions.create({
                            question_id: question.QuestionID,
                            answer_id: ans.AnswerID,
                        });
                        continue;
                    }

                    if (targetedCache.answer_id != ans.AnswerID) {
                        console.log(
                            `[run] ✅ Update Wrong Cached Question ${targetedCache.question_id} Answer from ${targetedCache.answer_id} to ${ans.AnswerID}`
                        );
                        await targetedCache.update({ answer_id: ans.AnswerID });
                    }
                }
            })
        );
    }
    await client.logout();
}

export { finishAccount };
