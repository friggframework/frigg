require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");
const {createEntryBody, updateEntryBody, patchEntryBody} = require('../../../../test/mocks/contentful/index');

describe('Contentful API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.CONTENTFUL_CLIENT_ID,
        client_secret: process.env.CONTENTFUL_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/contentful`,
        scope: process.env.CONTENTFUL_SCOPE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);
    //api.access_token = process.env.ACCESS_TOKEN;
    let spaceId, envId;

    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCode(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate tokens', async () => {
            expect(api.access_token).toBeTruthy();
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUser();
            expect(user).toBeDefined();
            expect(user.email).toBeDefined();
        });
    });
    describe('Test request', () => {
        it('Should retrieve all available spaces', async () => {
            const spaces = await api.getSpaces();
            expect(spaces.sys.type).toBe('Array');
            spaceId = spaces.items[0].sys.id;
            api.spaceId = spaceId;
        });

        it('Should retrieve all environments for a space', async () => {
            const envs = await api.getEnvironments();
            expect(envs.sys.type).toBe('Array');
            envId = envs.items[0].sys.id;
            api.envId = envId;
        });

        it('Should retrieve all content types for an environment', async () => {
            const contentTypes = await api.getContentTypes();
            expect(contentTypes.sys.type).toBe('Array');
            expect(contentTypes.items[0].sys.type).toBe('ContentType');
        });

        it('Should retrieve all content types for an environment', async () => {
            const locales = await api.getLocales();
            expect(locales.sys.type).toBe('Array');
            expect(locales.items[0].sys.type).toBe('Locale');
        });

        it('Should retrieve all entries for an environment', async () => {
            const entries = await api.getEntries();
            expect(entries.sys.type).toBe('Array');
            expect(entries.items[0].sys.type).toBe('Entry');
        });

        it('Should retrieve all published entries for an environment', async () => {
            const entries = await api.getPublishedEntries();
            expect(entries.sys.type).toBe('Array');
            expect(entries.items[0].sys.type).toBe('Entry');
            expect(entries.items[0].sys.publishedVersion).toBeDefined();
        });

        let entryId;
        it('Should create an entry', async () => {
            const response = await api.createEntry(createEntryBody, 'componentSeo');
            expect(response.sys.type).toBe('Entry');
            entryId = response.sys.id;
        });

        it('Should update an entry', async () => {
            const version = 1;
            const response = await api.updateEntry(entryId, updateEntryBody, version);
            expect(response.sys.type).toBe('Entry');
        });

        it('Should JSON+patch an entry', async () => {
            const version = 2;
            const response = await api.jsonPatchEntry(entryId, patchEntryBody, version);
            expect(response.sys.type).toBe('Entry');
        });

        it('Should publish an entry', async () => {
            const version = 3;
            const response = await api.publishEntry(entryId, version);
            expect(response.sys.type).toBe('Entry');
        });

        it('Should unpublish an entry', async () => {
            const version = 4;
            const response = await api.unpublishEntry(entryId, version);
            expect(response.status).toBe(200);
        });

        it('Should delete an entry', async () => {
            const response = await api.deleteEntry(entryId);
            expect(response.status).toBe(204)
        });
    });
});
