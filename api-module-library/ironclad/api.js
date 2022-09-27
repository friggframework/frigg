const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.baseUrl = '';

        this.client_id = process.env.IRONCLAD_CLIENT_ID;
        this.client_secret = process.env.IRONCLAD_CLIENT_SECRET;
        this.redirect_uri = `${process.env.IRONCLAD_REDIRECT_URI}`;
        this.scopes = process.env.IRONCLAD_SCOPE;

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
