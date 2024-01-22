require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('42matters API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        access_token: process.env.MATTERS_ACCESS_TOKEN,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    describe('Test Auth', () => {
        it('Should retrieve account status', async () => {
            const status = await api.getAccountStatus();
            expect(status.status).toBe('OK');
        });
    });

    describe('API requests', () => {
        describe('People requests', () => {
            it('Should retrieve an android app', async () => {
                const appData = await api.getGoogleAppData('com.facebook.katana');
                expect(appData).toBeDefined();
                expect(appData.title).toBe('Facebook');
            });
        });
    });
});
