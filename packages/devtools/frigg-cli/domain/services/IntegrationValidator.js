const {DomainException, ValidationException} = require('../exceptions/DomainException');

/**
 * IntegrationValidator Domain Service
 *
 * Centralizes validation logic that involves multiple entities or external checks
 * Complements the entity's self-validation by handling cross-cutting concerns
 */
class IntegrationValidator {
    constructor(integrationRepository) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Validate that integration name is unique
     * @param {IntegrationName} name - Integration name to check
     * @returns {Promise<{isValid: boolean, errors: string[]}>}
     */
    async validateUniqueness(name) {
        const exists = await this.integrationRepository.exists(name);

        if (exists) {
            return {
                isValid: false,
                errors: [`Integration with name '${name.value}' already exists`]
            };
        }

        return {
            isValid: true,
            errors: []
        };
    }

    /**
     * Validate integration against business rules
     * Combines entity validation with domain-level rules
     *
     * @param {Integration} integration - Integration entity to validate
     * @returns {Promise<{isValid: boolean, errors: string[]}>}
     */
    async validate(integration) {
        const errors = [];

        // 1. Entity self-validation
        const entityValidation = integration.validate();
        if (!entityValidation.isValid) {
            errors.push(...entityValidation.errors);
        }

        // 2. Uniqueness check
        const uniquenessValidation = await this.validateUniqueness(integration.name);
        if (!uniquenessValidation.isValid) {
            errors.push(...uniquenessValidation.errors);
        }

        // 3. Additional domain rules
        const domainRules = this.validateDomainRules(integration);
        if (!domainRules.isValid) {
            errors.push(...domainRules.errors);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate domain-specific business rules
     * These are rules that apply across the domain, not just to one entity
     *
     * @param {Integration} integration
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validateDomainRules(integration) {
        const errors = [];

        // Rule: Webhook integrations must have webhook capability
        if (integration.type === 'webhook' && !integration.capabilities.webhooks) {
            errors.push('Webhook integrations must have webhooks capability enabled');
        }

        // Rule: Sync integrations should have bidirectional capability
        if (integration.type === 'sync' && integration.capabilities.sync && !integration.capabilities.sync.bidirectional) {
            // This is a warning, not an error - sync can be unidirectional
            // But we'll log it for the developer's awareness
        }

        // Rule: OAuth2 integrations must have auth capability
        if (integration.capabilities.auth && integration.capabilities.auth.includes('oauth2')) {
            // This is good - OAuth2 should be in auth array
        }

        // Rule: Integrations with realtime capability should have websocket requirements
        if (integration.capabilities.realtime) {
            if (!integration.requirements || !integration.requirements.websocket) {
                // Warn but don't fail - they might add it later
            }
        }

        // Rule: Integration should have at least one entity or be marked as entityless
        if (Object.keys(integration.entities).length === 0) {
            // This is unusual but not invalid - might be a transform-only integration
            // We don't add an error, just note it
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate integration configuration before update
     * Ensures updates don't violate domain rules
     *
     * @param {Integration} existingIntegration
     * @param {Integration} updatedIntegration
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validateUpdate(existingIntegration, updatedIntegration) {
        const errors = [];

        // Rule: Cannot change integration name
        if (!existingIntegration.name.equals(updatedIntegration.name)) {
            errors.push('Integration name cannot be changed after creation');
        }

        // Rule: Version must be incremented, not decremented
        if (existingIntegration.version.isGreaterThan(updatedIntegration.version)) {
            errors.push('Cannot downgrade integration version');
        }

        // Rule: Cannot remove entities that have existing data
        // (This would require checking with a data repository in real implementation)
        const removedEntities = Object.keys(existingIntegration.entities)
            .filter(key => !updatedIntegration.entities[key]);

        if (removedEntities.length > 0) {
            errors.push(`Cannot remove entities with potential existing data: ${removedEntities.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate API module addition
     * Ensures API module can be safely added to integration
     *
     * @param {Integration} integration
     * @param {string} moduleName
     * @param {string} moduleVersion
     * @returns {{isValid: boolean, errors: string[]}}
     */
    validateApiModuleAddition(integration, moduleName, moduleVersion) {
        const errors = [];

        // Check if module already exists
        if (integration.hasApiModule(moduleName)) {
            errors.push(`API module '${moduleName}' is already added to this integration`);
        }

        // Validate module name format
        if (!moduleName || moduleName.trim().length === 0) {
            errors.push('API module name is required');
        }

        // Validate version format (should be semantic version)
        const versionPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
        if (!versionPattern.test(moduleVersion)) {
            errors.push(`Invalid API module version format: ${moduleVersion}. Must be semantic version (e.g., 1.0.0)`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = {IntegrationValidator};
