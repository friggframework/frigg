const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = process.env.ATTENTIVE_BASE_URL;
        this.client_id = process.env.ATTENTIVE_CLIENT_ID;
        this.client_secret = process.env.ATTENTIVE_CLIENT_SECRET;
        this.redirect_uri = process.env.REDIRECT_UI;

        this.scopes = process.env.ATTENTIVE_SCOPES;

        this.URLs = {
            me: '/me',

            // Subscriptions
            subscribeUser: '/subscriptions',
            unsubscribeUser: '/subscriptions/unsubscribe',
            userSubsciptions: (user) =>
                `/subscriptions?phone=${user.phone}&email=${user.email}`,

            // Product Catalogs
            productCatalogs: '/product-catalog/uploads',
            productCatalogById: (id) => `/product-catalog/uploads/${id}`,

            // Trigger Events
            productView: '/events/ecommerce/product-view',
            addToCart: '/events/ecommerce/add-to-cart',
            purchase: '/events/ecommerce/purchase',
            customEvent: '/events/custom',

            // Custom Attributes
            customAttributes: '/attributes/custom',
        };

        this.authorizationUri = `https://ui.attentivemobile.com/integrations/oauth-install?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scopes}`;

        this.tokenUri =
            'https://api.attentivemobile.com/v1/authorization-codes/tokens';

        this.access_token = get(params, 'access_token', null);
        this.id_token = get(params, 'id_token', null);
    }

    getAuthUri() {
        return this.authorizationUri;
    }

    async getTokenIdentity() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };

        const res = await this._get(options);
        return res;
    }

    async subscribeUser(body) {
        const options = {
            url: this.baseUrl + this.URLs.subscribeUser,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async unsubscribeUser(body) {
        const options = {
            url: this.baseUrl + this.URLs.unsubscribeUser,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async getUserSubsciptions(id) {
        const options = {
            url: this.baseUrl + this.URLs.userSubsciptions(id),
        };

        const res = await this._get(options);
        return res;
    }

    // Upload catalog file url
    // async createCatalogUpload() {}

    async getCatalogUploads() {
        const options = {
            url: this.baseUrl + this.URLs.productCatalogs,
        };

        const res = await this._get(options);
        return res;
    }

    async getCatalogUploadById(id) {
        const options = {
            url: this.baseUrl + this.URLs.productCatalogs(id),
        };

        const res = await this._get(options);
        return res;
    }

    async createProductViewEvent(body) {
        const options = {
            url: this.baseUrl + this.URLs.productView,
            body: body,
            headers: {
                'User-Agent': '*',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async createAddToCartEvent(body) {
        const options = {
            url: this.baseUrl + this.URLs.addToCart,
            body: body,
            headers: {
                'User-Agent': '*',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async createPurchaseEvent(body) {
        const options = {
            url: this.baseUrl + this.URLs.purchase,
            body: body,
            headers: {
                'User-Agent': '*',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async createCustomEvent(body) {
        const options = {
            url: this.baseUrl + this.URLs.customEvent,
            body: body,
            headers: {
                'User-Agent': '*',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }

    async createCustomAttribute(body) {
        const options = {
            url: this.baseUrl + this.URLs.customAttributes,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }
}

module.exports = { Api };
