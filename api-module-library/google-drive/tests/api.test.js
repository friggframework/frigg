require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Google Drive API tests', () => {

    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/google-drive`,
        scope: process.env.GOOGLE_DRIVE_SCOPE
    };
    /* eslint-enable camelcase */

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
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
            expect(user.kind).toBe('drive#user');
        });
    });

    describe('Drive File Requests', () => {
        it('should return a page of files', async () => {
            const response = await api.listFiles({pageSize: 500, fields: '*'});
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

        let fileList;
        it('should return a only images and videos', async () => {
            const response = await api.listFiles({q: "mimeType contains 'image/' or mimeType contains 'video/'", fields: '*'});
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
            fileList = response.files;
        });

        it('should return a file with data', async () => {
            const response = await api.getFile(fileList[1].id, {fields: '*'});
            expect(response).toBeDefined();
            const data = await api.getFileData(fileList[1].id);
            expect(data.length).toBeGreaterThan(2000);
        })

        const fileIdWithLabels = '1Eb3KG-sErgluj9rIW-EEBN4ESkriPkPHV0qakHcDjL4'
        it('should return a file\'s labels', async () => {
            const response = await api.getFileLabels(fileIdWithLabels);
            expect(response).toBeDefined();
            expect(response.labels).toBeDefined();
        })
    })

});
