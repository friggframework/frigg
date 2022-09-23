const { OAuth2Requester } = require('@friggframework/module-plugin');
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

    async listWebhooks() {
        const options = {
            url: this.baseUrl + this.URLs.webhooks,
        };
        const response = await this._get(options);
        return response;
    }

    async createWebhook(events, targetURL) {
        const options = {
            url: this.baseUrl + this.URLs.webhooks,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                events,
                targetURL
            }
        };
        const response = await this._post(options);
        return response;
    }

    async updateWebhook(webhookId, events = null, targetURL = null) {
        const options = {
            url: this.baseUrl + this.URLs.webhookByID(webhookId),
            headers: {
                'content-type': 'application/json',
            },
            body: {}
        }

        if (events.length > 0) {
            options.body.events = events;
        }

        if (targetURL) {
            options.body.targetURL = targetURL;
        }

        const response = await this._patch(options);
        return response;

    }
    async deleteWebhook(webhookId) {
        const options = {
            url: this.baseUrl + this.URLs.webhookByID(webhookId)
        }
        const response = await this._delete(options);
        return response;
    }
}

module.exports = { Api };
