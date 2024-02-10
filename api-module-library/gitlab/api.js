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
            getRepos: (userId) => `/api/v4/users/${userId}/projects`
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
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'LeftHook/1.0'
            },
            url: this.tokenUri,
        };

        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

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
        return { identifier: userInfo.id, name: userInfo.username }
    }

    async getRepos() {
        const userData = await this.getUserDetails();
        //const [userData, token] = await Promise.all([this.getUserDetails(), this.getAccessTokenAndTokenType()]);
        const options = {
            headers: {
                'Authorization': `${(this.token_type || '').toUpperCase()} ${this.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            url: this.base_url + this.URLs.getRepos(userData.id),
        }
        return this._get(options);
    }
}

module.exports = { Api };
