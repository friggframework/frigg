const { Requester } = require('./requester');

class ApiKeyRequester extends Requester {
    constructor(params) {
        super(params);
        this.API_KEY_NAME = 'key';
        this.API_KEY_VALUE = null;
    }

    async addAuthHeaders(headers) {
        if (this.API_KEY_VALUE) {
            headers[this.API_KEY_NAME] = this.API_KEY_VALUE;
        }
        return headers;
    }

    isAuthenticated() {
        return (
            this.API_KEY_VALUE !== null &&
            this.API_KEY_VALUE !== undefined &&
            this.API_KEY_VALUE.trim().length() > 0
        );
    }

    setApiKey(api_key) {
        this.API_KEY_VALUE = api_key;
    }
}

module.exports = { ApiKeyRequester };
