const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.cachedUserData = undefined
        this.expires_in = get(params, 'expires_in', null);
        this.created_at = get(params, 'created_at', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.token_type = get(params, 'token_type', 'bearer');
        this.access_token = get(params, 'access_token', null);
        this.base_url = get(params, 'base_url', 'https://gitlab.com');
        this.URLs = {
            me: '/api/v4/user',
            getProjects: (userId) => `/api/v4/users/${userId}/projects`,
            getProjectIssues: (projectId) => `/api/v4/projects/${projectId}/issues`,
            createProjectIssue: (projectId, searchParams) => `/api/v4/projects/${projectId}/issues?${searchParams.toString()}`,
            deleteProjectIssue: (projectId, issueIid) => `/api/v4/projects/${projectId}/issues/${issueIid}`,
        };
    }

    get tokenUri() {
        return `${this.base_url}/oauth/token`
    }

    getAuthorizationUri() {
        const searchParams = new URLSearchParams([
            ['client_id', this.client_id],
            ['redirect_uri', this.redirect_uri],
            ['scope', this.scope],
            ['response_type', 'code']
        ]);
        return `${this.base_url}/oauth/authorize?${searchParams.toString()}`;
    }

    async setTokens(params) {
        this.token_type = get(params, 'token_type', 'bearer');
        this.created_at = get(params, 'created_at', Date.now());
        this.expires_in = get(params, 'expires_in', Infinity);
        await super.setTokens(params);
    }

    async getTokenFromCode(code) {
        const body = new URLSearchParams([
            ['client_id', this.client_id],
            ['client_secret', this.client_secret],
            ['code', code],
            ['grant_type', 'authorization_code'],
            ['redirect_uri', this.redirect_uri]
        ]);
        const options = {
            body: body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Accept': 'application/json',
            },
            url: this.tokenUri,
        };

        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    getDefaultHeaders() {
        return {
            'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    }

    async getUserDetails() {
        const options = {
            headers: this.getDefaultHeaders(),
            url: this.base_url + this.URLs.me,
        };

        const response = await this._get(options);
        this.userId = response.id;
        return response;
    }

    async getTokenIdentity() {
        const userInfo = await this.getUserDetails();
        return { identifier: userInfo.id, name: userInfo.username }
    }

    /** 
     * Gets all of the repositories/projects for the user
     * 
     * @returns {Promise<import('./types').Project[]>} - An array of projects of the current logged user.
     */
    async getProjects() {
        const userData = await this.getUserDetails();

        const options = {
            headers: this.getDefaultHeaders(),
            url: this.base_url + this.URLs.getProjects(userData.id),
        }
        return this._get(options);
    }

    /**
     * Gets all of the issues for a project by its id
     * 
     * @param {`${number}` | number} projectId - The id of the project to get the issues for.
     * 
     * @returns {Promise<import('./types').Issues[]>} - An array of issues for the project.
     */
    async getProjectIssues(projectId) {
        const options = {
            headers: this.getDefaultHeaders(),
            url: this.base_url + this.URLs.getProjectIssues(projectId),
        }
        return this._get(options);
    }

    /**
     * Creates a new issue for a project by its id
     * 
     * @param {`${number}` | number} projectId - The id of the project to create the issue for.
     * @param {import('./types').CreateIssue} data - The data to create the issue.
     * 
     * @returns {Promise<import('./types').Issues>} - The created issue.
     */
    async createProjectIssue(projectId, data) {
        if (Array.isArray(data.labels)) {
            data.labels = data.labels.join(',');
        }

        const searchParams = new URLSearchParams(data);

        const options = {
            headers: this.getDefaultHeaders(),
            url: this.base_url + this.URLs.createProjectIssue(projectId, searchParams),
        }
        return this._post(options);
    }

    /**
     * Deletes an issue for a project by its id
     * 
     * @param {`${number}` | number} projectId - The id of the project to delete the issue for.
     * @param {`${number}` | number} issueIid - The iid of the issue to delete.
     * 
     * @returns {Promise<void>} - Returns nothing.
     */
    async deleteProjectIssue(projectId, issueIid) {
        const options = {
            headers: this.getDefaultHeaders(),
            url: this.base_url + this.URLs.deleteProjectIssue(projectId, issueIid),
        }
        const response = await this._delete(options);

        return response.status === 204 ? true : false;
    }

}

module.exports = { Api };
