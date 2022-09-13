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
        this.subdomain = get(params, 'subdomain', '{{subdomain}}');
        this.baseUrl = `https://${this.subdomain}.gorgias.com`;

        this.client_id = process.env.GORGIAS_CLIENT_ID;
        this.client_secret = process.env.GORGIAS_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/gorgias?account=${this.subdomain}`;
        // this.redirect_uri = `https://www.example.com/redirect/gorgias?account=${this.subdomain}`;
        // this.redirect_uri = `https://demo-staging.friggframework.org/redirect/gorgias?account=${this.subdomain}`;
        this.scopes = process.env.GORGIAS_SCOPES;

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

        this.authorizationUri = encodeURI(
            // `${this.baseUrl}/oauth/authorize?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scopes}&state=kxzcjhvwaasdbnfrtlkxu9ih&nonce=asdhaviopnawerfbsdnsfadkgfho`
            `https://{{subdomain}}.gorgias.com/oauth/authorize?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scopes}&state=kxzcjhvwaasdbnfrtlkxu9ih&nonce=${nonce}`
        );
        this.tokenUri = `${this.baseUrl}/oauth/token`;

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
        this.baseUrl = `https://${this.subdomain}.gorgias.com`;
        this.tokenUri = `${this.baseUrl}/oauth/token`;
        this.resetRedirect();
    }
    resetRedirect() {
        this.redirect_uri = `${process.env.REDIRECT_URI}/gorgias?account=${this.subdomain}`;
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

    // *********************** Requests *********************** //

    async getAccountDetails() {
        const res = await this._get({
            url: `${this.baseUrl}${this.URLs.getAccountDetails}`,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return res;
    }

    // *********************** Tickets *********************** //

    async createTicket(body) {
        const options = {
            url: this.baseUrl + this.URLs.tickets,
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._post(options);
    }

    async deleteTicket(ticketId) {
        const options = {
            url: this.baseUrl + this.URLs.ticketById(ticketId),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._delete(options);
    }

    async getTicketById(ticketId) {
        const options = {
            url: this.baseUrl + this.URLs.ticketById(ticketId),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._get(options);
    }

    async listTickets(query) {
        const options = {
            url: this.baseUrl + this.URLs.tickets,
            headers: {
                'Content-Type': 'application/json',
            },
            query: query || {},
        };
        return this._get(options);
    }

    async updateTicket(ticketId, body) {
        const options = {
            url: this.baseUrl + this.URLs.ticketsById(ticketId),
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        return this._put(options);
    }

    // *********************** Customers *********************** //

    async createCustomer(body) {
        const options = {
            url: this.baseUrl + this.URLs.customers,
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        return this._post(options);
    }

    async deleteCustomer(customerId) {
        const options = {
            url: this.baseUrl + this.URLs.customersById(customerId),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._delete(options);
    }

    async getCustomerById(customerId) {
        const options = {
            url: this.baseUrl + this.URLs.customersById(customerId),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._get(options);
    }

    async listCustomers(query) {
        const options = {
            url: this.baseUrl + this.URLs.customers,
            headers: {
                'Content-Type': 'application/json',
            },
            query: query || {},
        };
        return this._get(options);
    }

    async updateCustomer(customerId, body) {
        const options = {
            url: this.baseUrl + this.URLs.customersById(customerId),
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        return this._put(options);
    }

    // *********************** Integrations *********************** //

    async createIntegration(body) {
        const options = {
            url: this.baseUrl + this.URLs.integrations,
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        const res = await this._post(options);
        return res;
    }

    async deleteIntegration(id) {
        const options = {
            url: this.baseUrl + this.URLs.integrationsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._delete(options);
    }

    async getIntegrationById(id) {
        const options = {
            url: this.baseUrl + this.URLs.integrationsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._get(options);
    }

    async listIntegrations(query) {
        const options = {
            url: this.baseUrl + this.URLs.integrations,
            headers: {
                'Content-Type': 'application/json',
            },
            query: query || {},
        };
        return this._get(options);
    }

    async updateIntegration(id, body) {
        const options = {
            url: this.baseUrl + this.URLs.integrationsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        return this._put(options);
    }

    // *********************** Widgets *********************** //

    async createWidget(body) {
        const options = {
            url: this.baseUrl + this.URLs.widgets,
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        const res = await this._post(options);
        return res;
    }

    async deleteWidget(id) {
        const options = {
            url: this.baseUrl + this.URLs.widgetsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._delete(options);
    }

    async getWidgetById(id) {
        const options = {
            url: this.baseUrl + this.URLs.widgetsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._get(options);
    }

    async listWidgets(query) {
        const options = {
            url: this.baseUrl + this.URLs.widgets,
            headers: {
                'Content-Type': 'application/json',
            },
            query: query || {},
        };
        return this._get(options);
    }

    async updateWidget(id, body) {
        const options = {
            url: this.baseUrl + this.URLs.widgetsById(id),
            headers: {
                'Content-Type': 'application/json',
            },
            body,
        };
        return this._put(options);
    }

    // *********************** Widgets *********************** //

    async uploadWidgetIcon(body) {
        const form = new FormData();
        const stats = fs.statSync(body.filePath);
        const fileSizeInBytes = stats.size;
        const fileStream = fs.createReadStream(body.filePath);
        const fileName = path.basename(body.filePath);
        form.append(fileName, fileStream, {
            filename: fileName,
            knownLength: fileSizeInBytes,
        });

        const options = {
            url: this.baseUrl + this.URLs.upload + '?type=widget_picture',
            method: 'POST',
            headers: {},
            credentials: 'include',
            body: form,
        };
        const res = await this._request(options.url, options);
        return res;
    }
}

module.exports = { Api };
