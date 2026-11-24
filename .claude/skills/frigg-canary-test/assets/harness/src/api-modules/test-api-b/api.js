const { ApiKeyRequester } = require('@friggframework/core');

class Api extends ApiKeyRequester {
    constructor(params = {}) {
        super(params);
        this.baseUrl = 'https://api.test-api-b.example.com';
        this.API_KEY_NAME = 'Authorization';

        const apiKey = params.access_token || params.api_key;
        this.access_token = apiKey;
        if (this.access_token) {
            this.setApiKey(this.access_token);
        }
    }

    // Stub — not called during the context-load test, present for auth methods.
    async getAccountInfo() {
        return { id: 'acct-test-api-b', name: 'Test API B Account' };
    }

    async fetchData() {
        return { status: 'ok' };
    }
}

module.exports = { Api };
