/**
 * Dry-Run HTTP Interceptor
 *
 * Creates a mock HTTP client that logs requests instead of executing them.
 * Used to intercept API module calls during dry-run.
 */

/**
 * Sanitize headers to remove authentication tokens
 * @param {Object} headers - HTTP headers
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') {
        return {};
    }

    const safe = { ...headers };

    // Remove common auth headers
    const sensitiveHeaders = [
        'authorization',
        'Authorization',
        'x-api-key',
        'X-API-Key',
        'x-auth-token',
        'X-Auth-Token',
        'api-key',
        'API-Key',
        'apikey',
        'ApiKey',
        'token',
        'Token',
    ];

    for (const header of sensitiveHeaders) {
        if (safe[header]) {
            safe[header] = '[REDACTED]';
        }
    }

    return safe;
}

/**
 * Detect service name from base URL
 * @param {string} baseURL - Base URL of the API
 * @returns {string} Service name
 */
function detectService(baseURL) {
    if (!baseURL) return 'unknown';

    const url = baseURL.toLowerCase();

    // CRM Systems
    if (url.includes('hubspot') || url.includes('hubapi')) return 'HubSpot';
    if (url.includes('salesforce')) return 'Salesforce';
    if (url.includes('pipedrive')) return 'Pipedrive';
    if (url.includes('zoho')) return 'Zoho CRM';
    if (url.includes('attio')) return 'Attio';

    // Communication
    if (url.includes('slack')) return 'Slack';
    if (url.includes('discord')) return 'Discord';
    if (url.includes('teams.microsoft')) return 'Microsoft Teams';

    // Project Management
    if (url.includes('asana')) return 'Asana';
    if (url.includes('monday')) return 'Monday.com';
    if (url.includes('trello')) return 'Trello';
    if (url.includes('clickup')) return 'ClickUp';

    // Storage
    if (url.includes('googleapis.com/drive')) return 'Google Drive';
    if (url.includes('dropbox')) return 'Dropbox';
    if (url.includes('box.com')) return 'Box';

    // Email & Marketing
    if (url.includes('sendgrid')) return 'SendGrid';
    if (url.includes('mailchimp')) return 'Mailchimp';
    if (url.includes('gmail')) return 'Gmail';

    // Accounting
    if (url.includes('quickbooks')) return 'QuickBooks';
    if (url.includes('xero')) return 'Xero';

    // Other
    if (url.includes('stripe')) return 'Stripe';
    if (url.includes('shopify')) return 'Shopify';
    if (url.includes('github')) return 'GitHub';
    if (url.includes('gitlab')) return 'GitLab';

    return 'unknown';
}

/**
 * Sanitize request data to remove sensitive information
 * @param {*} data - Request data
 * @returns {*} Sanitized data
 */
