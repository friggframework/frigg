/**
 * @file Integration Service
 * @description Application service for integration operations
 * Coordinates between domain models and infrastructure adapters
 */

import { Integration, IntegrationOption } from '../../domain/index.js';

export class IntegrationService {
    constructor(apiAdapter) {
        this.apiAdapter = apiAdapter;
    }

    /**
     * Get all available integration options
     */
    async getAvailableIntegrations() {
        const response = await this.apiAdapter.getIntegrationOptions();
        console.log('[IntegrationService] getAvailableIntegrations response:', {
            integrationsLength: response.integrations?.length || 0,
            firstIntegration: response.integrations?.[0],
            allTypes: response.integrations?.map(i => i.type || i.entity)
        });
        return response.integrations.map(option =>
            IntegrationOption.fromApiResponse(option)
        );
    }

    /**
     * Get user's installed integrations
     */
    async getInstalledIntegrations() {
        const integrations = await this.apiAdapter.getIntegrations();
        return integrations.map(integration =>
            Integration.fromApiResponse(integration)
        );
    }

    /**
     * Get a specific integration by ID
     */
    async getIntegrationById(integrationId) {
        const integration = await this.apiAdapter.getIntegration(integrationId);
        return Integration.fromApiResponse(integration);
    }

    /**
     * Create a new integration with entities
     */
    async createIntegration(integrationType, entityIds, config = {}) {
        const integrationData = await this.apiAdapter.createIntegration({
            entities: entityIds,
            config: {
                type: integrationType,
                ...config
            }
        });
        return Integration.fromApiResponse(integrationData);
    }

    /**
     * Update integration configuration
     */
    async updateIntegration(integrationId, config) {
        const updated = await this.apiAdapter.updateIntegration(integrationId, { config });
        return Integration.fromApiResponse(updated);
    }

    /**
     * Delete an integration
     */
    async deleteIntegration(integrationId) {
        await this.apiAdapter.deleteIntegration(integrationId);
    }

    /**
     * Get integration settings from app definition
     */
    async getIntegrationSettings() {
        return await this.apiAdapter.getIntegrationSettings();
    }

    /**
     * Check if a specific integration type is already installed
     */
    async isIntegrationInstalled(integrationType) {
        const installed = await this.getInstalledIntegrations();
        return installed.some(integration => integration.type === integrationType);
    }

    /**
     * Get compatible integrations for a set of entity types
     */
    async getCompatibleIntegrations(entityTypes) {
        const available = await this.getAvailableIntegrations();

        return available.filter(integration => {
            const requiredTypes = integration.getRequiredUserEntityTypes();
            // Check if we have all required entity types
            return requiredTypes.every(type => entityTypes.includes(type));
        });
    }
}
