const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class loyaltyApi extends ApiKeyRequester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://api.yotpo.com/';
        this.tokenUri = `${this.baseUrl}/oauth/token`;
    }
}

module.exports = { loyaltyApi };
