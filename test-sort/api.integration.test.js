const express = require('express');
const puppeteer = require('puppeteer');
const EntityManager = require('../src/managers/entities/EntityManager');
const destroyer = require('server-destroy');
const { createModel } = require('@friggframework/models');

// TODO this should be packaged into a helper

const testUserId = 9001;

const app = express();
let redirectData;

app.route('/redirect/rollworks').get((request, response, next) => {
    redirectData = request.query;
    response.json({ status: 'ok' });
    server.close();
});

let server;

const sleep = async (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

const waitForRedirectData = async () => {
    if (redirectData) {
        return redirectData;
    }

    await sleep(100);

    return await waitForRedirectData();
};

describe('Integration test', () => {
    beforeAll(async () => {
        server = app.listen(3_000);
    });

    afterAll(async () => {
        destroyer(server);
        server.destroy();
    });

    it.skip('can get a code from an OAuth redirect', async function () {
        this.timeout(45_000);

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        const EntityManagerClass =
            EntityManager.getEntityManagerClass('rollworks');
        const instance = await EntityManagerClass.getInstance({
            userId: testUserId,
        });

        const { type, url } = await instance.getAuthorizationRequirements();

        if (type !== 'oauth2') {
            throw new Error('This authorization type is not yet supported.');
        }

        await page.goto(url);

        await page.waitForSelector('#username');
        await page.type('#username', 'william@lefthook.com');

        await page.waitForSelector('#password');
        await page.type('#password', 'hugtu1-harsud-zyWkyh');

        await page.waitForSelector('input[type="submit"]');
        await page.click('input[type="submit"]');

        await page.waitForSelector('button.btn-primary');
        await page.click('button.btn-primary');

        const { code, scope } = await waitForRedirectData();

        await browser.close();

        // TODO get full token from the code we got in the redirect
    });
});
