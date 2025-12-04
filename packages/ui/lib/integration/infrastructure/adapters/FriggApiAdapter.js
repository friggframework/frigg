/**
 * @file Frigg API Adapter
 * @description Infrastructure adapter for Frigg backend API
 * Handles all HTTP communication with the Frigg backend
 */

export class FriggApiAdapter {
    constructor(config = {}) {
        // Default to v2 API path for new clients
        this.baseUrl = config.baseUrl || '/api/v2';
        this.headers = config.headers || {};
        this.authToken = config.authToken || null;
    }

    /**
     * Set authentication token
     */
    setAuthToken(token) {
        this.authToken = token;
    }

    /**
     * Get default headers with auth
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            ...this.headers
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        return headers;
    }

    /**
     * Generic fetch wrapper with error handling
     */
    async fetch(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // =========================================================================
    // ENTITY TYPES ENDPOINTS (v2 API)
    // =========================================================================

    /**
     * GET /api/entities/types - List available entity types
     */
    async listEntityTypes() {
        return await this.fetch('/entities/types');
    }

    /**
     * GET /api/entities/types/:typeName - Get entity type metadata
     * @param {string} typeName - Entity type name (e.g., 'slack', 'hubspot')
     */
    async getEntityType(typeName) {
        return await this.fetch(`/entities/types/${encodeURIComponent(typeName)}`);
    }

    /**
     * GET /api/entities/types/:typeName/requirements - Get authorization requirements
     * @param {string} typeName - Entity type name (e.g., 'slack', 'hubspot')
     * @param {number} step - Step number for multi-step auth (default: 1)
     */
    async getEntityTypeRequirements(typeName, step = 1) {
        return await this.fetch(`/entities/types/${encodeURIComponent(typeName)}/requirements?step=${step}`);
    }

    // =========================================================================
    // CREDENTIAL ENDPOINTS (v2 API)
    // =========================================================================

    /**
     * GET /api/credentials - List user's credentials
     */
    async listCredentials() {
        return await this.fetch('/credentials');
    }

    /**
     * GET /api/credentials/:credentialId - Get credential details (tokens masked)
     */
    async getCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}`);
    }

    /**
     * DELETE /api/credentials/:credentialId - Delete credential
     */
    async deleteCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}`, { method: 'DELETE' });
    }

    /**
     * GET /api/credentials/:credentialId/reauthorize - Get reauthorization requirements
     * @param {string} credentialId - Credential ID
     * @param {number} step - Step number for multi-step auth (default: 1)
     */
    async getCredentialReauthorizeRequirements(credentialId, step = 1) {
        return await this.fetch(`/credentials/${credentialId}/reauthorize?step=${step}`);
    }

    /**
     * POST /api/credentials/:credentialId/reauthorize - Submit reauthorization data
     * @param {string} credentialId - Credential ID
     * @param {object} data - Authorization data
     * @param {number} step - Step number (optional)
     * @param {string} sessionId - Session ID (for multi-step flows)
     */
    async reauthorizeCredential(credentialId, data, step = 1, sessionId = null) {
        const body = { data, step };
        if (sessionId) body.sessionId = sessionId;

        return await this.fetch(`/credentials/${credentialId}/reauthorize`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // =========================================================================
    // ENTITY ENDPOINTS (v2 API)
    // =========================================================================

    /**
     * GET /api/entities - Get user's entities
     */
    async getEntities() {
        return await this.fetch('/entities');
    }

    /**
     * GET /api/entities/:entityId - Get specific entity
     */
    async getEntity(entityId) {
        return await this.fetch(`/entities/${entityId}`);
    }

    /**
     * DELETE /api/entities/:entityId - Delete entity
     */
    async deleteEntity(entityId) {
        return await this.fetch(`/entities/${entityId}`, { method: 'DELETE' });
    }

    /**
     * GET /api/entities/:entityId/test-auth - Test entity authentication
     */
    async testEntityAuth(entityId) {
        return await this.fetch(`/entities/${entityId}/test-auth`);
    }

    /**
     * POST /api/entities/:entityId/options - Get entity options
     */
    async getEntityOptions(entityId, body = {}) {
        return await this.fetch(`/entities/${entityId}/options`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    /**
     * POST /api/entities/:entityId/options/refresh - Refresh entity options
     */
    async refreshEntityOptions(entityId) {
        return await this.fetch(`/entities/${entityId}/options/refresh`, {
            method: 'POST',
            body: JSON.stringify({})
        });
    }

    /**
     * POST /api/entities/:entityId/proxy - Proxy API request through entity
     * @param {string} entityId - Entity ID
     * @param {object} request - Proxy request
     * @param {string} request.method - HTTP method (GET, POST, PUT, PATCH, DELETE)
     * @param {string} request.path - API path
     * @param {object} request.query - Query parameters
     * @param {object} request.headers - Additional headers
     * @param {*} request.body - Request body
     */
    async proxyEntityRequest(entityId, request) {
        return await this.fetch(`/entities/${entityId}/proxy`, {
            method: 'POST',
            body: JSON.stringify(request)
        });
    }

    // =========================================================================
    // INTEGRATION ENDPOINTS (MINOR UPDATES)
    // =========================================================================

    /**
     * GET /api/integrations/options - Get available integration types
     */
    async getIntegrationOptions() {
        return await this.fetch('/integrations/options');
    }

    /**
     * GET /api/integrations - Get user's installed integrations
     */
    async getIntegrations() {
        return await this.fetch('/integrations');
    }

    /**
     * GET /api/integrations/:id - Get specific integration
     */
    async getIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}`);
    }

    /**
     * POST /api/integrations - Create new integration
     */
    async createIntegration(data) {
        return await this.fetch('/integrations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PATCH /api/integrations/:id - Update integration
     */
    async updateIntegration(integrationId, data) {
        return await this.fetch(`/integrations/${integrationId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE /api/integrations/:id - Delete integration
     */
    async deleteIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}`, {
            method: 'DELETE'
        });
    }

    /**
     * GET /api/integrations/:id/test - Test integration (RENAMED from test-auth)
     */
    async testIntegration(integrationId) {
        return await this.fetch(`/integrations/${integrationId}/test`);
    }

    /**
     * GET /api/config/integration-settings - Get integration UI settings
     */
    async getIntegrationSettings() {
        return await this.fetch('/config/integration-settings');
    }

    // =========================================================================
    // LEGACY ENDPOINTS (BACKWARD COMPATIBILITY)
    // =========================================================================

    /**
     * @deprecated Use getModuleAuthorizationRequirements instead
     * GET /api/authorize?entityType=X - Get authorization requirements
     */
    async getAuthorizationRequirements(entityType) {
        return await this.fetch(`/authorize?entityType=${encodeURIComponent(entityType)}`);
    }

    /**
     * @deprecated Use submitModuleAuthorization instead
     * POST /api/authorize - Complete authorization (OAuth or form-based)
     */
    async authorizeEntity(entityType, data) {
        return await this.fetch('/authorize', {
            method: 'POST',
            body: JSON.stringify({
                entityType,
                ...data
            })
        });
    }

    // =========================================================================
    // ADMIN ENDPOINTS (if user has admin access)
    // =========================================================================

    /**
     * GET /api/admin/global-entities - List global entities
     */
    async getGlobalEntities() {
        return await this.fetch('/admin/global-entities');
    }

    /**
     * POST /api/admin/global-entities - Create/update global entity
     */
    async createGlobalEntity(data) {
        return await this.fetch('/admin/global-entities', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE /api/admin/global-entities/:id - Delete global entity
     */
    async deleteGlobalEntity(entityId) {
        return await this.fetch(`/admin/global-entities/${entityId}`, {
            method: 'DELETE'
        });
    }

    /**
     * POST /api/admin/global-entities/:id/test - Test global entity
     */
    async testGlobalEntity(entityId) {
        return await this.fetch(`/admin/global-entities/${entityId}/test`, {
            method: 'POST'
        });
    }
}
