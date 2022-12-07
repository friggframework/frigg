const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.API_KEY_VALUE;

        this.baseUrl = 'https://api.yotpo.com/core';

        this.STORE_ID = get(params, 'store_id');
        this.SECRET = get(params, 'secret');

        this.URLs = {
            createOrderFulfillment: (yotpo_order_id) =>
                `/v3/stores/${this.STORE_ID}/orders/${yotpo_order_id}/fulfillments`,
        };

        this.authorizationUri = encodeURI(
            `https://api.yotpo.com/core/v3/stores/${this.STORE_ID}/access_tokens`
        );
        this.tokenUri = 'https://app.example.com/oauth/token';
    }
    //Overwrites the request method.
    async _request(url, options, i = 0) {
        let encodedUrl = encodeURI(url);
        if (options.query) {
            let queryBuild = '?';
            for (const key in options.query) {
                queryBuild += `${encodeURIComponent(key)}=${encodeURIComponent(
                    options.query[key]
                )}&`;
            }
            encodedUrl += queryBuild.slice(0, -1);
        }

        options.headers = await this.addAuthHeaders(options.headers);

        const response = await this.fetch(encodedUrl, options);
        const { status } = response;

        // If the status is retriable and there are back off requests left, retry the request
        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
            //If the status is 401, run getToken method. -JM
        } else if (status === 401) {
            await this.getToken;
        }

        // If the error wasn't retried, throw.
        if (status >= 400) {
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                response,
            });
        }

        return options.returnFullRes
            ? response
            : await this.parsedBody(response);
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
        const { access_token } = await res.json();
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
