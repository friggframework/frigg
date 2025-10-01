/**
 * @file Entity Repository Adapter
 * @description Adapter for entity repository operations
 * Implements the repository pattern for entities (connected accounts)
 */

import { Entity } from '../../domain/Entity.js';

export class EntityRepositoryAdapter {
    constructor(api, cachedEntities = null) {
        this.api = api;
        this.cachedEntities = cachedEntities;
    }

    /**
     * Get all user entities
     */
    async getUserEntities() {
        // Use cached data if available
        if (this.cachedEntities) {
            console.log('[EntityRepositoryAdapter] Using cached entities');
            return this.cachedEntities.map(entity => Entity.fromApiResponse(entity));
        }

        const response = await this.api.listEntities();
        const entities = response.entities || [];
        return entities.map(entity => Entity.fromApiResponse(entity));
    }

    /**
     * Get entities (alias for compatibility with EntityService)
     */
    async getEntities() {
        // Use cached data if available
        if (this.cachedEntities) {
            console.log('[EntityRepositoryAdapter] Using cached entities (alias)');
            // Group by type for compatibility
            const entitiesByType = {};
            this.cachedEntities.forEach(entity => {
                const type = entity.type || 'unknown';
                if (!entitiesByType[type]) {
                    entitiesByType[type] = [];
                }
                entitiesByType[type].push(entity);
            });
            return {
                entities: this.cachedEntities,
                entitiesByType
            };
        }

        const response = await this.api.listEntities();
        console.log('[EntityRepositoryAdapter] Fetched listEntities');
        return response;
    }

    /**
     * Get entities grouped by type
     */
    async getEntitiesByType() {
        const response = await this.api.listEntities();
        return response.entitiesByType || {};
    }

    /**
     * Get a specific entity by ID
     */
    async getEntityById(entityId) {
        // Note: API doesn't have a getEntity endpoint yet
        // So we list all and filter
        const entities = await this.getUserEntities();
        const entity = entities.find(e => e.id === entityId);
        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }
        return entity;
    }

    /**
     * Get authorization requirements for an entity type
     */
    async getAuthorizationRequirements(entityType, connectingEntityType = '') {
        return await this.api.getAuthorizeRequirements(entityType, connectingEntityType);
    }

    /**
     * Create entity with OAuth flow
     */
    async completeOAuthFlow(entityType, code, state) {
        // This would call an OAuth completion endpoint
        // For now, assuming the authorize endpoint handles it
        return await this.api.authorize(entityType, { code, state });
    }

    /**
     * Create entity with form credentials
     */
    async createEntityWithCredentials(entityType, credentials, entityData = {}) {
        const result = await this.api.authorize(entityType, credentials);

        if (!result || result.error) {
            throw new Error(result?.error || 'Authorization failed');
        }

        // Return entity from result
        if (result.entity) {
            return Entity.fromApiResponse(result.entity);
        }

        // If entity_id is returned, fetch the entity
        if (result.entity_id) {
            return await this.getEntityById(result.entity_id);
        }

        throw new Error('No entity returned from authorization');
    }

    /**
     * Test entity connection
     */
    async testEntityConnection(entityId) {
        // TODO: Implement when API endpoint is available
        // return await this.api.testEntityConnection(entityId);
        throw new Error('Test connection not yet implemented');
    }

    /**
     * Delete an entity
     */
    async deleteEntity(entityId) {
        // TODO: Implement when API endpoint is available
        // await this.api.deleteEntity(entityId);
        throw new Error('Delete entity not yet implemented');
    }
}
