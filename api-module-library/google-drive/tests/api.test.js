require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require('@friggframework/test-environment/Authenticator');
const fs = require('fs');
const path = require('path');

describe('Google Drive API tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/google-drive`,
        scope: process.env.GOOGLE_DRIVE_SCOPE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    beforeAll(async () => {
        api.setState(JSON.stringify({ id: 1 }));
        const url = await api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        await api.getTokenFromCode(response.data.code);
    });

    describe('Confirm Authentication Requests', () => {
        it('Check Access Token', () => {
            expect(api.access_token).toBeDefined();
        });
        it('Check Refresh Token', () => {
            expect(api.refresh_token).toBeDefined();
        });
    });

    describe('Drive User Info', () => {
        it('should return the user details', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
            expect(user.kind).toBe('drive#user');
        });
    });

    describe('Drive Drive requests', () => {
        it('should return all drives', async () => {
            const response = await api.listDrives();
            expect(response).toBeDefined();
            expect(response.drives).toBeDefined();
        });

        it('should return My Drive root', async () => {
            const response = await api.getMyDriveRoot({ fields: '*' });
            expect(response).toBeDefined();
            expect(response.name).toEqual('My Drive');
        });
    });

    describe('Drive File Requests', () => {
        it('should return a page of files', async () => {
            const response = await api.listFiles({
                pageSize: 500,
                fields: '*',
            });
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
        });

        it('should return a sorted page of files', async () => {
            const response = await api.listFiles({
                orderBy: 'folder,modifiedTime desc,name',
                pageSize: 500,
            });
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
        });

        it('should return a only folders', async () => {
            const response = await api.listFolders();
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
            expect(response.files).toMatchObject(
                Array(response.files.length).fill({
                    mimeType: 'application/vnd.google-apps.folder',
                })
            );
        });

        let fileList;
        it('should return a only images and videos', async () => {
            const response = await api.listFiles({
                q: "mimeType contains 'image/' or mimeType contains 'video/'",
                fields: '*',
            });
            expect(response).toBeDefined();
            expect(response.files).toBeDefined();
            fileList = response.files;
        });

        it('should return a file with data', async () => {
            const response = await api.getFile(fileList[1].id, { fields: '*' });
            expect(response).toBeDefined();
            const data = await api.getFileData(fileList[1].id);
            expect(data.length).toBeGreaterThan(2000);
        });

        const fileIdWithLabels = '1Eb3KG-sErgluj9rIW-EEBN4ESkriPkPHV0qakHcDjL4';
        it("should return a file's labels", async () => {
            const response = await api.getFileLabels(fileIdWithLabels);
            expect(response).toBeDefined();
            expect(response.labels).toBeDefined();
        });
    });

    describe('Drive File Upload', () => {
        let uploadUrl, file, filename;
        beforeEach(async () => {
            filename = path.resolve('../../docs/FriggLogo.svg');
            file = fs.readFileSync(filename);
        });
        it('should retrieve a upload session id', async () => {
            const headers = {
                'X-Upload-Content-Type': 'image/svg+xml',
            };
            const body = {
                mimeType: 'image/svg+xml',
                name: 'frigg-logo-test (DELETE ME).svg',
            };
            const response = await api.getFileUploadSession(headers, body);
            expect(response).toBeDefined();
            expect(response.status).toBeDefined();
            expect(response.headers.get('location')).toBeDefined();
            uploadUrl = response.headers.get('location');
        });
        it('should upload a file', async () => {
            const fileSize = fs.statSync(filename).size;
            const headers = {
                'Content-Type': 'image/svg+xml',
                'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
            };
            const response = await api.uploadFileToSession(
                uploadUrl,
                headers,
                file
            );
            expect(response.status).toBe(200);
        });
        it('should download a file from a url and upload a file to google drive', async () => {
            const testUrl =
                'https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Wikipedia-logo-v2.svg/1920px-Wikipedia-logo-v2.svg.png';
            const response = await fetch(testUrl);
            const fileBuff = Buffer.from(await response.arrayBuffer());

            const newSessionHeaders = {
                'X-Upload-Content-Type': 'image/png',
            };
            const body = {
                mimeType: 'image/png',
                name: 'download-test (DELETE ME).png',
            };
            const sessionRes = await api.getFileUploadSession(
                newSessionHeaders,
                body
            );
            expect(sessionRes).toBeDefined();
            expect(sessionRes.status).toBeDefined();
            expect(sessionRes.headers.get('location')).toBeDefined();
            uploadUrl = sessionRes.headers.get('location');

            const fileSize = fileBuff.byteLength;
            const headers = {
                'Content-Type': 'image/png',
                'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
            };
            const uploadRes = await api.uploadFileToSession(
                uploadUrl,
                headers,
                fileBuff
            );
            expect(uploadRes.status).toBe(200);
            console.log(await uploadRes.json());
        });
        it('should upload a file via simple method', async () => {
            const fileSize = fs.statSync(filename).size;
            const headers = {
                'Content-Type': 'image/svg+xml',
                'Content-Length': fileSize,
            };
            const response = await api.uploadFileSimple(headers, file);
            expect(response.mimeType).toBe('image/svg+xml');
        });
    });
});
