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
            contractSaleById: (contractSaleId) =>
                `/contract-sales/${contractSaleId}`,
            createClaim: (contractSaleId) =>
                `/contract-sales/${contractSaleId}/claims`,
            claims: '/claims',
            claimById: (contractSaleId, claimId) =>
                `/contract-sales/${contractSaleId}/claims/${claimId}`,
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

    async createProduct(body) {
        const options = {
            url: this.baseUrl + this.URLs.products,
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    async listProducts(query) {
        const options = {
            url: this.baseUrl + this.URLs.products,
            query,
        };

        return this._get(options);
    }

    async getProductById(id) {
        const options = {
            url: this.baseUrl + this.URLs.productById(id),
        };

        return this._get(options);
    }

    async updateProduct(id, body) {
        const options = {
            url: this.baseUrl + this.URLs.productById(id),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    async deleteProduct(id) {
        const options = {
            url: this.baseUrl + this.URLs.productById(id),
        };

        return this._delete(options);
    }

    // **************************   Contracts  **********************************

    async listContracts(query) {
        const options = {
            url: this.baseUrl + this.URLs.contracts,
            query,
        };

        return this._get(options);
    }

    // **************************    Orders    **********************************

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

    async getOrderById(id) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(id),
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

    async updateOrder(id, body) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(id),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._put(options);
    }

    async deleteOrder(id) {
        const options = {
            url: this.baseUrl + this.URLs.orderById(id),
        };

        return this._delete(options);
    }

    // *************************    Contract Sales    *********************************

    async listContractSales(query) {
        const options = {
            url: this.baseUrl + this.URLs.contractSales,
            query,
        };

        return this._get(options);
    }

    async getContractSaleById(id) {
        const options = {
            url: this.baseUrl + this.URLs.contractSaleById(id),
        };

        return this._get(options);
    }

    async updateContractSale(id, body) {
        const options = {
            url: this.baseUrl + this.URLs.contractSaleById(id),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._put(options);
    }

    async deleteContractSale(id) {
        const options = {
            url: this.baseUrl + this.URLs.contractSaleById(id),
        };

        return this._delete(options);
    }

    // **************************    Claims    **********************************

    async createClaim(contractSaleId, body) {
        const options = {
            url: this.baseUrl + this.URLs.createClaim(contractSaleId),
            body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };

        return this._post(options);
    }

    async listClaims(query) {
        const options = {
            url: this.baseUrl + this.URLs.claims,
            query,
        };

        return this._get(options);
    }

    // **************************    Vouchers    **********************************

    async bulkCreateVouchers(body) {
        const options = {
            url: this.baseUrl + this.URLs.bulkCreateVouchers,
            body,
        };

        return this._post(options);
    }

    async listVouchers() {
        const options = {
            url: this.baseUrl + this.URLs.vouchers,
        };

        return this._get(options);
    }

    async updateVoucher(code, body) {
        const options = {
            url: this.baseUrl + this.URLs.voucherByCode(code),
            body,
        };

        return this._put(options);
    }

    async getVoucherByCode(code) {
        const options = {
            url: this.baseUrl + this.URLs.voucherByCode(code),
        };

        return this._get(options);
    }

    // **************************    Registrations    **********************************

    async listRegistrations(query) {
        const options = {
            url: this.baseUrl + this.URLs.registrations,
            query,
        };

        return this._get(options);
    }
}

module.exports = { Api };
