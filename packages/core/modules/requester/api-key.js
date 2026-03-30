const { Requester } = require('./requester');
const { get } = require('../../assertions');
const { ModuleConstants } = require('../ModuleConstants');

class ApiKeyRequester extends Requester {
    static requesterType = ModuleConstants.authType.apiKey;

    constructor(params) {
        super(params);
        this.requesterType = 'apiKey';

        // Use snake_case convention consistent with OAuth2Requester and BasicAuthRequester
        this.api_key_name = get(params, 'api_key_name', 'key');
        this.api_key = get(params, 'api_key', null);

        // Backward compatibility: support old naming convention
        if (!this.api_key && params.API_KEY_VALUE) {
            this.api_key = params.API_KEY_VALUE;
        }
        if (!this.api_key_name && params.API_KEY_NAME) {
            this.api_key_name = params.API_KEY_NAME;
        }
    }

    async addAuthHeaders(headers) {
        if (this.api_key) {
            headers[this.api_key_name] = this.api_key;
        }
        return headers;
    }

    isAuthenticated() {
        return (
            this.api_key !== null &&
            this.api_key !== undefined &&
            typeof this.api_key === 'string' &&
            this.api_key.trim().length > 0
        );
    }

    setApiKey(api_key) {
        this.api_key = api_key;
    }

    setApiKeyName(api_key_name) {
        this.api_key_name = api_key_name;
    }
}

module.exports = { ApiKeyRequester };
