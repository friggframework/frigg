const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class loyaltyApi extends ApiKeyRequester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://loyalty.yotpo.com/api';
        this.API_KEY_NAME = 'x-api-key';
        this.URLs = {
            customers: {
                listRecent: '/v2/customers/recent',
                getOne: '/v2/customers',
                createOrUpdate: '/v2/customers',
            },
            actions: {
                record: '/v2/actions',
                adjustCustomerPointBalance: '/v2/points/adjust',
            },
            orders: {
                create: '/v2/orders',
            },
            campaigns: {
                list: '/v2/campaigns',
            },
        };
    }

    async addAuthHeaders(headers) {
        if (this.API_KEY_VALUE) {
            headers[this.API_KEY_NAME] = this.API_KEY_VALUE;
            headers['x-guid'] = this.GUID;
        }
        headers['Content-Type'] = 'application/json';
        return headers;
    }
    setGuid(guid) {
        this.GUID = guid;
    }

    /*
     * Customers
     * */
    async listRecentCustomers(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.customers.listRecent}`,
            query: params,
        };
        return this._get(opts);
    }
    async createOrUpdateCustomer(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.customers.createOrUpdate}`,
            body: params,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        return this._post(opts);
    }
    async getOneCustomer(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.customers.getOne}`,
            query: params,
        };
        return this._get(opts);
    }

    /*
     * Orders
     * */
    async createOrder(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.orders.create}`,
            body: params,
        };
        return this._post(opts);
    }
    /*
     * Actions
     * */
    async recordCustomerAction(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.actions.record}`,
            body: params,
        };
        return this._post(opts);
    }
    async adjustCustomerPointBalance(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.actions.adjustCustomerPointBalance}`,
            body: params,
        };
        return this._post(opts);
    }
    /*
     * Campaigns
     * */
    async listActiveCampaigns(params) {
        const opts = {
            url: `${this.baseUrl}${this.URLs.campaigns.list}`,
            query: params,
        };
        return this._get(opts);
    }
}

module.exports = { loyaltyApi };
