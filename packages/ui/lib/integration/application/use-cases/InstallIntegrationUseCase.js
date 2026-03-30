/**
 * @file Install Integration Use Case
 * @description Orchestrates the complete flow of installing a new integration
 * Handles entity selection, validation, and integration creation
 */

export class InstallIntegrationUseCase {
    constructor(integrationService, entityService) {
        this.integrationService = integrationService;
        this.entityService = entityService;
    }

    /**
     * Execute the installation flow
     * @param {string} integrationType - The integration type to install
     * @param {string[]} entityIds - Array of entity IDs to use
     * @param {object} config - Additional integration configuration
     * @returns {Promise<Integration>} The created integration
     */
    async execute(integrationType, entityIds, config = {}) {
        // 1. Check if integration is already installed
        const isInstalled = await this.integrationService.isIntegrationInstalled(integrationType);
        if (isInstalled) {
            throw new Error(`Integration "${integrationType}" is already installed`);
        }

        // 2. Get integration option details
        const availableIntegrations = await this.integrationService.getAvailableIntegrations();
        const integrationOption = availableIntegrations.find(opt => opt.type === integrationType);

        if (!integrationOption) {
            throw new Error(`Integration type "${integrationType}" not found`);
        }

        // 3. Validate entities exist and are connected
        const userEntities = await this.entityService.getUserEntities();
        const selectedEntities = entityIds.map(id =>
            userEntities.find(entity => entity.id === id)
        );

        if (selectedEntities.some(entity => !entity)) {
            throw new Error('One or more selected entities not found');
        }

        if (selectedEntities.some(entity => !entity.isConnected())) {
            throw new Error('All entities must be in CONNECTED status');
        }

        // 4. Validate required entity types are present
        const requiredTypes = integrationOption.getRequiredUserEntityTypes();
        const selectedTypes = selectedEntities.map(entity => entity.type);

        const missingTypes = requiredTypes.filter(type => !selectedTypes.includes(type));
        if (missingTypes.length > 0) {
            throw new Error(`Missing required entity types: ${missingTypes.join(', ')}`);
        }

        // 5. Create the integration
        const integration = await this.integrationService.createIntegration(
            integrationType,
            entityIds,
            config
        );

        return integration;
    }

    /**
     * Check if installation is possible (all required entities exist)
     */
    async canInstall(integrationType) {
        const availableIntegrations = await this.integrationService.getAvailableIntegrations();
        const integrationOption = availableIntegrations.find(opt => opt.type === integrationType);

        if (!integrationOption) {
            return { canInstall: false, reason: 'Integration type not found' };
        }

        const requiredTypes = integrationOption.getRequiredUserEntityTypes();
        const userEntities = await this.entityService.getUserEntities();
        const connectedEntities = userEntities.filter(e => e.isConnected());

        const availableTypes = [...new Set(connectedEntities.map(e => e.type))];
        const missingTypes = requiredTypes.filter(type => !availableTypes.includes(type));

        if (missingTypes.length > 0) {
            return {
                canInstall: false,
                reason: 'Missing required entities',
                missingTypes
            };
        }

        return { canInstall: true };
    }
}
