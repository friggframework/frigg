const Boom = require('@hapi/boom');

/**
 * Use case for proxying HTTP requests through an entity's or credential's API connection
 *
 * This use case handles:
 * - Entity and credential validation
 * - Authentication state verification
 * - HTTP method validation
 * - Request forwarding to upstream API
 * - Error mapping and response formatting
 *
 * @class ExecuteProxyRequest
 */
class ExecuteProxyRequest {
    /**
     * @param {Object} params - Configuration parameters
     * @param {import('../../modules/repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for entity data
     * @param {import('../../credential/repositories/credential-repository-interface').CredentialRepositoryInterface} params.credentialRepository - Repository for credential data
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Factory for creating module instances
     * @param {Array} params.moduleDefinitions - Array of module definitions
     */
    constructor({ moduleRepository, credentialRepository, moduleFactory, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.moduleFactory = moduleFactory;
        this.moduleDefinitions = moduleDefinitions;

        // Valid HTTP methods for proxy requests
        this.VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    }

    /**
     * Execute proxy request through an entity
     *
     * @param {string} entityId - Entity ID to proxy through
     * @param {string} userId - User ID making the request
     * @param {Object} proxyRequest - Proxy request parameters
     * @param {string} proxyRequest.method - HTTP method (GET, POST, PUT, PATCH, DELETE)
     * @param {string} proxyRequest.path - API path to call
     * @param {Object} [proxyRequest.query] - Query parameters
     * @param {Object} [proxyRequest.headers] - Request headers
     * @param {*} [proxyRequest.body] - Request body
     * @returns {Promise<Object>} Proxy response with status, headers, and data
     */
    async executeViaEntity(entityId, userId, proxyRequest) {
        // Validate request
        this._validateProxyRequest(proxyRequest);

        // Load entity for user (validates ownership)
        const entity = await this.moduleRepository.findByIdForUser(entityId, userId);

        if (!entity) {
            throw Boom.notFound('Entity not found');
        }

        // Load credential
        const credential = await this._loadAndValidateCredential(entity.credential);

        // Get module instance with API client
        const moduleInstance = await this._getModuleInstance(entityId, userId);

        // Execute proxy request
        return await this._executeProxyRequest(moduleInstance.api, proxyRequest);
    }

    /**
     * Execute proxy request through a credential directly
     *
     * @param {string} credentialId - Credential ID to proxy through
     * @param {string} userId - User ID making the request
     * @param {Object} proxyRequest - Proxy request parameters
     * @returns {Promise<Object>} Proxy response with status, headers, and data
     */
    async executeViaCredential(credentialId, userId, proxyRequest) {
        // Validate request
        this._validateProxyRequest(proxyRequest);

        // Load credential for user (validates ownership)
        const credential = await this.credentialRepository.findByIdForUser(credentialId, userId);

        if (!credential) {
            throw Boom.notFound('Credential not found');
        }

        // Validate credential is usable
        this._validateCredentialAuth(credential);

        // Get API instance for credential
        const moduleInstance = await this._getModuleInstanceFromCredential(credential, userId);

        // Execute proxy request
        return await this._executeProxyRequest(moduleInstance.api, proxyRequest);
    }

    /**
     * Validate proxy request parameters
     *
     * @private
     * @param {Object} proxyRequest - Request to validate
     * @throws {Boom.badRequest} When validation fails
     */
    _validateProxyRequest(proxyRequest) {
        // Validate method
        if (!proxyRequest.method) {
            throw Boom.badRequest('Missing Parameter: method is required.');
        }

        if (!this.VALID_METHODS.includes(proxyRequest.method)) {
            throw Boom.badRequest(
                `Invalid method. method must be one of: ${this.VALID_METHODS.join(', ')}`
            );
        }

        // Validate path
        if (!proxyRequest.path) {
            throw Boom.badRequest('Missing Parameter: path is required.');
        }

        if (typeof proxyRequest.path !== 'string' || proxyRequest.path.trim() === '') {
            throw Boom.badRequest('path must be a non-empty string');
        }

        if (!proxyRequest.path.startsWith('/')) {
            throw Boom.badRequest('path must start with /');
        }

        // Validate query parameters (if provided)
        if (proxyRequest.query !== undefined && proxyRequest.query !== null) {
            if (typeof proxyRequest.query !== 'object' || Array.isArray(proxyRequest.query)) {
                throw Boom.badRequest('query must be an object');
            }

            // Validate each query parameter value type
            for (const [key, value] of Object.entries(proxyRequest.query)) {
                const valueType = typeof value;
                const isValidType =
                    valueType === 'string' ||
                    valueType === 'number' ||
                    valueType === 'boolean' ||
                    Array.isArray(value);

                if (!isValidType) {
                    throw Boom.badRequest(
                        `Invalid query parameter "${key}". Query parameters must be string, number, boolean, or array.`
                    );
                }

                // If array, validate all items are strings
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (typeof item !== 'string') {
                            throw Boom.badRequest(
                                `Invalid query parameter "${key}". Query array items must be strings.`
                            );
                        }
                    }
                }
            }
        }

