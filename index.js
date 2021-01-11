'use strict';
const puppeteer = require('puppeteer');
const moment = require('moment');
const express = require("express")
const bodyParser = require('body-parser')

const app = express()
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let countryCodes = ["af", "ax", "al", "dz", "as", "ad", "ao", "ai", "ag", "ar", "am", "aw", "au", "at", "az", "bs", "bh", "bd", "bb", "by", "be", "bz", "bj", "bm", "bt", "bo", "ba", "bw", "br", "io", "vg", "bn", "bg", "bf", "bi", "kh", "cm", "ca", "cv", "bq", "ky", "cf", "td", "cl", "cn", "cx", "cc", "co", "km", "cg", "cd", "ck", "cr", "ci", "hr", "cu", "cw", "cy", "cz", "dk", "dj", "dm", "do", "ec", "eg", "sv", "gq", "er", "ee", "et", "fk", "fo", "fj", "fi", "fr", "gf", "pf", "ga", "gm", "ge", "de", "gh", "gi", "gr", "gl", "gd", "gp", "gu", "gt", "gg", "gn", "gw", "gy", "ht", "hn", "hk", "hu", "is", "in", "id", "ir", "iq", "ie", "im", "il", "it", "jm", "jp", "je", "jo", "kz", "ke", "ki", "kw", "kg", "la", "lv", "lb", "ls", "lr", "ly", "li", "lt", "lu", "mo", "mk", "mg", "mw", "my", "mv", "ml", "mt", "mh", "mq", "mr", "mu", "yt", "mx", "fm", "md", "mc", "mn", "me", "ms", "ma", "mz", "mm", "na", "nr", "np", "nl", "nc", "nz", "ni", "ne", "ng", "nu", "nf", "mp", "kp", "no", "om", "pk", "pw", "ps", "pa", "pg", "py", "pe", "ph", "pl", "pt", "pr", "qa", "re", "ro", "ru", "rw", "ws", "sm", "st", "sa", "sn", "rs", "sc", "sl", "sg", "sx", "sk", "si", "sb", "so", "za", "kr", "ss", "es", "lk", "bl", "sh", "kn", "lc", "mf", "pm", "vc", "sd", "sr", "sj", "sz", "se", "ch", "sy", "tw", "tj", "tz", "th", "tl", "tg", "tk", "to", "tt", "tn", "tr", "tm", "tc", "tv", "vi", "ug", "ua", "ae", "gb", "us", "uy", "uz", "vu", "va", "ve", "vn", "wf", "eh", "ye", "zm", "zw"];
const PORT = process.env.PORT || 3000
let browser, page, country_code;
let login = false;
let profiles_data;

let initialisation = async () => {
    browser = await puppeteer.launch({
        defaultViewport: null,
        headless: false,
        ignoreHTTPSErrors: true,
        dumpio: false
    })
    const pages = await browser.pages();
    page = pages[0]
    await page.setRequestInterception(true);
    await page.setDefaultNavigationTimeout(1000000);
    page.on('request', (req) => {
        if (['font', 'image', 'other'].includes(req.resourceType())) req.abort();
        else req.continue();
    });
    await page.goto('https://netflix.com');
    let countryCode = await page.url().slice(-8, -6);
    if (countryCodes.includes(countryCode)) country_code = countryCode;
    else country_code = "us"
    await page.on('close', async () => {
        try {
            await browser.close();
            login = false
            console.log("Browser closed")
        }
        catch (e) {
            console.log(`Something went wrong Error: ${e.message}`)
        }
    })
    if (await browser.isConnected())
        console.log("browser running")
    else {
        console.log("Puppeteer running")
    }

}
initialisation()

app.post("/", browserCheck, async (req, res) => {
    try {
        res.status(200).json(generateResponse(1, "Browser opened.", { isBrowserOpen: true }))
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong.", e.message))
    }
})

