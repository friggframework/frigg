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
            registrations: '/registrations',
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

    async listProducts(query) {
        const options = {
            url: this.baseUrl + this.URLs.products,
            query,
        };

        return this._get(options);
    }

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

    async deleteProduct(productId) {
        const options = {
            url: this.baseUrl + this.URLs.productById(productId),
        };

        return this._delete(options);
    }

    async getProductById(productId) {
        const options = {
            url: this.baseUrl + this.URLs.productById(productId),
        };

        return this._get(options);
    }

    // **************************    Orders    **********************************

    async getOrderById(orderId) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(orderId),
        };

        return this._get(options);
    }

    async listOrders(query) {
        const options = {
            url: this.baseUrl + this.URLs.orders,
            query,
        };

        return this._get(options);
    }

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

    async updateOrder(orderId, body) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(orderId),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._put(options);
    }

    async deleteOrder(orderId) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(orderId),
            query: {},
        };

        if (this.api_key) {
            options.query.hapikey = this.api_key;
        }

        return this._delete(options);
    }

    // **************************   Contracts  **********************************

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

    // ************************* Contract Sales *********************************

    async listContractSales(query) {
        const options = {
            url: this.baseUrl + this.URLs.contractSales,
            query,
        };

        return this._get(options);
    }

    // **************************    Claims    **********************************

    async listClaims(query) {
        const options = {
            url: this.baseUrl + this.URLs.claims,
            query,
        };

        return this._get(options);
    }
}

module.exports = { Api };
