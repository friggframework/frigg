const fetch = require('node-fetch');

const util = require('util');
const LHBaseClass = require('../../base/LHBaseClass');

class Api extends LHBaseClass {
    constructor(params) {
        super(params);

        this.secret = process.env.STACK_SECRET;
        this.companyId = this.getParam(params, 'companyId', null);
        this.baseUrl = process.env.STACK_BASE_URL;
        this.integrationType = this.getParam(params, 'integrationType');

        this.endpointAuthorize = '/integration/authorize';
        this.endpointGetSalesCycle = '/integration/salesCycle';
        this.endpointGetCompany = '/integration/company';
        this.endpointGetTeamMembers = '/integration/company/members';
    }

    // Return general headers for all requests
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.secret}`,
        };
        return headers;
    }

    // route all GET requests thru this function
    async _get(url, params) {
        const esc = encodeURIComponent;
        let query = '';
        if (params) {
            query = Object.keys(params)
                .map((k) => `${esc(k)}=${esc(params[k])}`)
                .join('&');
        }

        const options = {
            method: 'GET',
            url: `${this.baseUrl}${url}?${query}`,
            headers: await this.getHeaders(),
        };
        const response = await fetch(options.url, options);
        return response.json();
    }

    // route all POST requests thru this function
    async _post(apiUrlEnding, data) {
        const url = this.baseUrl + apiUrlEnding;
        const response = await fetch(url, {
            method: 'post',
            headers: this.getHeaders(),
            body: JSON.stringify(data),
        });
        return response.json();
    }

    // Function to authorize thru stack
    // NOTE- not needed for the updated request methods
    async authorize() {
        const params = {
            companyId: this.companyId,
            token: this.secret,
            type: this.type,
        };
        return this._post(this.endpointAuthorize, params);
    }

    // Function to authorize thru stack
    // NOTE- not needed for the updated request methods
    async browserExtensionAuth(params) {
        const body = {
            type: this.integrationType,
            ...params,
        };

        return this._post(this.endpointAuthorize, body);
    }

    // Function to get sales cycle
    async getSalesCycle() {
        const params = {
            companyId: this.companyId,
            type: this.integrationType,
        };
        return this._get(this.endpointGetSalesCycle, params);
    }

    // Function to get company data
    async getCompany() {
        const params = {
            companyId: this.companyId,
            type: this.integrationType,
        };
        return this._get(this.endpointGetCompany, params);
    }

    // Function to get team member array
    async getTeamMembers() {
        const params = {
            companyId: this.companyId,
            type: this.integrationType,
        };

        return this._get(this.endpointGetTeamMembers, params);
    }
}

module.exports = Api;
