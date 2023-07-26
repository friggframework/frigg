require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Dropbox API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.DROPBOX_CLIENT_ID,
        client_secret: process.env.DROPBOX_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/dropbox`,
        scope: process.env.DROPBOX_SCOPE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCode(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an tokens', async () => {
            expect(api.access_token).toBeTruthy();
            expect(api.refresh_token).toBeTruthy();
        });
        it('Should be able to refresh the token', async () => {
            const oldToken = api.access_token;
            await api.refreshAuth();
            expect(api.access_token).toBeTruthy();
            expect(api.access_token).not.toEqual(oldToken);
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
        });
    });
    describe('File and Folder requests', () => {
        it('Should retrieve folders', async () => {
            const folders = await api.listFolders();
            expect(folders).toBeDefined();
            expect(folders.entries).toBeInstanceOf(Array);
        });
    });

    describe('Shared File and Folder requests', () => {
        it('Should retrieve folders', async () => {
            const folders = await api.listSharedFolders();
            expect(folders).toBeDefined();
            expect(folders.entries).toBeInstanceOf(Array);
        });
    });
});
