/**
 * @file Connect Entity Use Case
 * @description Orchestrates the flow of connecting a new entity (OAuth or form-based)
 */

export class ConnectEntityUseCase {
    constructor(entityService, oauthStateStorage) {
        this.entityService = entityService;
        this.oauthStateStorage = oauthStateStorage;
    }

    /**
     * Start OAuth connection flow
     * @param {string} entityType - The entity type to connect
     * @param {object} context - Context to preserve (e.g., integration type, return URL)
     * @returns {Promise<object>} Authorization requirements with URL
     */
    async startOAuthFlow(entityType, context = {}) {
        // Get authorization requirements
        const authReqs = await this.entityService.getAuthorizationRequirements(entityType);

        if (authReqs.type !== 'oauth2') {
            throw new Error(`Entity type ${entityType} does not use OAuth`);
        }

        // Generate state and store context
        const state = this.generateState();
        await this.oauthStateStorage.saveState(state, {
            entityType,
            timestamp: Date.now(),
            ...context
        });

        // Return authorization URL with state
        return {
            url: authReqs.url,
            state,
            authReqs
        };
    }

    /**
     * Complete OAuth flow after redirect
     * @param {string} code - Authorization code from OAuth provider
     * @param {string} state - State parameter to validate
     * @returns {Promise<Entity>} The created entity
     */
    async completeOAuthFlow(code, state) {
        // Retrieve and validate state
        const context = await this.oauthStateStorage.getState(state);
        if (!context) {
            throw new Error('Invalid or expired OAuth state');
        }

        const { entityType } = context;

        // Complete authorization
        const entity = await this.entityService.completeOAuthFlow(
            entityType,
            code,
            state
        );

        // Clean up state
        await this.oauthStateStorage.removeState(state);

        return { entity, context };
    }

    /**
     * Connect entity with form-based credentials
     * @param {string} entityType - The entity type to connect
     * @param {object} credentials - Credentials data
     * @param {object} entityData - Additional entity data (name, etc.)
     * @returns {Promise<Entity>} The created entity
     */
    async connectWithCredentials(entityType, credentials, entityData = {}) {
        // Validate entity type supports form auth
        const authReqs = await this.entityService.getAuthorizationRequirements(entityType);

        if (authReqs.type === 'oauth2') {
            throw new Error(`Entity type ${entityType} requires OAuth, not form credentials`);
        }

        // Create entity
        const entity = await this.entityService.createEntityWithCredentials(
            entityType,
            credentials,
            entityData
        );

        return entity;
    }

    /**
     * Test connection for an existing entity
     * @param {string} entityId - The entity ID to test
     * @returns {Promise<object>} Test result
     */
    async testConnection(entityId) {
        return await this.entityService.testEntityConnection(entityId);
    }

    /**
     * Generate a random state string for OAuth
     */
    generateState() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Check if entity type requires OAuth or form auth
     */
    async getAuthType(entityType) {
        const authReqs = await this.entityService.getAuthorizationRequirements(entityType);
        return authReqs.type;
    }
}
