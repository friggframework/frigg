const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');
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

        // Assuming team id as a param for now
        this.team_id = get(params, 'team_id', null);

        this.URLs = {
            userDetails: '/me', //https://graph.microsoft.com/v1.0/me
            orgDetails: '/organization',
            createChannel: `/teams/${this.team_id}/channels`,
            channel: (channelId) => `/teams/${this.team_id}/channels/${channelId}/`,
            channelMembers: (channelId) => `/teams/${this.team_id}/channels/${channelId}/members`
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
            url: `${this.baseUrl}${this.URLs.userDetails}`
        };
        const response = await this._get(options);
        return response;
    }
    async getOrganization() {
        const options = {
            url: `${this.baseUrl}${this.URLs.orgDetails}`
        };
        const response = await this._get(options);
        return response.value[0];
    }

    async createChannel(body){
        const options = {
            url : `${this.baseUrl}${this.URLs.createChannel}`,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }
        };
        const response = await this._post(options);
        return response;
    }

    async deleteChannel(channelId){
        const options = {
            url : `${this.baseUrl}${this.URLs.channel(channelId)}`,
        };
        const response = await this._delete(options);
        return response;
    }

    async addUserToChannel(channelId, user){
        const options = {
            url : `${this.baseUrl}${this.URLs.channelMembers(channelId)}`,
            body: user,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }
        };
        const response = await this._post(options);
        return response;
    }
}

module.exports = { Api };
