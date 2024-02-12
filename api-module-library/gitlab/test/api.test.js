require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Gitlab API Tests', () => {
    const apiParams = {
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/gitlab`,
        scope: process.env.GITLAB_SCOPE,
        base_url: process.env.GITLAB_BASE_URL,
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
        if (typeof process.env.TEST_REPO_ID !== 'string') {
            throw new Error('Please provide a test repository for the tests with the environment variable TEST_REPO_ID with the id of the project');
        }
        // Note: Bring back the authorization_code flow to test refreshing a token
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCode(response.data.code);
    });

    describe('OAuth Flow Tests', () => {
        it('Should generate a token', async () => {
            expect(api.access_token).toBeTruthy();
        });
    });

    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
        });

        it('Should retrieve information about the token', async () => {
            const tokenDetails = await api.getTokenIdentity();
            expect(tokenDetails.identifier).toBeDefined();
        });
    });

    describe('Projects Test', () => {
        it('Should get all projects', async () => {
            const projects = await api.getProjects();
            expect(projects).toBeDefined();
        });
    });

    describe('Issues Test', () => {
        const descriptionOfIssue = 'Test issue description';
        const titleOfIssue = 'Test issue';
        /** @type {import('../types').Issues[] | undefined} */
        let issues;
        /** @type {import('../types').Issues | undefined} */
        let issueCreated;

        beforeAll(async () => {
            issueCreated = await api.createProjectIssue(process.env.TEST_REPO_ID, {
                title: titleOfIssue,
                description: descriptionOfIssue,
            });
            issues = await api.getProjectIssues(process.env.TEST_REPO_ID);
        });

        it('Should get all issues', async () => {
            if (!issues) return;

            expect(Array.isArray(issues)).toBe(true);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].title).toBeDefined();
            expect(issues[0].id).toBeDefined();
        });

        it('Should create an issue', async () => {
            if (!issueCreated) return

            expect(issueCreated.description).toBe(descriptionOfIssue);
            expect(issueCreated.title).toBe(titleOfIssue);
        });

        it('Should delete an issue', async () => {
            if (!issueCreated) return
            const deleteResponse = await api.deleteProjectIssue(process.env.TEST_REPO_ID, issueCreated.iid);
            expect(deleteResponse).toBe(true);
        });
    })
});
