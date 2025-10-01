/**
 * @file Domain Entity Model
 * @description Core entity (connected account) domain model
 * Represents a user's connected account to an external service
 */

export class Entity {
    constructor({
        id,
        type,
        subType = null,
        name,
        status = 'CONNECTED',
        createdAt,
        updatedAt,
        externalId = null,
        credential = {},
        compatibleIntegrations = [],
        metadata = {}
    }) {
        this.id = id;
        this.type = type;
        this.subType = subType;
        this.name = name;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.externalId = externalId;
        this.credential = credential;
        this.compatibleIntegrations = compatibleIntegrations;
        this.metadata = metadata;
    }

    /**
     * Check if entity is connected and ready to use
     */
    isConnected() {
        return this.status === 'CONNECTED';
    }

    /**
     * Check if entity is compatible with a specific integration type
     */
    isCompatibleWith(integrationType) {
        return this.compatibleIntegrations.some(
            integration => integration.integrationType === integrationType
        );
    }

    /**
     * Get display name for UI
     */
    getDisplayName() {
        return this.name || `${this.type} Account`;
    }

    /**
     * Check if entity has errors
     */
    hasError() {
        return this.status === 'ERROR';
    }

    /**
     * Check if entity is disconnected
     */
    isDisconnected() {
        return this.status === 'DISCONNECTED';
    }

    /**
     * Serialize to plain object
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            subType: this.subType,
            name: this.name,
            status: this.status,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            externalId: this.externalId,
            credential: this.credential,
            compatibleIntegrations: this.compatibleIntegrations,
            metadata: this.metadata
        };
    }

    /**
     * Create from API response
     */
    static fromApiResponse(data) {
        return new Entity(data);
    }
}