app.post("/login", browserCheck, async (req, res) => {
    try {
        if (login) {
            await res.status(200).json(generateResponse(1, "Already logged in", { login }))
        }
        else {
            await page.goto("https://www.netflix.com/login", { waitUntil: 'domcontentloaded' });
            await page.type("#id_userLoginId", req.body.username, { delay: 50 })
            await page.type("#id_password", req.body.password, { delay: 50 })
            await page.click("button[data-uia='login-submit-button']");
            await page.waitForNavigation({
                waitUntil: 'load',
            });
            let pageUrl = await page.url()
            login = pageUrl != `https://www.netflix.com/${country_code}/login`
            await res.status(200).json(generateResponse(1, "Login success", { login }))
        }
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/billing", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto(`https://www.netflix.com/BillingActivity`, { waitUntil: 'domcontentloaded' });
        let recentBillPeriod = await page.$eval('div[data-uia="billing-details-invoice-history-period-0"]', element => element.innerText);
        let todayDate = moment(new Date(), "DD/MM/YYYY")
        let subscription_start = moment(recentBillPeriod.split("—")[0], "DD/MM/YYYY");
        let subscription_end = moment(recentBillPeriod.split("—")[1], "DD/MM/YYYY");
        let subscription = moment(subscription_end).isSameOrAfter(todayDate);
        let remainingDays = subscription && moment(subscription_end).diff(todayDate, "days")
        let totalDuration = moment(subscription_end).diff(subscription_start, "days")
        let subscription_status = (subscription) ? "active" : "expired"
        let subscription_remaining_days = (remainingDays > 0) ? remainingDays : 0
        let total_duration = totalDuration
        await res.status(200).json(generateResponse(1, "Billing Details", { subscription_status, subscription_start, subscription_end, total_duration, subscription_remaining_days }))
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/profiles", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto("https://www.netflix.com/YourAccount", { waitUntil: 'domcontentloaded' });
        let plan_name = await page.$eval('div[data-uia="plan-label"] > b', element => element.innerText);
        let { profileCount, profilesDataArray } = await page.evaluate(async () => {
            let profilesNode = await document.querySelector("div.profile-hub > ul")
            let profileCount = await profilesNode.childElementCount
            let childNodes = await profilesNode.childNodes
            let profilesDataArray = await [...childNodes].map((element, index) => {
                let profile_name = element.querySelector("div.profile-header > div.profile-summary > h3").innerText
                let profile_code = element.getAttribute("data-uia")
                let profile_lock = element.querySelector("ul.profile-links > li > a[data-uia='action-profile-lock'] > .profile-main").innerText.replace("Profile Lock", "")
                let profile_token = element.querySelector("ul.profile-links > li > a[data-uia='action-profile-lock']").getAttribute("href").replace("/settings/lock/", "")
                return { id: ++index, profile_name, profile_code, profile_lock, profile_token }
            })
            return { profileCount, profilesDataArray }
        })
        let profiles_count = await profileCount
        profiles_data = await profilesDataArray.map((element, index) => {
            return (profiles_data != undefined) ? Object.assign(profiles_data[index], element) : element
        })
        await res.status(200).json(generateResponse(1, "Profile Details", { plan_name, profiles_count, profiles_data }))
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/checkPin", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto(`https://www.netflix.com/settings/lock/${req.body.profile_token}`, { waitUntil: 'domcontentloaded' });
        await page.type("#input-account-content-restrictions", req.body.password, { delay: 50 })
        await page.click("button[data-uia='btn-account-pin-submit']", { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ui-binary-input > #bxid_lock-profile_true', { visible: true, });
        let results = await page.$$eval('.pin-input-container > .pin-number-input', pinNodes => { return pinNodes.map(element => element.value) })
        let isPinValid = (req.body.pin == results.join("")) ? true : false
        await res.status(200).json(generateResponse(1, "Pin checking", { isPinValid }))
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/lockProfile", browserCheck, loginCheck, profileCheck, async (req, res) => {
    try {
        let profileObj = profiles_data.find(profile => profile.profile_token == req.body.profile_token)
        await page.goto(`https://www.netflix.com/settings/lock/${req.body.profile_token}`, { waitUntil: 'domcontentloaded' });
        await page.type("#input-account-content-restrictions", req.body.password, { delay: 10 })
        await page.click("button[data-uia='btn-account-pin-submit']", { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ui-binary-input > #bxid_lock-profile_true', { visible: true, });
        if (!await page.$eval('#bxid_lock-profile_true', element => element.checked)) {
            await page.$eval('#bxid_lock-profile_true', element => element.click());
        }
        await page.waitForSelector('div.pin-input-container', { visible: true, });
        let pin = req.body.pin.split("")
        let inputs = await page.$$('.pin-input-container > .pin-number-input');
        for (let [index, input] of inputs.entries()) {
            input.value = "";
            await input.focus();
            await input.type(pin[index]);
        }
        await page.click("button[data-uia='btn-account-pin-submit']", { waitUntil: 'domcontentloaded' });
        await page.waitForNavigation()
        let pageUrl = await page.url()
        if (await pageUrl == "https://www.netflix.com/YourAccount?message=lock.confirm&messageType=success") {
            profiles_data[profileObj.id].profile_lock = "On"
            await res.status(200).json(generateResponse(1, "Profile locked.", { profile_lock: true }))
        }
        else if (profileObj.profile_lock == "On")
            await res.status(200).json(generateResponse(1, "Profile locked.", { profile_lock: true }))
        else
            await res.status(200).json(generateResponse(1, "Profile not locked.", { profile_lock: false }))

    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/unlockProfile", browserCheck, loginCheck, profileCheck, async (req, res) => {
    try {
        let profileObj = profiles_data.find(profile => profile.profile_token == req.body.profile_token)
        console.log()
        if (profileObj.profile_lock == "Off") {
            await res.json({ profile_unlock: true })
        }
        else {
            await page.goto(`https://www.netflix.com/settings/lock/${req.body.profile_token}`, { waitUntil: 'domcontentloaded' });
            await page.type("#input-account-content-restrictions", req.body.password, { delay: 10 })
            await page.click("button[data-uia='btn-account-pin-submit']", { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.ui-binary-input > #bxid_lock-profile_true', { visible: true, });
            await page.$eval('#bxid_lock-profile_true', element => element.click());
            await page.click("button[data-uia='btn-account-pin-submit']", { waitUntil: 'domcontentloaded' });
            await page.waitForNavigation()
            let pageUrl = await page.url()
            if (await pageUrl == "https://www.netflix.com/YourAccount?message=lock.confirm&messageType=success") {
                profiles_data[profileObj.id].profile_lock = "Off"
                await res.status(200).json(generateResponse(1, "Profile unlocked.", { profile_unlock: true }))
            }
            else
                await res.status(200).json(generateResponse(1, "Profile not unlocked.", { profile_unlock: false }))
        }
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/createProfile", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto('https://www.netflix.com/profiles/manage', { waitUntil: 'domcontentloaded' });
        let profileNames = await page.$$eval('li.profile', profileNodes => { return profileNodes.map(element => element.querySelector("span.profile-name").innerText) })
        if (await page.$('.addProfileIcon') !== null) {
            if (profileNames.includes(req.body.profile_name))
                await res.json({ "err": "username_exist" }) //username already existed, try with new one
            else {
                await page.click(".addProfileIcon")
                await page.waitForSelector('.profile-actions-container', { visible: true, });
                await page.type("#add-profile-name", req.body.profile_name, { delay: 10 })
                if (req.body.child_profile) {
                    await page.$eval('#add-kids-profile', element => element.click());
                }
                let isCreated = await page.evaluate(async () => {
                    let nodes = await document.querySelectorAll('span.profile-button')
                    let createAction = false;
                    Array.from(nodes).forEach((elem) => {
                        if (elem.innerText == "CONTINUE") {
                            elem.click();
                            createAction = true
                        }
                    })
                    return await createAction;
                });
                await page.waitForSelector('.choose-profile', { visible: true, });
                await page.goto('https://www.netflix.com/ProfilesGate', { waitUntil: 'domcontentloaded' });
                let profiles = await page.$$('.choose-profile > li.profile')
                if (profileNames.length < profiles.length) {
                    let profile = await page.$eval(`li.profile:nth-of-type(${profiles.length})`, element => {
                        let profile_name = element.querySelector("a.profile-link > span.profile-name").innerText
                        let profile_token = element.querySelector("a.profile-link").getAttribute("href").replace("/SwitchProfile?tkn=", "")
                        return { profile_name, profile_token }
                    })
                    profile.id = await profiles.length - 1;
                    profile.isCreated = await isCreated
                    await res.status(200).json(generateResponse(1, "Profile created successfully.", { profile }))
                }
            }
        }
        else {
            await res.status(200).json(generateResponse(1, "Profiles exceeded.", { profile }))
        }
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong", e.message))
    }
})

app.post("/renameProfile", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto('https://www.netflix.com/profiles/manage', { waitUntil: 'domcontentloaded' });
        let profileNames = await page.$$eval('li.profile', profileNodes => { return profileNodes.map(element => element.querySelector("span.profile-name").innerText) })
        if (profileNames.length > req.body.profile_id) {
            await page.click(`li.profile:nth-of-type(${parseInt(req.body.profile_id) + 1})`)
            await page.waitForSelector('.profile-actions-container', { visible: true, });
            await page.$eval('.profile-edit-inputs > input', el => el.value = '');
            await page.type(".profile-edit-inputs > input", req.body.profile_name, { delay: 10 })
            await page.waitForSelector("span[data-uia='profile-save-button']")
            await page.click("span[data-uia='profile-save-button']")
            await page.waitForSelector('.choose-profile', { visible: true, });
            await page.goto('https://www.netflix.com/ProfilesGate', { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('a.profile-link', { visible: true, });
            let profile_name = await page.$eval(`li.profile:nth-of-type(${parseInt(req.body.profile_id) + 1})`, element => element.querySelector("a.profile-link > span.profile-name").innerText)
            let isRenamed = false;
            if (profile_name == req.body.profile_name) {
                isRenamed = true;
            }
            await res.status(200).json(generateResponse(1, "Profile renamed.", { isRenamed }))
        }
        else {
            await res.status(200).json(generateResponse(1, "Profile not found or Invalid profile Id.", { isRenamed }))
        }
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong.", e.message))
    }
})

app.post("/deleteProfile", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto('https://www.netflix.com/profiles/manage', { waitUntil: 'domcontentloaded' });
        let profileNames = await page.$$eval('li.profile', profileNodes => { return profileNodes.map(element => element.querySelector("span.profile-name").innerText) })
        if (profileNames.length >= req.body.profile_id && req.body.profile_id > 0) {
            let profile = await page.$eval(`li.profile:nth-of-type(${parseInt(req.body.profile_id)})`, (element, profile_id) => {
                let id = parseInt(profile_id);
                let profile_name = element.querySelector("span.profile-name").innerText
                return { id, profile_name }
            }, req.body.profile_id)
            await page.click(`li.profile:nth-of-type(${parseInt(req.body.profile_id)})`)
            await page.waitForSelector("span[data-uia='profile-delete-button']", { visible: true, });
            await page.click("span[data-uia='profile-delete-button'] > span")
            await page.waitForSelector('.profile-button', { visible: true, });
            let isDeleted = await page.evaluate(async () => {
                let nodes = await document.querySelectorAll('span.profile-button')
                let deleteAction = false;
                Array.from(nodes).forEach((elem) => {
                    if (elem.innerText == "DELETE PROFILE") {
                        elem.click();
                        deleteAction = true
                    }
                    else
                        deleteAction = false
                })
                return await deleteAction;
            });
            await page.waitForSelector('.choose-profile', { visible: true, });
            await page.goto('https://www.netflix.com/ProfilesGate', { waitUntil: 'domcontentloaded' });
            let profiles = await page.$$('.choose-profile > li.profile')
            if (profileNames.length > profiles.length) {
                await res.status(200).json(generateResponse(1, "Profile successfully deleted.", { isDeleted }))
            }
        }
        else {
            await res.status(200).json(generateResponse(1, "Profile not found or Invalid profile Id.", { isDeleted }))
        }
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong.", e.message))
    }
})

app.post("/signout", browserCheck, loginCheck, async (req, res) => {
    try {
        await page.goto('https://www.netflix.com/SignOut', { waitUntil: 'domcontentloaded' });
        login = false
        await res.status(200).json(generateResponse(1, "Signout successfully.", { signout: true }))
    }
    catch (e) {
        res.status(500).json(generateResponse(0, "Something went wrong.", e.message))
    }
})

async function browserCheck(req, res, next) {
    try {
        if (await browser.isConnected())
            next()
        else {
            await initialisation()
            next()
        }
    }
    catch (e) {
        await res.status(500).json(generateResponse(0, "Error", "Something went wrong"))
    }
}

async function loginCheck(req, res, next) {
    if (await browser.isConnected()) {
        if (login) next()
        else
            await res.status(500).json(generateResponse(0, "Please login first to access secured content", { isLogin: false }))
    }
    else {
        await initialisation()
        next()
    }
}

async function profileCheck(req, res, next) {
    await page.goto("https://www.netflix.com/YourAccount", { waitUntil: 'domcontentloaded' });
    let { profilesDataArray } = await page.evaluate(async () => {
        let profilesNode = await document.querySelector("div.profile-hub > ul")
        let childNodes = await profilesNode.childNodes
        let profilesDataArray = await [...childNodes].map((element, index) => {
            let profile_name = element.querySelector("div.profile-header > div.profile-summary > h3").innerText
            let profile_code = element.getAttribute("data-uia")
            let profile_lock = element.querySelector("ul.profile-links > li > a[data-uia='action-profile-lock'] > .profile-main").innerText.replace("Profile Lock", "")
            let profile_token = element.querySelector("ul.profile-links > li > a[data-uia='action-profile-lock']").getAttribute("href").replace("/settings/lock/", "")
            return { id: index, profile_name, profile_code, profile_lock, profile_token }
        })
        return { profilesDataArray }
    })
    profiles_data = await profilesDataArray.map((element, index) => {
        return (profiles_data != undefined) ? Object.assign(profiles_data[index], element) : element
    })
    next()
}

function generateResponse(status, message, data) {
    return {
        status,
        message,
        data
    }
}

app.listen(PORT, (err) => {
    if (err)
        console.log(err.message)
    else
        console.log(`Puppeteer server started at ${PORT}`)
})