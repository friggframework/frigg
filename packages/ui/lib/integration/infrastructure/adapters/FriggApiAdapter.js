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
    // INTEGRATION ENDPOINTS
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
     * GET /api/config/integration-settings - Get integration UI settings
     */
    async getIntegrationSettings() {
        return await this.fetch('/config/integration-settings');
    }

    // =========================================================================
    // ENTITY ENDPOINTS
    // =========================================================================

    /**
     * GET /api/entities - Get user's entities
     */
    async getEntities() {
        return await this.fetch('/entities');
    }

    /**
     * GET /api/modules/:moduleType/authorization - Get authorization requirements
     * @param {string} moduleType - Module type to authorize
     * @param {number} step - Step number for multi-step flows
     * @param {string|null} sessionId - Session ID for multi-step flows
     * @param {Object} redirectContext - OAuth redirect context
     * @param {string} redirectContext.returnUrl - URL to return to after OAuth
     * @param {string} redirectContext.source - Source UI identifier
     */
    async getAuthorizationRequirements(moduleType, step = 1, sessionId = null, redirectContext = null) {
        const params = new URLSearchParams({ step: step.toString() });

        if (sessionId) {
            params.append('sessionId', sessionId);
        }

        // Add redirect context for OAuth session tracking
        if (redirectContext) {
            if (redirectContext.source) {
                params.append('source', redirectContext.source);
            }
            if (redirectContext.returnUrl) {
                params.append('returnUrl', redirectContext.returnUrl);
            }
            if (redirectContext.frontendBaseUrl) {
                params.append('frontendBaseUrl', redirectContext.frontendBaseUrl);
            }
        } else {
            // Default context for frigg-ui-library
            params.append('source', 'frigg-ui-library');
            params.append('returnUrl', window.location.pathname || '/');
            // Always include frontend base URL so backend knows where to redirect after OAuth
            params.append('frontendBaseUrl', window.location.origin);
        }

        return await this.fetch(`/modules/${moduleType}/authorization?${params.toString()}`);
    }

    /**
     * POST /api/modules/:moduleType/authorization - Complete authorization (OAuth or form-based)
     */
    async authorizeEntity(moduleType, data, step = null, sessionId = null, credentialId = null) {
        const params = { data };
        if (step) params.step = step;
        if (sessionId) params.sessionId = sessionId;
        if (credentialId) params.credentialId = credentialId;

        return await this.fetch(`/modules/${moduleType}/authorization`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    /**
     * POST /api/entities/:id/test - Test entity connection
     */
    async testEntity(entityId) {
        return await this.fetch(`/entities/${entityId}/test`, {
            method: 'POST'
        });
    }

    /**
     * DELETE /api/entities/:id - Delete entity
     */
    async deleteEntity(entityId) {
        return await this.fetch(`/entities/${entityId}`, {
            method: 'DELETE'
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
