require('dotenv').config();
const { Api } = require('../api');
const { Authenticator } = require('@friggframework/devtools');

describe('Linear API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        client_id: process.env.LINEAR_CLIENT_ID,
        client_secret: process.env.LINEAR_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/linear`,
        scope: process.env.LINEAR_SCOPE,
        actor: process.env.LINEAR_ACTOR,
        access_token: process.env.LINEAR_ACCESS_TOKEN
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCode(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an tokens', async () => {
            expect(api.access_token).toBeTruthy();
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUser();
            expect(user).toBeDefined();
        });
        it('Should retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            expect(org).toBeDefined();
        });
    });

    describe('Other requests', () => {
        it('Should retrieve all users', async () => {
            const users = await api.getUsers();
            expect(users).toBeDefined();
        });
        it('Should all issues for me', async () => {
            const user = await api.getUser();
            const issues = await api.getUserIssues(user);
            expect(issues).toBeDefined();
        });
        it('Should get all projects', async () => {
            const user = await api.getUser();
            const projects = await api.getProjects();
            expect(projects).toBeDefined();
        });
    });

});
