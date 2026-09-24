const { BaseError } = require('./base-error');
const { redactUrl, scrubString } = require('../logs/redact');

// Parameters names here are based on fetch.  See:
// https://developer.mozilla.org/en-US/docs/Web/API/fetch

function resourceUrl(resource) {
    if (resource === undefined || resource === null) return '';
    if (typeof resource === 'object' && typeof resource.url === 'string') {
        return redactUrl(resource.url);
    }
    return redactUrl(resource);
}

function causeLabel(cause) {
    if (!cause || typeof cause !== 'object') return '';
    const label = cause.code ?? cause.name;
    return label === undefined || label === null ? '' : scrubString(String(label));
}

function buildMessage({ method, url, response, cause }) {
    const outcome = response
        ? response.status === undefined || response.status === null
            ? ''
            : String(response.status)
        : causeLabel(cause);
    return [method, url, outcome].filter(Boolean).join(' ');
}

class FetchError extends BaseError {
    constructor({ resource, init, response, cause, responseBody, body } = {}) {
        const method = String(init?.method ?? 'GET').toUpperCase();
        const url = resourceUrl(resource);
        super(
            buildMessage({ method, url, response, cause }),
            cause ? { cause } : undefined
        );

        this.statusCode = response?.status;
        this.method = method;
        this.url = url;
        Object.defineProperty(this, 'response', {
            value: response ?? null,
            enumerable: false,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(this, 'body', {
            value: responseBody ?? body,
            enumerable: false,
            writable: true,
            configurable: true,
        });
    }

    static async create(options = {}) {
        const { response } = options;
        let responseBody =
            response && !response.bodyUsed && typeof response.text === 'function'
                ? await response.text()
                : null;
        if (!responseBody) responseBody = options.responseBody ?? options.body;
        return new FetchError({ ...options, responseBody });
    }
}

module.exports = { FetchError };
