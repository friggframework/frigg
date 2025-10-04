/**
 * @file Frigg API Adapter
 * @description Infrastructure adapter for Frigg backend API
 * Handles all HTTP communication with the Frigg backend
 */

export class FriggApiAdapter {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '/api';
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
    // MODULE ENDPOINTS (NEW v2 API)
    // =========================================================================

    /**
     * GET /api/modules - List available module types
     */
    async listModules() {
        return await this.fetch('/modules');
    }

    /**
     * GET /api/modules/:moduleType/authorization - Get authorization requirements
     * @param {string} moduleType - Module type (e.g., 'slack', 'hubspot')
     * @param {number} step - Step number for multi-step auth (default: 1)
     * @param {string|null} sessionId - Session ID for steps > 1
     */
    async getModuleAuthorizationRequirements(moduleType, step = 1, sessionId = null) {
        let url = `/modules/${encodeURIComponent(moduleType)}/authorization?step=${step}`;
        if (sessionId) {
            url += `&sessionId=${encodeURIComponent(sessionId)}`;
        }
        return await this.fetch(url);
    }

    /**
     * POST /api/modules/:moduleType/authorization - Submit authorization data
     * @param {string} moduleType - Module type
     * @param {object} data - Authorization data
     * @param {number} step - Step number (optional for single-step)
     * @param {string} sessionId - Session ID (required for multi-step)
     * @param {string} credentialId - Credential ID (for steps > 1)
     */
    async submitModuleAuthorization(moduleType, data, step = null, sessionId = null, credentialId = null) {
        const body = { data };

        if (step) body.step = step;
        if (sessionId) body.sessionId = sessionId;
        if (credentialId) body.credentialId = credentialId;

        return await this.fetch(`/modules/${encodeURIComponent(moduleType)}/authorization`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // =========================================================================
    // CREDENTIAL ENDPOINTS (NEW)
    // =========================================================================

    /**
     * GET /api/credentials - List user's credentials
     * @param {object} filters - Optional filters
     * @param {string} filters.status - Filter by status (orphaned, active, invalid)
     * @param {string} filters.moduleType - Filter by module type
     */
    async listCredentials(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.moduleType) params.append('moduleType', filters.moduleType);

        const queryString = params.toString();
        return await this.fetch(`/credentials${queryString ? '?' + queryString : ''}`);
    }

    /**
     * GET /api/credentials/:credentialId - Get credential details
     */
    async getCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}`);
    }

    /**
     * DELETE /api/credentials/:credentialId - Delete credential
     * @param {string} credentialId - Credential ID
     * @param {boolean} cascade - Also delete dependent entities
     */
    async deleteCredential(credentialId, cascade = false) {
        const url = `/credentials/${credentialId}${cascade ? '?cascade=true' : ''}`;
        return await this.fetch(url, { method: 'DELETE' });
    }

    /**
     * GET /api/credentials/:credentialId/test - Test credential validity
     */
    async testCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/test`);
    }

    /**
     * POST /api/credentials/:credentialId/resume - Resume authorization from credential
     */
    async resumeAuthorizationFromCredential(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/resume`, {
            method: 'POST'
        });
    }

    /**
     * GET /api/credentials/:credentialId/options - Get options using credential
     */
    async getCredentialOptions(credentialId) {
        return await this.fetch(`/credentials/${credentialId}/options`);
    }

    // =========================================================================
    // ENTITY ENDPOINTS (UPDATED)
    // =========================================================================

    /**
     * GET /api/entities - Get user's entities
     * @param {object} filters - Optional filters
     * @param {string} filters.moduleType - Filter by module type
     */
    async getEntities(filters = {}) {
        const params = new URLSearchParams();
        if (filters.moduleType) params.append('moduleType', filters.moduleType);

        const queryString = params.toString();
        return await this.fetch(`/entities${queryString ? '?' + queryString : ''}`);
    }

    /**
     * GET /api/entities/:entityId - Get specific entity
     */
    async getEntity(entityId) {
        return await this.fetch(`/entities/${entityId}`);
    }

    /**
     * DELETE /api/entities/:entityId - Delete entity
     * @param {string} entityId - Entity ID
     * @param {boolean} deleteCredential - Also delete credential if unused
     */
    async deleteEntity(entityId, deleteCredential = false) {
        const url = `/entities/${entityId}${deleteCredential ? '?deleteCredential=true' : ''}`;
        return await this.fetch(url, { method: 'DELETE' });
    }

    /**
     * GET /api/entities/:entityId/test - Test entity connection (RENAMED from test-auth)
     */
    async testEntity(entityId) {
        return await this.fetch(`/entities/${entityId}/test`);
    }

    /**
     * POST /api/entities/:entityId/reauthorize - Initiate entity re-authentication (NEW)
     */
    async initiateEntityReauthorization(entityId) {
        return await this.fetch(`/entities/${entityId}/reauthorize`, {
            method: 'POST'
        });
    }

    /**
     * POST /api/entities/:entityId/reauthorize/complete - Complete re-authentication (NEW)
     */
    async completeEntityReauthorization(entityId, data) {
        return await this.fetch(`/entities/${entityId}/reauthorize/complete`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * POST /api/entities/:entityId/options - Get entity options
     */
    async getEntityOptions(entityId, optionType = null) {
        const body = optionType ? { optionType } : {};
        return await this.fetch(`/entities/${entityId}/options`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    /**
     * POST /api/entities/:entityId/options/refresh - Refresh entity options
     */
    async refreshEntityOptions(entityId, optionType = null) {
        const body = optionType ? { optionType } : {};
        return await this.fetch(`/entities/${entityId}/options/refresh`, {
            method: 'POST',
            body: JSON.stringify(body)
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