function sanitizeData(data) {
    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(sanitizeData);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();

        // Check if this is a leaf node that should be redacted
        const isSensitiveField =
            lowerKey === 'password' ||
            lowerKey === 'token' ||
            lowerKey === 'secret' ||
            lowerKey === 'apikey' ||
            lowerKey.endsWith('password') ||
            lowerKey.endsWith('token') ||
            lowerKey.endsWith('secret') ||
            lowerKey.endsWith('key') && !lowerKey.endsWith('publickey');

        // Only redact if it's a primitive value (not an object/array)
        if (isSensitiveField && typeof value !== 'object') {
            sanitized[key] = '[REDACTED]';
            continue;
        }

        // Recursively sanitize nested objects
        if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeData(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Create a dry-run HTTP client
 *
 * @param {Array} operationLog - Array to append logged HTTP requests
 * @returns {Object} Mock HTTP client compatible with axios interface
 */
function createDryRunHttpClient(operationLog) {
    /**
     * Mock HTTP request handler
     * @param {Object} config - Request configuration
     * @returns {Promise<Object>} Mock response
     */
    const mockRequest = async (config) => {
        // Build full URL
        let fullUrl = config.url;
        if (config.baseURL && !config.url.startsWith('http')) {
            fullUrl = `${config.baseURL}${config.url.startsWith('/') ? '' : '/'}${config.url}`;
        }

        // Log the request that WOULD have been made
        const logEntry = {
            operation: 'HTTP_REQUEST',
            method: (config.method || 'GET').toUpperCase(),
            url: fullUrl,
            baseURL: config.baseURL,
            path: config.url,
            service: detectService(config.baseURL || fullUrl),
            headers: sanitizeHeaders(config.headers),
            timestamp: new Date().toISOString(),
        };

        // Include request data for write operations
        if (config.data && ['POST', 'PUT', 'PATCH'].includes(logEntry.method)) {
            logEntry.data = sanitizeData(config.data);
        }

        // Include query params
        if (config.params) {
            logEntry.params = sanitizeData(config.params);
        }

        operationLog.push(logEntry);

        // Return mock response
        return {
            status: 200,
            statusText: 'OK (Dry-Run)',
            data: {
                _dryRun: true,
                _message: 'This is a dry-run mock response',
                _wouldHaveExecuted: `${logEntry.method} ${fullUrl}`,
                _service: logEntry.service,
            },
            headers: {
                'content-type': 'application/json',
                'x-dry-run': 'true',
            },
            config,
        };
    };

    // Return axios-compatible interface
    return {
        request: mockRequest,
        get: (url, config = {}) => mockRequest({ ...config, method: 'GET', url }),
        post: (url, data, config = {}) => mockRequest({ ...config, method: 'POST', url, data }),
        put: (url, data, config = {}) => mockRequest({ ...config, method: 'PUT', url, data }),
        patch: (url, data, config = {}) =>
            mockRequest({ ...config, method: 'PATCH', url, data }),
        delete: (url, config = {}) => mockRequest({ ...config, method: 'DELETE', url }),
        head: (url, config = {}) => mockRequest({ ...config, method: 'HEAD', url }),
        options: (url, config = {}) => mockRequest({ ...config, method: 'OPTIONS', url }),

        // Axios-specific properties
        defaults: {
            headers: {
                common: {},
                get: {},
                post: {},
                put: {},
                patch: {},
                delete: {},
            },
        },

        // Interceptors (no-op in dry-run)
        interceptors: {
            request: { use: () => {}, eject: () => {} },
            response: { use: () => {}, eject: () => {} },
        },
    };
}

/**
 * Inject dry-run HTTP client into an integration instance
 *
 * @param {Object} integrationInstance - Integration instance from integrationFactory
 * @param {Object} dryRunHttpClient - Dry-run HTTP client
 */
function injectDryRunHttpClient(integrationInstance, dryRunHttpClient) {
    if (!integrationInstance) {
        return;
    }

    // Inject into primary API module
    if (integrationInstance.primary?.api) {
        injectIntoApiModule(integrationInstance.primary.api, dryRunHttpClient);
    }

    // Inject into target API module
    if (integrationInstance.target?.api) {
        injectIntoApiModule(integrationInstance.target.api, dryRunHttpClient);
    }
}

/**
 * Inject dry-run HTTP client into an API module
 * @param {Object} apiModule - API module instance
 * @param {Object} dryRunHttpClient - Dry-run HTTP client
 */
function injectIntoApiModule(apiModule, dryRunHttpClient) {
    // Common property names for HTTP clients in API modules
    const httpClientProps = [
        '_httpClient',
        'httpClient',
        'client',
        'axios',
        'request',
        'api',
        'http',
    ];

    for (const prop of httpClientProps) {
        if (apiModule[prop] && typeof apiModule[prop] === 'object') {
            apiModule[prop] = dryRunHttpClient;
        }
    }

    // Also check if the API module itself has request methods
    if (typeof apiModule.request === 'function') {
        Object.assign(apiModule, dryRunHttpClient);
    }
}

module.exports = {
    createDryRunHttpClient,
    injectDryRunHttpClient,
    sanitizeHeaders,
    sanitizeData,
    detectService,
};
