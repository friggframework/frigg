const { OAuth2Requester } = require('@friggframework/module-plugin');
const crypto = require('crypto');
const { get } = require('@friggframework/assertions');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
let nonce = crypto.randomBytes(16).toString('base64');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.subdomain = 'api.listrak.com';
        this.baseUrl = `https://${this.subdomain}/crosschannel/v1/`;

        this.client_id = process.env.LISTRAK_CLIENT_ID;
        this.client_secret = process.env.LISTRAK_CLIENT_SECRET;
        this.scopes = process.env.LISTRAK_SCOPES;
        this.redirect_uri = `???`;

        this.URLs = {
            getAccountDetails: '/api/account',
            tickets: '/api/tickets',
            ticketsById: (id) => `/api/tickets/${id}`,
            customers: '/api/customers',
            customersById: (id) => `/api/customers/${id}`,
            integrations: '/api/integrations',
            integrationsById: (id) => `/api/integrations/${id}`,
            widgets: '/api/widgets',
            widgetsById: (id) => `/api/widgets/${id}`,
            upload: '/api/upload',
        };

        this.authorizationUri = encodeURI(`???`);
        this.tokenUri = `https://${this.subdomain}/OAuth2/Token`;

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }

    async addAuthHeaders(headers) {
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }
        return headers;
    }

    async setAccessToken(accessToken) {
        this.access_token = accessToken;
    }

    setSubdomain(subdomain) {
        this.subdomain = subdomain;
        this.baseUrl = `https://${this.subdomain}.listrak.com`;
        this.tokenUri = `https://${this.subdomain}/OAuth2/Token`;
        this.resetRedirect();
    }
    resetRedirect() {
        this.redirect_uri = `${process.env.REDIRECT_URI}/listrak?account=${this.subdomain}`;
    }

    getAuthUri() {
        return this.authorizationUri;
    }

    async refreshAccessToken(refreshTokenObject) {
        this.access_token = undefined;
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.client_id);
        params.append('refresh_token', refreshTokenObject.refresh_token);
        params.append('redirect_uri', this.redirect_uri);

        const options = {
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${this.client_id}:${this.client_secret}`
                ).toString('base64')}`,
            },
            url: this.tokenUri,
        };
        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    // *********************** Api Requests You Want to Expose *********************** //

    async getAccountDetails() {
        const res = await this._get({
            url: `${this.baseUrl}${this.URLs.getAccountDetails}`,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return res;
    }
}

module.exports = { Api };
