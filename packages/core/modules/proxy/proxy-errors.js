/**
 * A proxied call was refused or failed in a way the Management API maps to a
 * documented status (ADR-052 §10). `code` is the public error code; nothing
 * here carries the upstream URL, headers or credential material.
 */
class ProxyRequestError extends Error {
    /**
     * @param {string} code - e.g. INVALID_PROXY_REQUEST, PROXY_NOT_ALLOWED, TIMEOUT
     * @param {string} message - safe to show the caller
     * @param {Object} [details] - safe structured details
     */
    constructor(code, message, details) {
        super(message);
        this.name = 'ProxyRequestError';
        this.code = code;
        this.details = details;
    }
}

/**
 * A module definition or the app's proxy settings are wrong. Thrown at load,
 * so the app stops starting instead of failing on the first proxied call.
 */
class ProxyConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProxyConfigError';
    }
}

module.exports = { ProxyRequestError, ProxyConfigError };
