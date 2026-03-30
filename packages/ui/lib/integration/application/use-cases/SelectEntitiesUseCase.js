/**
 * @file Select Entities Use Case
 * @description Helps users select appropriate entities for an integration
 * Handles smart defaults, validation, and entity matching
 */

export class SelectEntitiesUseCase {
    constructor(integrationService, entityService) {
        this.integrationService = integrationService;
        this.entityService = entityService;
    }

    /**
     * Get entity selection requirements for an integration
     * @param {string} integrationType - The integration type
     * @returns {Promise<object>} Entity selection requirements and options
     */
    async getSelectionRequirements(integrationType) {
        // Get integration option
        const availableIntegrations = await this.integrationService.getAvailableIntegrations();
        console.log('[SelectEntitiesUseCase] Looking for integration type:', integrationType);
        console.log('[SelectEntitiesUseCase] Available integrations:', availableIntegrations.map(opt => ({
            type: opt.type,
            displayName: opt.displayName
        })));

        const integrationOption = availableIntegrations.find(opt => opt.type === integrationType);

        if (!integrationOption) {
            console.error('[SelectEntitiesUseCase] Integration not found. Available types:', availableIntegrations.map(opt => opt.type));
            throw new Error(`Integration type "${integrationType}" not found`);
        }

        // Get required entity types (excluding global entities)
        const requiredTypes = integrationOption.getRequiredUserEntityTypes();
        const optionalTypes = integrationOption.getOptionalUserEntityTypes();

        // Get user's entities grouped by type
        const entitiesByType = await this.entityService.getEntitiesByType();

        // Build requirements object
        const requirements = {
            integration: {
                type: integrationType,
                displayName: integrationOption.displayName,
                description: integrationOption.description
            },
            required: requiredTypes.map(type => ({
                type,
                label: this.getEntityTypeLabel(type, integrationOption),
                entities: (entitiesByType[type] || []).filter(e => e.isConnected()),
                hasEntities: (entitiesByType[type] || []).some(e => e.isConnected())
            })),
            optional: optionalTypes.map(type => ({
                type,
                label: this.getEntityTypeLabel(type, integrationOption),
                entities: (entitiesByType[type] || []).filter(e => e.isConnected()),
                hasEntities: (entitiesByType[type] || []).some(e => e.isConnected())
            }))
        };

        return requirements;
    }

    /**
     * Get smart default entity selections
     * Returns the best entity for each required type
     */
    async getDefaultSelections(integrationType) {
        const requirements = await this.getSelectionRequirements(integrationType);
        const selections = {};

        for (const req of requirements.required) {
            if (req.entities.length > 0) {
                // Select most recently created entity
                const sorted = [...req.entities].sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                selections[req.type] = sorted[0].id;
            } else {
                selections[req.type] = null; // Need to create
            }
        }

        return selections;
    }

    /**
     * Validate entity selections for an integration
     * @param {string} integrationType - The integration type
     * @param {object} selections - Map of entity type to entity ID
     * @returns {object} Validation result
     */
    async validateSelections(integrationType, selections) {
        const requirements = await this.getSelectionRequirements(integrationType);
        const errors = [];
        const warnings = [];

        // Check all required types have selections
        for (const req of requirements.required) {
            const selectedId = selections[req.type];

            if (!selectedId) {
                errors.push({
                    type: req.type,
                    message: `Required entity type "${req.type}" not selected`
                });
                continue;
            }

            // Validate entity exists and is connected
            const entity = req.entities.find(e => e.id === selectedId);
            if (!entity) {
                errors.push({
                    type: req.type,
                    message: `Selected entity not found`
                });
            } else if (!entity.isConnected()) {
                errors.push({
                    type: req.type,
                    message: `Selected entity is not connected`
                });
            }
        }

        // Check for duplicate selections
        const selectedIds = Object.values(selections).filter(Boolean);
        const uniqueIds = new Set(selectedIds);
        if (selectedIds.length !== uniqueIds.size) {
            warnings.push({
                message: 'Same entity selected multiple times'
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get entity type label from integration definition
     */
    getEntityTypeLabel(type, integrationOption) {
        if (integrationOption.entities && integrationOption.entities[type]) {
            return integrationOption.entities[type].label || type;
        }
        return type;
    }

    /**
     * Get missing entity types that need to be created
     */
    async getMissingEntityTypes(integrationType) {
        const requirements = await this.getSelectionRequirements(integrationType);
        return requirements.required
            .filter(req => !req.hasEntities)
            .map(req => ({
                type: req.type,
                label: req.label
            }));
    }
}
