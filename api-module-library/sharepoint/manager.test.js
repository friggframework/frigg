const mongoose = require('mongoose');
const nock = require('nock');
const querystring = require('querystring');
const Manager = require('./manager');
const config = require('./defaultConfig.json');

describe(`Should fully test the ${config.label} Manager`, () => {
    let manager;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        manager = await Manager.getInstance({
            userId: new mongoose.Types.ObjectId(),
        });
    });

    afterAll(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
        await mongoose.disconnect();
    });

    describe('#getAuthorizationRequirements', () => {
        it('should return auth requirements', () => {
            const queryParams = querystring.stringify({
                client_id: 'sharepoint_client_id_test',
                response_type: 'code',
                redirect_uri: 'http://redirect_uri_test/microsoft-sharepoint',
                scope: 'sharepoint_scope_test',
                state: '',
                prompt: 'select_account'
            });

            const requirements = manager.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.url).toEqual(`${manager.api.authorizationUri}?${queryParams}`);
        });
    });

    describe('#processAuthorizationCallback', () => {
        const baseUrl = 'https://graph.microsoft.com/v1.0';
        let authScope, sitesScope, userScope;

        beforeEach(() => {
            const body = querystring.stringify({
                grant_type: 'authorization_code',
                client_id: 'sharepoint_client_id_test',
                client_secret: 'sharepoint_client_secret_test',
                redirect_uri: 'http://redirect_uri_test/microsoft-sharepoint',
                scope: 'sharepoint_scope_test',
                code: 'test'
            });

            authScope = nock('https://login.microsoftonline.com')
                .post('/common/oauth2/v2.0/token', )
                .reply(200, {
                    access_token: 'access_token',
                    refresh_token: 'refresh_token',
                    expires_in: 'expires_in'
                });

            sitesScope = nock(baseUrl)
                .get('/sites?search=*')
                .reply(200, {
                    sites: 'sites'
                });

            userScope = nock(baseUrl)
                .get('/me')
                .reply(200, {
                    id: 'id',
                    displayName: 'displayName',
                    userPrincipalName: 'userPrincipalName'
                });
        });

        it('should return an entity_id, credential_id, and type for successful auth', async () => {
            const params = { code: 'code ' };

            const res = await manager.processAuthorizationCallback(params);
            expect(res).toBeDefined();
            expect(res.entity_id).toBeDefined();
            expect(res.credential_id).toBeDefined();
            expect(res.type).toEqual(config.name);

            expect(authScope.isDone()).toBe(true);
            expect(sitesScope.isDone()).toBe(true);
            expect(userScope.isDone()).toBe(true);
        });
    });
});