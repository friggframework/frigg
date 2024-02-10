const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        // The majority of the properties for OAuth are default loaded by OAuth2Requester.
        // This includes the `client_id`, `client_secret`, `scopes`, and `redirect_uri`.
        this.baseUrl = 'https://api.helpscout.net';

        this.URLs = {
            me: '/v2/users/me',
            conversations: '/v2/conversations',
            mailboxes: '/v2/mailboxes',
            // contactById: (contactId) => `/crm/v3/objects/contacts/${contactId}`,
        };

        this.authorizationUri = encodeURI(
            `https://secure.helpscout.net/authentication/authorizeClientApplication?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scope}&state=${this.state}`
        );
        this.tokenUri = 'https://api.helpscout.net/v2/oauth2/token';

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }

    getAuthUri() {
        return this.authorizationUri;
    }

    // **************************   Companies   **********************************

    // async createCompany(body) {
    //     const options = {
    //         url: this.baseUrl + this.URLs.companies,
    //         body: {
    //             properties: body,
    //         },
    //         headers: {
    //             'Content-Type': 'application/json',
    //             Accept: 'application/json',
    //         },
    //     };

    //     return this._post(options);
    // }
    
    async getUserDetails() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };

        return this._get(options);
    }

    async listConversations() {
        const options = {
            url: this.baseUrl + this.URLs.conversations,
        };

        return this._get(options);
    }

    async listMailboxes() {
        const options = {
            url: this.baseUrl + this.URLs.mailboxes,
        };

        return this._get(options);
    }    

    // async updateCompany(id, body) {
    //     const options = {
    //         url: this.baseUrl + this.URLs.companyById(id),
    //         body,
    //         headers: {
    //             'Content-Type': 'application/json',
    //             Accept: 'application/json',
    //         },
    //     };
    //     return this._patch(options);
    // }
}

module.exports = { Api };
