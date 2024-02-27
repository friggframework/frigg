const { get, OAuth2Requester } = require('@friggframework/core');


class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.access_token = get(params, 'access_token', null);
        // consider setting backOff as refreshAuth request gets a 500 with bad token
        this.backOff = [1, 3];
        this.baseUrl = 'https://api-staging.letsdeel.com/rest/v1';
        this.endpoints = {
            listPeople: '/people',
            getPerson: (id) => `/people/${id}`,
            webhooks: '/webhooks',
            webhookById: (id) => `/webhooks/${id}`,
            webhookEventTypes: '/webhooks/events/types',
            organizations: '/organizations'
        }
        this.URLs = {}
        this.generateUrls();
        this.state = 'STATE';
        this.authorizationUri = encodeURI(
            // PROD
            // `https://app.deel.com/oauth2/authorize?response_type=code` +
            // SANDBOX
            `https://demo.letsdeel.com/oauth2/authorize?response_type=code` +
            `&scope=${this.scope}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}` +
            `&state=${this.state}`
        )
        // PROD
        // this.tokenUri = 'https://auth.letsdeel.com/oauth2/tokens';
        //SANDBOX
        this.tokenUri = 'https://auth-demo.letsdeel.com/oauth2/tokens';
    }

    generateUrls() {
        for (const key in this.endpoints) {
            if (this.endpoints[key] instanceof Function) {
                this.URLs[key] = (...params) => this.baseUrl + this.endpoints[key](...params)
            } else {
                this.URLs[key] = this.baseUrl + this.endpoints[key];
            }
        }
    }

    async refreshAccessToken(refreshTokenObject) {
        this.access_token = undefined;
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshTokenObject.refresh_token);
        params.append('redirect_uri', this.redirect_uri);

        const options = {
            body: params,
            url: this.tokenUri,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${this.client_id}:${this.client_secret}`
                ).toString('base64')}`,
            },
        };
        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    // API METHODS

    async getOrganization() {
        const options = {
            url: this.URLs.organizations
        }
        return this._get(options);
    }

    async getTokenIdentity() {
        const org = await this.getOrganization();
        return {name: org.data[0].name, id: org.data[0].id};
    }

    async listPeople(query) {
        const options = {
            url: this.URLs.listPeople,
            query,
        };
        return this._get(options);
    }

    async getPerson(id) {
        const options = {
            url: this.URLs.getPerson(id)
        }
        return this._get(options);
    }

    async listWebhooks() {
        const options = {
            url: this.URLs.webhooks
        }
        return this._get(options);
    }

    async getWebhook(id) {
        const options = {
            url: this.URLs.webhookById(id)
        }
        return this._get(options);
    }

    async createWebhook(webhookDefinition) {
        const options = {
            url: this.URLs.webhooks,
            headers: {
                'Content-Type': 'application/json',
            },
            body: webhookDefinition
        }
        return this._post(options);
    }

    async updateWebhook(id, partialWebhookDefinition) {
        const options = {
            url: this.URLs.webhookById(id),
            headers: {
                'Content-Type': 'application/json',
            },
            body: partialWebhookDefinition
        }
        return this._patch(options);
    }

    async deleteWebhook(id) {
        const options = {
            url: this.URLs.webhookById(id)
        }
        return this._delete(options);
    }

    async listWebhookEventTypes(){
        const options = {
            url: this.URLs.webhookEventTypes
        }
        return this._get(options);
    }
}

module.exports = { Api };
