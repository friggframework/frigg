const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.cachedUserData = undefined
        this.scope = get(params, 'scope', 'user');
        this.token_type = get(params, 'token_type', 'bearer');
        this.access_token = get(params, 'access_token', null);

        this.baseUrl = 'https://api.github.com';
        this.meUrl = 'https://api.github.com/user'
        this.URLs = {
            me: '/user',
            getIssues: (owner, repoName) => `/repos/${owner}/${repoName}/issues`,
            getIssue: (owner, repoName, issueNumber) => `/repos/${owner}/${repoName}/issues/${issueNumber}`
        };
        this.tokenUri = 'https://github.com/login/oauth/access_token';
    }

    getAuthorizationUri() {
        const searchParams = new URLSearchParams([[
            'client_id', this.client_id
        ], [
            'redirect_uri', this.redirect_uri
        ], [
            'scope', this.scope
        ]]);
        return `https://github.com/login/oauth/authorize?${searchParams.toString()}`;
    }

    async getTokenFromCode(code) {
        const options = {
            body: {
                client_id: this.client_id,
                client_secret: this.client_secret,
                code: code,
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.tokenUri,
        };
        const response = await this._post(options, true);
        await this.setTokens(response);
        return response;
    }

    /**
     * Retrieves the authenticated user details from the API.
     * 
     * @returns {Promise<import('./types').User>} - The user data. We use that to get the urls to fetch to retrieve that that is assigned to the user.
     */
    async getUserDetails() {
        const options = {
            headers: {
                'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.baseUrl + this.URLs.me,
        };
        return await this._get(options);;
    }

    async getDefaultHeaders() {
        return {
            'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    }

    async getTokenIdentity() {
        const userInfo = await this.getUserDetails();
        return { identifier: userInfo.id, name: userInfo.name }
    }

    /**
     * Retrieves all repositories for the authenticated user.
     *
     * @returns {Promise<import('./types').Repository[]>} - All of the repositories found for the user.
     */
    async getRepos() {
        const userData = await this.getUserDetails();
        if (userData.repos_url) {
            const options = {
                headers: this.getDefaultHeaders(),
                url: userData.repos_url,
            };
            return this._get(options);
        }
        return [];
    }

    /**
     * Retrieves all issues from a repository.
     *
     * @param {string} owner The account owner of the repository. The name is not case sensitive.
     * @param {string} repoName - The name of the repository without the .git extension. The name is not case sensitive.
     * 
     * @returns {Promise<import('./types').Issue[]>} - All of the issues found in the repository.
     */
    async getIssues(owner, repoName) {
        const options = {
            headers: this.getDefaultHeaders(),
            url: `${this.baseUrl}${this.URLs.getIssues(owner, repoName)}`,
        };
        return this._get(options);
    }

    /**
     * Retrieves a single issue from a repository.
     * 
     * @param {string} owner The account owner of the repository. The name is not case sensitive.
     * @param {string} repoName - The name of the repository without the .git extension. The name is not case sensitive.
     * @param {string} issueNumber - The number that identifies the issue. Usually you will find this right after the issue title for example: "Issue Title #123" #123 is the issue number
     * 
     * @returns {Promise<import('./types').Issue>} - The found issue by it's id.
     */
    async getIssue(owner, repoName, issueNumber) {
        const options = {
            headers: this.getDefaultHeaders(),
            url: `${this.baseUrl}${this.URLs.getIssue(owner, repoName, issueNumber)}`,
        };
        return this._get(options);
    }

    /**
     * Updates an existing issue.
     * 
     * @param {string} owner The account owner of the repository. The name is not case sensitive.
     * @param {string} repoName - The name of the repository without the .git extension. The name is not case sensitive.
     * @param {string} issueNumber - The number that identifies the issue. Usually you will find this right after the issue title for example: "Issue Title #123" #123 is the issue number
     * @param {object} data - The data to update the issue with
     * @param {string | null | number} [data.title=undefined] - The title of the issue 
     * @param {string | null} [data.body=undefined] - The body of the issue
     * @param {string | null} [data.state_reason=undefined] - The reason for the state change. Ignored unless state is changed.
     * @param {string | null} [data.milestone=undefined] - The `number` of the milestone to associate this issue with or use `null` to remove the current milestone. 
     * Only users with push access can set the milestone for issues. Without push access to the repository, milestone changes are silently dropped.
     * @param {string[]} [data.labels=undefined] - Labels to associate with this issue. Pass one or more labels to replace the set of labels on this issue. Send an empty array ([]) to clear all 
     * labels from the issue. Only users with push access can set labels for issues. Without push access to the repository, label changes are silently dropped.
     * @returns {Promise<import('./types').Issue>} - The updated issue.
     */
    async updateIssue(owner, repoName, issueNumber, data) {
        const options = {
            body: data,
            headers: this.getDefaultHeaders(),
            url: `${this.baseUrl}${this.URLs.getIssue(owner, repoName, issueNumber)}`,
        };
        return this._patch(options);
    }
}

module.exports = { Api };
