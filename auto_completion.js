import axios from "axios";
import FormData from "form-data";
import { JSDOM } from "jsdom";

// Create an Axios instance with a 5-minute timeout
const axiosInstance = axios.create({
    timeout: 600000, // 5 minutes in milliseconds
});

class MySmartChineseClient {
    constructor({ cookies = "" }) {
        this.baseUrl = "https://www.mysmartedu.com.cn/CHID/";
        this.cookies = cookies;
    }

    log(msg, ...args) {
        console.log("✅ [MySmartChineseClient] : " + msg, args);
    }

    logError(msg, ...args) {
        console.log("❌ [MySmartChineseClient] : " + msg, args);
    }

    async login({ username, password }) {
        const loginUrl =
            "https://www.mysmartedu.com.cn/CHID/loginframeCHI.aspx";

        const loginPageResp = await axiosInstance.get(loginUrl, {
            headers: {
                Cookie: this.cookies,
            },
        });
        const dom = new JSDOM(loginPageResp.data);
        const document = dom.window.document;
        const getInputValue = (name) =>
            document.querySelector(`input[name="${name}"]`)?.value || "";

        const formData = new FormData();
        formData.append("__VIEWSTATE", getInputValue("__VIEWSTATE"));
        formData.append(
            "__VIEWSTATEGENERATOR",
            getInputValue("__VIEWSTATEGENERATOR")
        );
        formData.append(
            "__EVENTVALIDATION",
            getInputValue("__EVENTVALIDATION")
        );
        formData.append("txtAcc", username);
        formData.append("txtPw", password);
        formData.append("btnLogin", "");
        try {
            const response = await axiosInstance.post(loginUrl, formData, {
                headers: {
                    Cookie: this.cookies,
                    ...formData.getHeaders(),
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
            });

            this.log("Login succeeded");
            const text = response.data;

            const goUrlMatch = text.match(/goURL\('([^']+)','([^']+)'\)/);
            if (goUrlMatch) {
                const param1 = goUrlMatch[1];
                const param2 = goUrlMatch[2];

                this.username = username;
                this.password = password;
                this.vkey = param2;

                this.log("goURL params found:", param1, param2);
            } else {
                this.logError("goURL not found in response");
            }
        } catch (error) {
            this.logError(
                "Request failed: " +
                    (error.response ? error.response.statusText : error.message)
            );
            throw error;
        }
    }

    async validate() {
        const response = await axiosInstance.get(
            this.baseUrl + `validate.aspx?A=${this.username}&K=${this.vkey}`,
            {
                headers: {
                    Cookie: this.cookies,
                },
            }
        );
        this.log("Successfully validated");
    }

    async retrievePersonID() {
        const url = this.baseUrl + `LMSMv3/default.aspx?SF=CHID`;
        const response = await axiosInstance.get(url, {
            headers: {
                Cookie: this.cookies,
            },
        });
        const tmpPID = response.data.match(/var tmppid = '([^']+)';/);
        if (tmpPID) {
            this.personID = tmpPID[1];
            this.log("PID retrieved:", this.personID);
        } else {
            this.logError("PID not found in response");
        }
    }

    async retrieveExercises() {
        if (!this.personID) {
            this.logError(
                "PersonID not set. Please run retrievePersonID() first."
            );
            throw new Error(
                "PersonID not set. Please run retrievePersonID() first."
            );
        }
        const url =
            this.baseUrl +
            `LMSMv3/getTableOfContent.aspx?date=${Date.now()}&eur=${encodeURIComponent(
                JSON.stringify({
                    inPersonID: this.personID,
                    inContentType: "1",
                    inSortBy: "SUBJECT",
                })
            )}`;
        const response = await axiosInstance.get(url, {
            headers: {
                Cookie: this.cookies,
            },
        });
        this.log("Exercises retrieved successfully");
        return response.data;
    }

    async retrieveUnit({ contentID }) {
        const url = this.baseUrl + "LMSMv3/getContent.aspx?date=" + Date.now();

        const formData = new FormData();
        formData.append(
            "eur",
            JSON.stringify({
                CID: contentID,
                SEID: "",
                PID: this.personID,
                Mode: "STUDENT",
            })
        );

        const response = await axiosInstance.post(url, formData, {
            headers: {
                Cookie: this.cookies,
                ...formData.getHeaders(),
            },
        });
        this.log(`Unit ${contentID} retrieved successfully`);
        return response.data;
    }

    async retrieveEDBUnit({ contentID }) {
        const url =
            this.baseUrl + "LMSMv3/getContentEDB.aspx?date=" + Date.now();

        const formData = new FormData();
        formData.append(
            "eur",
            JSON.stringify({
                CID: contentID,
                SEID: "",
                PID: this.personID,
                Mode: "STUDENT",
            })
        );

        const response = await axiosInstance.post(url, formData, {
            headers: {
                Cookie: this.cookies,
                ...formData.getHeaders(),
            },
        });
        this.log(`Unit ${contentID} retrieved successfully`);
        return response.data;
    }

    async submitAnswer({ DID, DValue }) {
        const url = this.baseUrl + "LMSMv3/ProcessStudentAnsSubmit.aspx";

        const formData = new FormData();
        formData.append("eur", JSON.stringify({ DID, DValue }));

        const response = await axiosInstance.post(url, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Cookie: this.cookies,
                ...formData.getHeaders(),
                "X-Requested-With": "XMLHttpRequest",
            },
        });
        this.log("Answer submitted successfully", { DID, DValue });
        return response.data;
    }

    async logout() {
        const response = await axiosInstance.get(
            this.baseUrl + "LMSMv3/logout.aspx",
            {
                headers: {
                    Cookie: this.cookies,
                },
            }
        );
        this.log("Logged out successfully");
    }

    async submitUnit({ contentID }) {
        const url =
            this.baseUrl +
            `LMSMv3/ProcessStudentSectionSubmit.aspx?date=${Date.now()}`;

        const payload = {
            eur: JSON.stringify({
                CID: contentID,
                PID: this.personID,
                SectionStr: "N'第 1 頁'",
            }),
        };

        const response = await axiosInstance.post(
            url,
            new URLSearchParams(payload),
            {
                headers: {
                    Cookie: this.cookies,
                },
            }
        );

        this.log(`Unit ${contentID} submitted successfully`);
    }
}

export { MySmartChineseClient };
