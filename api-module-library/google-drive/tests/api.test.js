require('dotenv').config();
const { Api } = require('../api');
const config = require("@friggframework/api-module-hubspot/defaultConfig.json");
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Google Drive API tests', () => {


    const apiParams = {
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/google-drive`,
        scope: process.env.GOOGLE_DRIVE_SCOPE
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = await api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        await api.getTokenFromCode(response.data.code);
    });

    describe('HS User Info', () => {
        it('should return the user details', async () => {
            const response = await api.getAbout();
            expect(response).toBeDefined();
        });
    });

});
