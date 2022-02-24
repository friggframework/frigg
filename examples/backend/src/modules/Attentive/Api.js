const OAuth2Base = require('../../base/auth/OAuth2Base');
const { FetchError } = require('../../errors/FetchError');

class AttentiveAPI extends OAuth2Base {
	constructor(params) {
		super(params);

		this.baseUrl = 'https://api.attentivemobile.com/v1';
		this.client_id = '9ae9d8025eed477bb193b6135044932e';
		this.client_secret = 'cVRXKgzy5XfcftqiA2koyLqGxurB8VlH';
		// this.redirect_uri = 'https://db9f-96-32-68-235.ngrok.io/redirect/attentive';
		this.redirect_uri = 'http://localhost:3000/redirect/attentive';

		this.scopes = ['events:write', 'ecommerce:write', 'subscriptions:write', 'attributes:write'];

		this.URLs = {
			me: '/me',

			// Subscriptions
			subscribeUser: '/subscriptions',
			unsubscribeUser: '/subscriptions/unsubscribe',
			userSubsciptions: (user) => `/subscriptions?phone=${user.phone}&email=${user.email}`,

			// Product Catalogs
			productCatalogs: '/product-catalog/uploads',
			productCatalogById: (id) => `/product-catalog/uploads/${id}`,

			// Trigger Events
			productView: '/ecommerce/product-view',
			addToCart: '/ecommerce/add-to-cart',
			purchase: '/ecommerce/purchase',
			customEvent: '/events/custom',

			// Custom Attributes
			customAttributes: '/attributes/custom',
		};

		this.authorizationUri = `https://ui.attentivemobile.com/integrations/oauth-install?client_id=${
			this.client_id
		}&redirect_uri=${this.redirect_uri}&scope=${this.scopes.join('+')}`;

		this.tokenUri = 'https://api.attentivemobile.com/v1/authorization-codes/tokens';

		this.access_token = this.getParam(params, 'access_token', null);
		this.refresh_token = this.getParam(params, 'refresh_token', null);
	}

	async getTokenFromCode(code) {
		return this.getTokenFromCodeBasicAuthHeader(code);
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

	async getCatalogUploads(id) {
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

module.exports = AttentiveAPI;
