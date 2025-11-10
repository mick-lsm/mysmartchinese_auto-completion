import express from 'express';
import { Accounts } from './database.js';
import cors from 'cors';
import { finishAccount } from './run.js';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Basic route
app.post('/api/accounts/all/completion', async (req, res) => {
    const list = (await Accounts.findAll({ raw: true }));
    const force = req.query.force;
    let verified = true; // verify for only once
    for (const account of list) {
        if (!account.enable_normal_exercises) continue;
        console.log(`\n==========================[run] currently finishing account ${account.username}===================\n`)
        await finishAccount(account.username, account.password, force, account.correct_chance, verified, account.enable_edb_exercises).catch(console.error);
        verified = false;
    }
    res.status(200).send();
});

app.post('/api/accounts/:id/completion', async (req, res) => {
    const acc = await Accounts.findOne({ where: { id: req.params.id }, raw: true });
    if (acc == null ) {
        res.status(400).send();
        return;
    }
    if (acc.enable_normal_exercises== false){
        res.status(200).send();
        return;
    }
    console.log(`\n==========================[run] currently finishing account ${acc.username}===================\n`)
    await finishAccount(acc.username, acc.password, req.query.force, req.query.correct_chance != undefined ? req.query.correct_chance : acc.correct_chance, true, acc.enable_edb_exercises).catch(console.error);
    res.status(200).send();
})

app.post('/api/accounts', async (req, res) => {
    const add = async ({ username, password, correct_chance, student_number, student_class }) => {
        if (await Accounts.findOne({ where: { username: username } }) != null) {
            res.status(400).send();
            return;
        }
        await Accounts.create({ username, password, correct_chance, student_class, student_number });
    }
    if (!Array.isArray(req.body)) {
        await add(req.body);
    }
    else {
        for (const acc of req.body) {
            await add(acc);

        }
    }
    res.status(200).send();

});

app.get('/api/accounts', async (req, res) => {
    res.status(200).json(await Accounts.findAll({ raw: true }));
});

app.get('/', async (_, res) => {
    res.sendFile('C:\\Users\\liang_siu_ming\\Desktop\\mysmartchinese-auto-completion\\index.html');

});



// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});