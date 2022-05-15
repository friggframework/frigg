const OAuth2Base = require('@friggframework/core/auth/OAuth2Base');
const { FetchError } = require('@friggframework/errors/FetchError');

class FrontAPI extends OAuth2Base {
    constructor(params) {
        super(params);

        this.baseUrl = 'https://api2.frontapp.com';

        this.client_id = process.env.FRONT_CLIENT_ID;
        this.client_secret = process.env.FRONT_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/front`;
        this.scopes = process.env.FRONT_SCOPES;

        this.URLs = {
            me: '/me',
            conversations: '/conversations',
            conversationById: (id) => `/conversations/${id}`,
            contacts: '/contacts',
            contactById: (id) => `/contacts/${id}`,
        };

        this.authorizationUri = encodeURI(
            `https://app.frontapp.com/oauth/authorize?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://app.frontapp.com/oauth/token';

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

    async listConversations() {
        const options = {
            url: this.baseUrl + this.URLs.conversations,
        };

        const res = await this._get(options);
        return res;
    }

    async getConversationById(id) {
        const options = {
            url: this.baseUrl + this.URLs.conversationById(id),
        };

        const res = await this._get(options);
        return res;
    }

    async listContacts(next = null) {
        const options = {
            url: this.baseUrl + this.URLs.contacts,
        };
        if (next) {
            options.url = next;
        }

        const res = await this._get(options);
        return res;
    }

    async getContactById(id) {
        const options = {
            url: this.baseUrl + this.URLs.contactById(id),
        };

        const res = await this._get(options);
        return res;
    }

    async createContact(body) {
        const options = {
            url: this.baseUrl + this.URLs.contacts,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        const res = await this._post(options);
        return res;
    }

    async updateContact(id, body) {
        // Using this._request instead of this._patch because Front endpoint returns 204 no content
        const url = this.baseUrl + this.URLs.contactById(id);
        const options = {
            credentials: 'include',
            method: 'PATCH',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        const response = await this._request(url, options);

        if (response.status === 204) {
            return '';
        }

        throw await FetchError.create({
            resource: url,
            init: options,
            response,
        });
    }

    async deleteContact(id) {
        const options = {
            url: this.baseUrl + this.URLs.contactById(id),
        };

        const res = await this._delete(options);
        return res;
    }
}

module.exports = FrontAPI;
