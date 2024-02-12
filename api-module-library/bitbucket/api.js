const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.cachedUserData = undefined
        this.expires_in = get(params, 'expires_in', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.access_token = get(params, 'access_token', null);
        this.URLs = {
            me: '/2.0/user',
            publicRepos: `/2.0/repositories`
        };
        this.base_url = 'https://api.bitbucket.org'
        this.authorizationUri = encodeURI(`https://bitbucket.org/site/oauth2/authorize?client_id=${this.client_id}&response_type=code`);
        this.tokenUri = 'https://bitbucket.org/site/oauth2/access_token';
    }

    async setTokens(params) {
        this.expires_in = get(params, 'expires_in', Infinity);
        await super.setTokens(params);
    }

    async getTokenFromCode(code) {
        const body = new URLSearchParams([
            ['code', code],
            ['grant_type', 'authorization_code'],
        ]);
        const options = {
            body: body,
            headers: {
                'Authorization': `Basic ${Buffer.from(`${this.client_id}:${this.client_secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            url: this.tokenUri,
        };

        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    async refreshAccessToken(refreshTokenObject) {
        this.access_token = undefined;
        const params = new URLSearchParams([
            ['grant_type', 'refresh_token'],
            ['refresh_token', refreshTokenObject.refresh_token]
        ]);

        const options = {
            body: params,
            headers: {
                'Authorization': `Basic ${Buffer.from(`${this.client_id}:${this.client_secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            url: this.tokenUri,
        };
        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    /**
     * Gets the current logged user data.
     * 
     * @returns {Promise<import('./types').CurrentUser>} - The current user data.
     */
    async getUserDetails() {
        const options = {
            headers: {
                'Authorization': `${(this.token_type || '')} ${this.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.base_url + this.URLs.me,
        };

        const response = await this._get(options);
        this.userId = response.id;
        return response;
    }

    async getTokenIdentity() {
        const userInfo = await this.getUserDetails();
        return { identifier: userInfo.uuid, name: userInfo.username }
    }

    /**
     * Gets all public repositories the user has access to or is able to see.
     * 
     * @param {import('./types').PublicRepositoriesQueryParams | undefined} params - The query parameters to filter the repositories.
     * 
     * @returns {Promise<import('./types').PublicRepositoriesResponse>} The response from the API is paginated, so make sure to handle that on your api.
     */
    async getPublicRepos(params) {
        const options = {
            headers: {
                'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.base_url + this.URLs.publicRepos,
            query: params
        }
        return this._get(options);
    }
}

module.exports = { Api };
