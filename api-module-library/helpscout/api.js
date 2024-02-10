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
            customers: '/v2/customers',
            deleteCustomerById: (customerId) => `/v2/customers/${customerId}`,
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

    // **************************   User (me)   **********************************
    async getUserDetails() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };

        return this._get(options);
    }

    // **************************   Customers   **********************************
    async listCustomers() {
        const options = {
            url: this.baseUrl + this.URLs.customers,
        };

        return this._get(options);
    }

    async createCustomer(body) {
        const options = {
            url: this.baseUrl + this.URLs.customers,
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            returnFullRes: true
        };

        return this._post(options);
    }

    async deleteCustomer(id){
        const options = {
            url: `${this.baseUrl}${this.URLs.deleteCustomerById(id)}`,
        };
        return this._delete(options);
    }
    
    // **************************   Conversations   **********************************

    async listConversations() {
        const options = {
            url: this.baseUrl + this.URLs.conversations,
        };

        return this._get(options);
    }

    // **************************   Mailboxes   **********************************

    async listMailboxes() {
        const options = {
            url: this.baseUrl + this.URLs.mailboxes,
        };

        return this._get(options);
    }
}

module.exports = { Api };
