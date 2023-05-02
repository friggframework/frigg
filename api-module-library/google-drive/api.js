const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = '';

        this.URLs = {
            me: '/me',
            exampleEndpoint: '/endpoint',
        };

        this.authorizationUri = encodeURI(
            `https://app.example.com/oauth/authorize?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://app.example.com/oauth/token';

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }

    async getTokenFromCode(code) {
        return this.getTokenFromCodeBasicAuthHeader(code);
    }

    async getTokenIdentity() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };

        const res = await this._get(options);
        return res;
    }

    async exampleRequest() {
        const options = {
            url: this.baseUrl + this.URLs.exampleEndpoint,
        };

        const res = await this._get(options);
        return res;
    }
}

module.exports = { Api };
