require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('Github API Tests', () => {
    const apiParams = {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/github`,
        scope: process.env.GITHUB_SCOPE,
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
        if (typeof process.env.TEST_REPO !== 'string' && process.env.TEST_REPO.split('/') === 2) {
            throw new Error('Please provide a test repository for the tests with the environment variable TEST_REPO, in the format owner/repoName');
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

    describe('Repositories Test', () => {
        it('Should get all repositories', async () => {
            const repos = await api.getRepos();
            expect(repos).toBeDefined();
        });
    });

    describe('Issues Test', () => {
        const [owner, repoName] = process.env.TEST_REPO.split('/');
        let issues;
        beforeEach(async () => {
            issues = await api.getIssues(owner, repoName);
        });

        it('Should get all issues', async () => {
            if (!issues) return;
            expect(Array.isArray(issues)).toBe(true);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].title).toBeDefined();
            expect(issues[0].number).toBeDefined();
        });

        it('Should get a single issue', async () => {
            if (!issues) return;
            const issue = await api.getIssue(owner, repoName, issues[0].number);

            expect(issue).toBeDefined();
            expect(issue.title).toBeDefined();
            expect(issue.number).toBeDefined();
        });

        it('Should update the issue', async () => {
            if (!issues) return;
            const originalTitle = issues[0].title;
            const originalBody = issues[0].body;

            const newTitle = 'New title';
            const newBody = 'New body';
            const issue = await api.updateIssue(owner, repoName, issues[0].number, {
                title: 'New title',
                body: 'New body',
            });

            expect(issue).toBeDefined();
            expect(issue.title).not.toEqual(originalTitle);
            expect(issue.title).toEqual(newTitle);
            expect(issue.body).not.toEqual(originalBody);
            expect(issue.body).toEqual(newBody);

            // Reset the issue
            await api.updateIssue(owner, repoName, issues[0].number, {
                title: originalTitle,
                body: originalBody,
            });
        });
    })
});
