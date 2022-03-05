class MockApi {
	constructor() {}

	async subscribeUser() {
		return require('./subscriptions/subscribeUser');
	}

	async unsubscribeUser() {
		return require('./subscriptions/unsubscribeUser');
	}

	async getUserSubscriptions() {
		return require('./subscriptions/getUserSubscriptions');
	}

	async getProductCatalogs() {
		return require('./catalogs/getProductCatalogs');
	}

	async getProductCatalogbyId() {
		return require('./catalogs/getProductCatalogbyId');
	}

	async createProductViewEvent() {
		return require('./events/createProductViewEvent');
	}

	async createAddToCartEvent() {
		return require('./events/createAddToCartEvent');
	}

	async createPurchaseEvent() {
		return require('./events/createPurchaseEvent');
	}

	async createCustomEvent() {
		return require('./events/createCustomEvent');
	}
}