        // Validate headers (if provided)
        if (proxyRequest.headers !== undefined && proxyRequest.headers !== null) {
            if (typeof proxyRequest.headers !== 'object' || Array.isArray(proxyRequest.headers)) {
                throw Boom.badRequest('headers must be an object');
            }

            // Validate each header value is a string
            for (const [key, value] of Object.entries(proxyRequest.headers)) {
                if (typeof value !== 'string') {
                    throw Boom.badRequest(
                        `Invalid header "${key}". Headers must be strings.`
                    );
                }
            }
        }
    }

    /**
     * Load and validate credential
     *
     * @private
     * @param {string} credentialId - Credential ID to load
     * @returns {Promise<Object>} Credential object
     * @throws {Boom} When credential is invalid
     */
    async _loadAndValidateCredential(credentialId) {
        if (!credentialId) {
            throw Boom.badRequest('Entity has no credential associated');
        }

        const credential = await this.credentialRepository.findById(credentialId);

        if (!credential) {
            throw Boom.notFound('Credential not found');
        }

        this._validateCredentialAuth(credential);

        return credential;
    }

    /**
     * Validate credential has valid authentication data
     *
     * @private
     * @param {Object} credential - Credential to validate
     * @throws {Boom.unauthorized} When credential is invalid
     */
    _validateCredentialAuth(credential) {
        // Check credential status
        if (credential.status && credential.status !== 'AUTHORIZED') {
            throw Boom.unauthorized(
                'Credential is not authorized. Please reauthorize your connection.',
                'INVALID_CREDENTIALS'
            );
        }

        // Check credential has auth data
        if (!credential.data || !credential.data.access_token) {
            throw Boom.unauthorized(
                'Credential is missing required authentication data',
                'INVALID_CREDENTIALS'
            );
        }
    }

    /**
     * Get module instance with API client
     *
     * @private
     * @param {string} entityId - Entity ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Module instance with API client
     */
    async _getModuleInstance(entityId, userId) {
        try {
            const moduleInstance = await this.moduleFactory.getModuleInstance(entityId, userId);

            if (!moduleInstance || !moduleInstance.api) {
                throw Boom.internal('Failed to initialize API client for entity');
            }

            return moduleInstance;
        } catch (error) {
            if (Boom.isBoom(error)) {
                throw error;
            }
            throw Boom.internal('Failed to load module instance', error);
        }
    }

    /**
     * Get module instance from credential
     *
     * @private
     * @param {Object} credential - Credential object
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Module instance with API client
     */
    async _getModuleInstanceFromCredential(credential, userId) {
        try {
            // Find module definition for this credential type
            const moduleDefinition = this.moduleDefinitions.find(
                def => def.moduleName === credential.type
            );

            if (!moduleDefinition) {
                throw Boom.badRequest(`Unknown credential type: ${credential.type}`);
            }

            // Create API instance directly from credential
            const ModuleDefinition = moduleDefinition.definition;
            const api = new ModuleDefinition.Api(credential);

            return { api };
        } catch (error) {
            if (Boom.isBoom(error)) {
                throw error;
            }
            throw Boom.internal('Failed to initialize API client from credential', error);
        }
    }

    /**
     * Sensitive headers that should be stripped from outgoing requests
     * @private
     */
    static SENSITIVE_REQUEST_HEADERS = ['authorization', 'cookie', 'x-api-key'];

    /**
     * Sensitive headers that should be stripped from upstream responses
     * @private
     */
    static SENSITIVE_RESPONSE_HEADERS = ['authorization', 'set-cookie', 'x-api-key'];

    /**
     * Strip sensitive headers from request headers
     * @private
     * @param {Object} headers - Request headers
     * @returns {Object} Sanitized headers
     */
    _sanitizeRequestHeaders(headers) {
        if (!headers) return {};
        const sanitized = { ...headers };
        for (const key of Object.keys(sanitized)) {
            if (ExecuteProxyRequest.SENSITIVE_REQUEST_HEADERS.includes(key.toLowerCase())) {
                delete sanitized[key];
            }
        }
        return sanitized;
    }

    /**
     * Strip sensitive headers from response headers
     * @private
     * @param {Object} headers - Response headers
     * @returns {Object} Sanitized headers
     */
    _sanitizeResponseHeaders(headers) {
        if (!headers) return {};
        const sanitized = { ...headers };
        for (const key of Object.keys(sanitized)) {
            if (ExecuteProxyRequest.SENSITIVE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
                delete sanitized[key];
            }
        }
        return sanitized;
    }

    /**
     * Execute the actual proxy request through the API client
     *
     * @private
     * @param {Object} apiClient - API client instance (Requester)
     * @param {Object} proxyRequest - Proxy request parameters
     * @returns {Promise<Object>} Formatted proxy response
     */
    async _executeProxyRequest(apiClient, proxyRequest) {
        try {
            // Sanitize request headers (strip Authorization, etc.)
            const sanitizedHeaders = this._sanitizeRequestHeaders(proxyRequest.headers);

            // Make the upstream API request
            const upstreamResponse = await apiClient.request({
                method: proxyRequest.method,
                url: proxyRequest.path,
                query: proxyRequest.query,
                headers: sanitizedHeaders,
                body: proxyRequest.body
            });

            // Return successful response with sanitized headers
            return {
                success: true,
                status: upstreamResponse.status,
                headers: this._sanitizeResponseHeaders(upstreamResponse.headers),
                data: upstreamResponse.data
            };
        } catch (error) {
            // Map upstream errors to proxy error responses
            return this._mapUpstreamError(error);
        }
    }

    /**
     * Map upstream API errors to standardized proxy error responses
     *
     * @private
     * @param {Error} error - Upstream error
     * @returns {Object} Formatted error response
     * @throws {Boom} Rethrows as Boom error with appropriate status
     */
    _mapUpstreamError(error) {
        // Check if this is a timeout error
        if (error.code === 'ETIMEDOUT' || error.type === 'request-timeout') {
            throw Boom.gatewayTimeout('Request to upstream API timed out', {
                code: 'TIMEOUT',
                details: null
            });
        }

        // Check if this is a network error
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.type === 'system') {
            throw Boom.badGateway('Failed to connect to upstream API', {
                code: 'NETWORK_ERROR',
                details: {
                    error: error.message
                }
            });
        }

        // Check if we have an HTTP response from upstream
        if (!error.response) {
            // Unknown error without response
            throw Boom.internal('Unexpected error calling upstream API', {
                code: 'UNKNOWN_ERROR',
                details: {
                    error: error.message
                }
            });
        }

        const { status, data } = error.response;

        // Map by status code
        switch (status) {
            case 401: {
                // Check if this is specifically a token expiration
                const isExpired =
                    data?.error === 'token_expired' ||
                    data?.error === 'expired_token' ||
                    (data?.error_description && data.error_description.toLowerCase().includes('expired'));

                const code = isExpired ? 'EXPIRED_TOKEN' : 'INVALID_AUTH';
                const message = isExpired
                    ? 'Access token has expired'
                    : 'Authentication credentials are invalid or expired';

                // Note: Boom.unauthorized(message, scheme, attributes) - second param is WWW-Authenticate scheme
                // We pass null for scheme and set data manually
                const boomError = Boom.unauthorized(message);
                boomError.data = {
                    code,
                    details: data,
                    upstreamStatus: status
                };
                throw boomError;
            }

            case 403:
                throw Boom.forbidden('Insufficient permissions for this operation', {
                    code: 'PERMISSION_DENIED',
                    details: data,
                    upstreamStatus: status
                });

            case 404:
                throw Boom.notFound('Resource not found', {
                    code: 'NOT_FOUND',
                    details: data,
                    upstreamStatus: status
                });

            case 429:
                throw Boom.tooManyRequests('Rate limit exceeded for this API', {
                    code: 'RATE_LIMITED',
                    details: data,
                    upstreamStatus: status
                });

            case 503:
                throw Boom.serverUnavailable('Upstream service is unavailable', {
                    code: 'SERVICE_UNAVAILABLE',
                    details: data,
                    upstreamStatus: status
                });

            default: {
                // For all other errors (400, 500, etc.)
                const boomError = status >= 500
                    ? Boom.internal('Upstream API returned an error', {
                        code: 'UPSTREAM_ERROR',
                        details: data,
                        upstreamStatus: status
                    })
                    : Boom.badRequest('Upstream API returned an error', {
                        code: 'UPSTREAM_ERROR',
                        details: data,
                        upstreamStatus: status
                    });

                // Override status to match upstream
                boomError.output.statusCode = status;
                // For 5xx errors, Boom.internal uses a generic message, so override it
                if (status >= 500) {
                    boomError.output.payload.message = 'Upstream API returned an error';
                }
                throw boomError;
            }
        }
    }
}

module.exports = { ExecuteProxyRequest };
