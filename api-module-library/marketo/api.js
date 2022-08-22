const util = require('util');
const { default: OpenAPIClientAxios } = require('openapi-client-axios');
const { Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');
const marketoApiDefinition = require('./marketo-openapi-bulk.json');

const bulkApi = new OpenAPIClientAxios({ definition: marketoApiDefinition });
bulkApi.init();

class Api extends Requester {
    constructor(params) {
        super(params);
        this.DLGT_TOKEN_UPDATE = 'TOKEN_UPDATE';
        this.DLGT_TOKEN_DEAUTHORIZED = 'TOKEN_DEAUTHORIZED';

        this.delegateTypes.push(this.DLGT_TOKEN_UPDATE);
        this.delegateTypes.push(this.DLGT_TOKEN_DEAUTHORIZED);

        this.access_token = get(params, 'access_token', null);
        this.audience = get(params, 'audience', null);

        this.isRefreshable = false;
    }

    getBaseUrl() {
        return util.format(process.env.MARKETO_API_BASE_URL, this.munchkin_id);
    }

    getTokenUrl() {
        return util.format(process.env.MARKETO_API_AUTH_URL, this.munchkin_id);
    }

    async refreshAccessToken() {
        return this.getTokenFromClientCredentials();
    }

    checkExpired(body) {
        const { errors = [], success } = body;
        if (success !== false) return false;
        return errors.some(
            (e) => e.code === '601' || e.code === '602' || e.code === '603'
        );
    }

    async setTokens(params) {
        this.access_token = get(params, 'access_token');
        await this.notify(this.DLGT_TOKEN_UPDATE);
    }

    async addAuthHeaders(headers) {
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }

        return headers;
    }

    isAuthenticated() {
        return this.accessToken !== null;
    }

    async refreshAuth() {
        await this.getTokenFromClientCredentials();
    }

    async getTokenFromClientCredentials() {
        const tokenRes = await this._get({
            url: `${this.getTokenUrl()}/oauth/token`,
            headers: {
                'Content-Type': 'application/json',
            },
            query: {
                grant_type: 'client_credentials',
                client_id: this.client_id,
                client_secret: this.client_secret,
            },
        });

        await this.setTokens(tokenRes);
        return tokenRes;
    }

    async getBulkApiClient() {
        return await bulkApi.getClient();
    }

    async describeLeads() {
        return await this._get({
            url: `${this.getBaseUrl()}/v1/leads/describe2.json`,
        });
    }

    async getLeads() {
        const options = {
            url: `${this.getBaseUrl()}/v1/leads.json`,
            query: {
                filterType: 'email',
                filterValues: 'email',
            },
        };

        return await this._get(options);
    }

    async syncLeads(body) {
        const options = {
            url: `${this.getBaseUrl()}/v1/leads.json`,
            body: body,
        };

        return await this._post(options);
    }

    async removeFromList(listId, itemId) {
        const options = {
            url: `${this.getBaseUrl()}/v1/lists/${listId}/leads.json`,
            query: { id: itemId },
        };

        return await this._delete(options);
    }
}

module.exports = { Api };
