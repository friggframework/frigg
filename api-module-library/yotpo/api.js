const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        // Support two different authorization types
        this.apiKey = get(params, 'apiKey');
        this.apiKeySecret = get(params, 'apiKeySecret');

        this.baseUrl = 'https://api.yotpo.com/';

        this.STORE_ID = get(params, 'store_id');
        this.SECRET = get(params, 'secret');

        this.URLs = {
            core: {
                baseUrl: `https://api.yotpo.com/core`,

                createOrderFulfillment: (yotpo_order_id) =>
                    `${this.URLs.core.baseUrl}/v3/stores/${this.STORE_ID}/orders/${yotpo_order_id}/fulfillments`,
            },
            appDeveloper: {
                baseUrl: `https://developers.yotpo.com`,
            },
            UGC: {},
            loyalty: {},
        };

        this.authorizationUri = encodeURI(
            `https://yap.yotpo.com/#/app_market_authorization?app_market_mode&application_id=${this.CLIENT_ID}`
        );
        this.tokenUri = 'https://developers.yotpo.com/v2/oauth2/token';
    }
    async getToken() {
        const options = {
            url: this.authorizationUri,
            method: 'POST',
            body: {
                secret: this.SECRET,
            },
            headers: {},
        };

        const res = await this._request(options.url, options);
        const { access_token } = await res;
        this.setApiKey(access_token);
    }

    async addAuthHeaders(headers) {
        headers['X-Yotpo-Token'] = this.API_KEY_VALUE;
        return headers;
    }

    async createOrderFulfillment(body, yotpo_order_id) {
        const options = {
            url:
                this.baseUrl + this.URLs.createOrderFulfillment(yotpo_order_id),
            headers: {
                'content-type': 'application/json',
            },
            body,
        };

        const res = await this._post(options);
        return res;
    }
}

module.exports = { Api };
