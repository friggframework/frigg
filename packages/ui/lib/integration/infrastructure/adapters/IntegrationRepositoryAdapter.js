/**
 * @file Integration Repository Adapter
 * @description Adapter for integration repository operations
 * Implements the repository pattern for integrations
 */

import { Integration } from '../../domain/Integration.js';
import { IntegrationOption } from '../../domain/IntegrationOption.js';

export class IntegrationRepositoryAdapter {
    constructor(api, cachedOptions = null) {
        this.api = api;
        this.cachedOptions = cachedOptions;
    }

    /**
     * Get all available integration options
     */
    async getAvailableIntegrations() {
        // Use cached data if available
        if (this.cachedOptions && this.cachedOptions.length > 0) {
            console.log('[IntegrationRepositoryAdapter] Using cached integration options:', {
                count: this.cachedOptions.length,
                types: this.cachedOptions.map(i => i.type)
            });
            return this.cachedOptions.map(opt => IntegrationOption.fromApiResponse(opt));
        }

        const response = await this.api.listIntegrationOptions();
        console.log('[IntegrationRepositoryAdapter] Fetched listIntegrationOptions:', {
            hasIntegrations: !!response.integrations,
            integrationsLength: response.integrations?.length || 0,
            firstIntegration: response.integrations?.[0],
            allTypes: response.integrations?.map(i => i.type)
        });
        const options = response.integrations || [];
        return options.map(opt => IntegrationOption.fromApiResponse(opt));
    }

    /**
     * Get integration options (alias for compatibility)
     */
    async getIntegrationOptions() {
        // Use cached data if available
        if (this.cachedOptions && this.cachedOptions.length > 0) {
            console.log('[IntegrationRepositoryAdapter] Using cached integration options (alias)');
            return {
                integrations: this.cachedOptions
            };
        }

        const response = await this.api.listIntegrationOptions();
        console.log('[IntegrationRepositoryAdapter] Fetched listIntegrationOptions (alias)');
        return {
            integrations: response.integrations || []
        };
    }

    /**
     * Get all installed integrations for the user
     */
    async getInstalledIntegrations() {
        const response = await this.api.listIntegrations();
        const integrations = response.integrations || [];
        return integrations.map(int => Integration.fromApiResponse(int));
    }

    /**
     * Get integrations (alias for compatibility)
     */
    async getIntegrations() {
        const response = await this.api.listIntegrations();
        return response.integrations || [];
    }

    /**
     * Get a specific integration by ID
     */
    async getIntegrationById(integrationId) {
        const response = await this.api.getIntegration(integrationId);
        return Integration.fromApiResponse(response);
    }

    /**
     * Get integration (alias for compatibility)
     */
    async getIntegration(integrationId) {
        return await this.api.getIntegration(integrationId);
    }

    /**
     * Check if integration type is already installed
     */
    async isIntegrationInstalled(integrationType) {
        const installed = await this.getInstalledIntegrations();
        return installed.some(int => int.type === integrationType);
    }

    /**
     * Create a new integration
     */
    async createIntegration(integrationType, entityIds, config = {}) {
        // The API expects entities array with IDs
        const response = await this.api.createIntegration(
            entityIds[0], // Primary entity
            entityIds[1] || entityIds[0], // Secondary entity (or same if only one)
            { ...config, entity: integrationType }
        );
        return Integration.fromApiResponse(response);
    }

    /**
     * Update an existing integration
     */
    async updateIntegration(integrationId, updates) {
        const response = await this.api.updateIntegration(integrationId, updates);
        return Integration.fromApiResponse(response);
    }

    /**
     * Delete an integration
     */
    async deleteIntegration(integrationId) {
        await this.api.deleteIntegration(integrationId);
        return true;
    }

    /**
     * Get configuration options for an integration
     */
    async getConfigOptions(integrationId) {
        return await this.api.getIntegrationConfigOptions(integrationId);
    }
}
