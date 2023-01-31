const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');
const probe = require('probe-image-size');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
        // Parent class already expects
        // client_id, client_secret, redirect_uri, scope to be passed in
        // Storing and passing in the above should be the responsibility of the
        // caller/developer importing this/any api class.

        // Setting to 'common'  by default since that's the most likely tenant we'll want/need
        this.tenant_id = get(params, 'tenant_id', 'common');
        this.state = get(params, 'state', null);
        this.forceConsent = get(params, 'forceConsent', true);

        this.URLs = {
            userDetails: '/me', //https://graph.microsoft.com/v1.0/me
            orgDetails: `/organization`,
        };

        this.authorizationUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/authorize`;

        this.tokenUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/token`;
    }
    async getAuthUri() {
        const query = {
            client_id: this.client_id,
            response_type: 'code',
            redirect_uri: this.redirect_uri,
            scope: this.scope,
            state: this.state,
        };
        if (this.forceConsent) query.prompt = 'consent';

        return `${this.authorizationUri}?${querystring.stringify(query)}`;
    }
    // Method to retrieve user details using the this.URLs.userDetails endpoint
    async getUser() {
        const options = {
            url: `${this.baseUrl}${this.URLs.userDetails}`,
        };
        const response = await this._get(options);
        return response;
    }
    async getOrganization() {
        const options = {
            url: `${this.baseUrl}${this.URLs.orgDetails}`,
        };
        const response = await this._get(options);
        return response.value[0];
    }
}

module.exports = { Api };
