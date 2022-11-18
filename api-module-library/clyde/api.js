const { BasicAuthRequester } = require('@friggframework/module-plugin');
const crypto = require('crypto');
const { get } = require('@friggframework/assertions');
let nonce = crypto.randomBytes(16).toString('base64');

class Api extends BasicAuthRequester {
    constructor(params) {
        super(params);
        this.baseUrl =
            process.env.CLYDE_API_BASE_URL || 'https://api.joinclyde.com';
        this.clientKey = get(params, 'clientKey', null);
        this.secret = get(params, 'secret', null);
        this.username = this.clientKey;
        this.password = this.secret;

        this.URLs = {
            products: '/products',
            productBySku: (sku) => `/products/${sku}`,
            contractsForProduct: (sku) => `/products/${sku}/contracts`,
            bulkCreateProducts: '/products/bulk',
            contracts: '/contracts',
            orders: '/orders',
            orderById: (orderId) => `/orders/${orderId}`,
            orderHistoryEvent: (orderId, lineItemId) =>
                `/orders/${orderId}/lineItem/${lineItemId}`,
            contractSales: '/contract-sales',
            contractSaleById: (id) => `/contract-sales/${id}`,
            claims: '/claims',
            claimById: (claimId) => `/claims/${claimId}`,
            vouchers: `/vouchers`,
            voucherByCode: (code) => `/vouchers/${code}`,
            bulkCreateVouchers: '/vouchers/bulk',
        };
    }

    setClientKey(clientKey) {
        this.clientKey = clientKey;
        super.setUsername(clientKey);
    }
    setSecret(secret) {
        this.secret = secret;
        super.setPassword(secret);
    }

    async addAuthHeaders(headers) {
        if (this.username && this.password) {
            headers['Authorization'] =
                'Basic ' +
                Buffer.from(this.username + ':' + this.password).toString(
                    'base64'
                );
        }
        headers['x-Auth-Timestamp'] = new Date();
        headers['x-Auth-Nonce'] = nonce;
        headers['Content-Type'] = 'application/vnd.api+json';
        return headers;
    }

    // **************************   Products   **********************************
    async listProducts() {
        const options = {
            url: this.baseUrl + this.URLs.products,
        };

        return this._get(options);
    }
    // **************************   Contracts  **********************************
    // **************************    Orders    **********************************
    async getOrderById(orderId) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(orderId),
        };

        return this._get(options);
    }
    // ************************* Contract Sales *********************************
    // **************************    Claims    **********************************
    // **************************   Vouchers   **********************************

    async createProduct(body) {
        const options = {
            url: this.baseUrl + this.URLs.companies,
            body: {
                contractSales: body,
            },
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    // Docs described endpoint as archive product instead of delete. Will have to make due.
    async archiveProduct(compId) {
        const options = {
            url: this.baseUrl + this.URLs.productById(compId),
        };

        return this._delete(options);
    }

    async getProductById(compId) {
        const props = await this.listContractSales('product');
        let propsString = '';
        for (let i = 0; i < props.results.length; i++) {
            propsString += `${props.results[i].name},`;
        }
        propsString = propsString.slice(0, propsString.length - 1);
        const options = {
            url: this.baseUrl + this.URLs.productById(compId),
            query: {
                contractSales: propsString,
                associations: 'contracts',
            },
        };

        return this._get(options);
    }

    async batchGetProductsById(params) {
        // inputs.length should be < 100
        const inputs = get(params, 'inputs');
        const contractSales = get(params, 'contractSales', []);

        const body = {
            inputs,
            contractSales,
        };
        const options = {
            url: this.baseUrl + this.URLs.getBatchProductsById,
            body,
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
            },
            query: {
                archived: 'false',
            },
        };
        return this._post(options);
    }

    // **************************   Contracts   **********************************

    async createContract(body) {
        const options = {
            url: this.baseUrl + this.URLs.contracts,
            body: {
                contractSales: body,
            },
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    async listContracts() {
        const options = {
            url: this.baseUrl + this.URLs.contracts,
        };

        return this._get(options);
    }

    async archiveContract(id) {
        const options = {
            url: this.baseUrl + this.URLs.contractById(id),
        };

        return this._delete(options);
    }

    async getContractById(contractId) {
        const props = await this.listContractSales('contract');
        let propsString = '';
        for (let i = 0; i < props.results.length; i++) {
            propsString += `${props.results[i].name},`;
        }
        propsString = propsString.slice(0, propsString.length - 1);
        const options = {
            url: this.baseUrl + this.URLs.contractById(contractId),
            query: {
                contractSales: propsString,
            },
        };

        return this._get(options);
    }

    //* **************************   Orders   *************************** */

    async createOrder(body) {
        const options = {
            url: this.baseUrl + this.URLs.orders,
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    async bulkCreateOrderss(objectType, body) {
        const options = {
            url: this.baseUrl + this.URLs.bulkCreateOrderss(objectType),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        if (this.api_key) {
            options.query = { hapikey: this.api_key };
        }

        return this._post(options);
    }

    async deleteOrders(objectType, objId) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(objectType, objId),
            query: {},
        };

        if (this.api_key) {
            options.query.hapikey = this.api_key;
        }

        return this._delete(options);
    }

    async bulkArchiveOrderss(objectType, body) {
        const url = this.baseUrl + this.URLs.bulkArchiveOrderss(objectType);
        const options = {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            query: {},
        };

        if (this.api_key) {
            options.query.hapikey = this.api_key;
        }

        // Using _request because it's a post request that returns an empty body
        return this._request(url, options);
    }

    async getOrders(objectType, objId) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(objectType, objId),
        };

        if (this.api_key) {
            options.query = { hapikey: this.api_key };
        }

        return this._get(options);
    }

    async listOrderss(objectType, query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.orders(objectType),
            query,
        };

        if (this.api_key) {
            options.query.hapikey = this.api_key;
        }

        return this._get(options);
    }

    async updateOrders(objectType, objId, body) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(objectType, objId),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        if (this.api_key) {
            options.query = { hapikey: this.api_key };
        }

        return this._patch(options);
    }

    // **************************   ContractSales / Custom Fields   **********************************

    // Same as below, but kept for legacy purposes. IE, don't break anything if we update module in projects
    async getContractSales(objType) {
        return this.listContractSales(objType);
    }

    // This better fits naming conventions
    async listContractSales(objType) {
        return this._get({
            url: `${this.baseUrl}${this.URLs.contractSales(objType)}`,
        });
    }
}

module.exports = { Api };
