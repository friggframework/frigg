const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        // Support two different authorization types
        this.apiKey = get(params, 'apiKey', null);
        this.apiKeySecret = get(params, 'apiKeySecret', null);

        this.baseUrl = 'https://api.yotpo.com/';

        this.STORE_ID = get(params, 'store_id');
        this.SECRET = get(params, 'secret');
        this.baseURLs = {
            core: 'https://api.yotpo.com/core',
            appDeveloper: `https://developers.yotpo.com`,
            UGC: '',
            loyalty: 'https://api.yotpo.com/',
        };

        this.URLs = {
            core: {
                tokenUri: `${this.baseURLs.core}/v3/stores/${this.STORE_ID}/access_tokens`,

                createOrderFulfillment: (yotpo_order_id) =>
                    `${this.baseURLs.core}/v3/stores/${this.STORE_ID}/orders/${yotpo_order_id}/fulfillments`,
            },
            appDeveloper: {
                authorizationUri: encodeURI(
                    `https://integrations-center.yotpo.com/app/#/install/applications/${this.client_id}?redirect_uri=${this.redirect_uri}`
                ),
                tokenUri: `${this.baseURLs.appDeveloper}/v2/oauth2/token`,
            },
            UGC: {},
            loyalty: {
                tokenUri: `${this.baseURLs.loyalty}/oauth/token`,
            },
        };
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
