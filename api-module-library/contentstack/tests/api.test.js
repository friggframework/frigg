require('dotenv').config();
const Authenticator = require('@friggframework/test-environment/Authenticator');
const config = require('../defaultConfig.json');
const { Api } = require('../api');
describe('Contentstack API Tests', () => {
    const apiParams = {
        client_id: process.env.CONTENTSTACK_CLIENT_ID,
        client_secret: process.env.CONTENTSTACK_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/contentstack`,
        app_uid: process.env.CONTENTSTACK_APP_UID,
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = await api.getAuthUri();
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const result = await api.getTokenFromCode(response.data.code);
        api.setOrganizationUid(result.organization_uid);
        api.setApiKey(result.stack_api_key);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an tokens', async () => {
            expect(api.access_token).not.toBeNull();
            expect(api.refresh_token).not.toBeNull();
        });
        it('Should be able to refresh the token', async () => {
            const oldToken = api.access_token;
            const oldRefreshToken = api.refresh_token;
            api.access_token = 'nope';
            const response = await api.listRoles();
            //await api.refreshAccessToken({ refresh_token: api.refresh_token });
            expect(api.access_token).not.toBeNull();
            expect(api.access_token).not.toEqual(oldToken);
            expect(api.refresh_token).not.toBeNull();
            expect(api.refresh_token).not.toEqual(oldRefreshToken);
        });
        it.skip('Should fail to refresh the token', async () => {
            const oldToken = api.access_token;
            const oldRefreshToken = api.refresh_token;
            const response = await api.refreshAccessToken({ refresh_token: 'borked' });
            expect(response).toBeDefined();

        });
    });

    describe('Stack Requests', () => {
        it('Gets connected Stack', async () => {
            const response = await api.listRoles();
            expect(response).toHaveProperty('roles');
            const { stack } = response.roles[0];
            expect(stack).toHaveProperty('name');
        });
    });

    describe('Content Type requests', () => {
        it('List all Content Types', async () => {
            const response = await api.listContentTypes();
            expect(response).toHaveProperty('content_types');
        });
    });

    describe('Content Entries requests', () => {
        let contentType;
        beforeAll(async () => {
            const { content_types } = await api.listContentTypes();
            contentType = content_types[0];
        });
        it('List all entries for a given Content Type', async () => {
            const response = await api.listEntries(contentType.uid);
            expect(response).toHaveProperty('entries');
        });
        it.skip('Create new Entry Version for given language variation', async () => {
            const body = {
                source_language: 'en',
            };
            const response = await api.updateEntry();
            expect(response).toHaveProperty('results');
        });
        it.skip('Create new Entry', async () => {
            const body = {
                source_language: 'en',
            };
            const response = await api.createEntry(body);
            expect(response).toHaveProperty('results');
        });
        it.skip('Update Entry', async () => {
            const body = {
                source_language: 'en',
            };
            const response = await api.searchTranslations(body);
            expect(response).toHaveProperty('results');
        });
        it.skip('Delete Entry', async () => {
            const body = {
                source_language: 'en',
            };
            const response = await api.searchTranslations(body);
            expect(response).toHaveProperty('results');
        });
    });
});
