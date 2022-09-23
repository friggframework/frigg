const OAuth2Base = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
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

    async exampleRequest() {
        const options = {
            url: this.baseUrl + this.URLs.exampleEndpont,
        };

        const res = await this._get(options);
        return res;
    }
}

module.exports = { Api };
