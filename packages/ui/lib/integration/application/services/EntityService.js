/**
 * @file Entity Service
 * @description Application service for entity (connected account) operations
 * Coordinates between domain models and infrastructure adapters
 */

import { Entity } from '../../domain/index.js';

export class EntityService {
    constructor(apiAdapter) {
        this.apiAdapter = apiAdapter;
    }

    /**
     * Get all user's entities
     */
    async getUserEntities() {
        const response = await this.apiAdapter.getEntities();
        return response.entities.map(entity => Entity.fromApiResponse(entity));
    }

    /**
     * Get entities grouped by type
     */
    async getEntitiesByType() {
        const response = await this.apiAdapter.getEntities();
        const entitiesByType = {};

        for (const [type, entities] of Object.entries(response.entitiesByType || {})) {
            entitiesByType[type] = entities.map(entity => Entity.fromApiResponse(entity));
        }

        return entitiesByType;
    }

    /**
     * Get entities of a specific type
     */
    async getEntitiesOfType(entityType) {
        const all = await this.getUserEntities();
        return all.filter(entity => entity.type === entityType);
    }

    /**
     * Get entities compatible with a specific integration
     */
    async getCompatibleEntities(integrationType) {
        const all = await this.getUserEntities();
        return all.filter(entity => entity.isCompatibleWith(integrationType));
    }

    /**
     * Get authorization requirements for a module type
     */
    async getAuthorizationRequirements(moduleType, step = 1, sessionId = null) {
        return await this.apiAdapter.getAuthorizationRequirements(moduleType, step, sessionId);
    }

    /**
     * Start OAuth flow for module type
     */
    async initiateOAuthFlow(moduleType, config = {}) {
        const authReqs = await this.getAuthorizationRequirements(moduleType);

        if (authReqs.type !== 'oauth2') {
            throw new Error(`Module type ${moduleType} does not support OAuth`);
        }

        return authReqs;
    }

    /**
     * Complete OAuth flow with authorization code
     */
    async completeOAuthFlow(moduleType, code, state) {
        const entity = await this.apiAdapter.authorizeEntity(moduleType, {
            code,
            state
        });
        return Entity.fromApiResponse(entity);
    }

    /**
     * Create entity with form-based credentials
     */
    async createEntityWithCredentials(moduleType, credentials, entityData = {}) {
        const entity = await this.apiAdapter.authorizeEntity(moduleType, {
            data: credentials,
            ...entityData
        });
        return Entity.fromApiResponse(entity);
    }

    /**
     * Test entity connection
     */
    async testEntityConnection(entityId) {
        try {
            await this.apiAdapter.testEntity(entityId);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete an entity
     */
    async deleteEntity(entityId) {
        await this.apiAdapter.deleteEntity(entityId);
    }

    /**
     * Check if user has any entities of a specific type
     */
    async hasEntityOfType(entityType) {
        const entities = await this.getEntitiesOfType(entityType);
        return entities.length > 0;
    }

    /**
     * Get connected (active) entities only
     */
    async getConnectedEntities() {
        const all = await this.getUserEntities();
        return all.filter(entity => entity.isConnected());
    }

    /**
     * Find best matching entity for an integration
     * Returns the most recently connected entity of the required type
     */
    async findBestEntityForIntegration(integrationType, requiredType) {
        const compatible = await this.getCompatibleEntities(integrationType);
        const ofType = compatible.filter(entity =>
            entity.type === requiredType && entity.isConnected()
        );

        if (ofType.length === 0) return null;

        // Sort by most recent
        ofType.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return ofType[0];
    }
}
