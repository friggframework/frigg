const OAuth2Base = require('@friggframework/core/auth/OAuth2Base');
const { FetchError } = require('@friggframework/errors/FetchError');

class IroncladAPI extends OAuth2Base {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://demo.ironcladapp.com';

        this.api_key = get(params, 'api_key', null);

        this.URLs = {
            webhooks: '/public/api/v1/webhooks',
            webhookByID: (webhookId) => `/public/api/v1/webhooks/${webhookId}`
        };
    }

    async addAuthHeaders(headers) {
        if (this.api_key) {
            headers.Authorization = `Bearer ${this.api_key}`;
        }

        return headers;
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
            url: this.baseUrl + this.URLs.exampleEndpont,
        };

        const res = await this._get(options);
        return res;
    }
}

module.exports = IroncladAPI;
