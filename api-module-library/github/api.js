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
            me: '/user'
        };
        this.authorizationUri = encodeURI(
            `https://app.example.com/oauth/authorize?response_type=code` +
            `&scope=${this.scopes}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}`
        );
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

    async getUserDetails() {
        const hasCachedData = this.cachedUserData &&
            this.cachedUserData.expires > Date.now() &&
            this.cachedUserData.accessToken === this.access_token &&
            this.cachedUserData.tokenType === this.token_type;
        if (hasCachedData) {
            return this.cachedUserData.data;
        }

        const options = {
            headers: {
                'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.baseUrl + this.URLs.me,
        };
        const response = await this._get(options);
        this.cachedUserData = {
            data: response,
            expires: Date.now() + 1000 * 60 * 60
        };
        return response;
    }

    async getTokenIdentity() {
        const userInfo = await this.getUserDetails();
        return { identifier: userInfo.id, name: userInfo.name }
    }

    async getRepos() {
        const userData = await this.getUserDetails();
        if (userData.repos_url) {
            const options = {
                headers: {
                    'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                url: userData.repos_url,
            };
            return this._get(options);
        }
        return [];
    }
}

module.exports = { Api };
