require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Google Drive API tests', () => {

    const apiParams = {
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, //eslint-disable-line camelcase
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, //eslint-disable-line camelcase
        redirect_uri: `${process.env.REDIRECT_URI}/google-drive`, //eslint-disable-line camelcase
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

    describe('Drive User Info', () => {
        it('should return the user details', async () => {
            const response = await api.getUserDetails();
            expect(response).toBeDefined();
            expect(response.user.kind).toBe('drive#user');
        });
    });

    describe('Drive File Requests', () => {
        it('should return a page of files', async () => {
            const response = await api.listFiles();
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
        });


        it('should return a sorted page of files', async () => {
            const response = await api.listFiles({orderBy: 'folder,modifiedTime desc,name'});
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
        });

        it('should return a only folders', async () => {
            const response = await api.listFiles({q: "mimeType='application/vnd.google-apps.folder'"});
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
            expect(response.files).toMatchObject(Array(response.files.length).fill(
                {"mimeType": "application/vnd.google-apps.folder"}
            ));
        });

    })

});
