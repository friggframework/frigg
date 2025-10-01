const {Integration} = require('../../domain/entities/Integration');
const {ValidationException} = require('../../domain/exceptions/DomainException');
const {IntegrationValidator} = require('../../domain/services/IntegrationValidator');

/**
 * CreateIntegrationUseCase
 * Application layer use case for creating new integrations
 * Uses IntegrationValidator domain service for comprehensive validation
 * Automatically registers integration in AppDefinition
 */
class CreateIntegrationUseCase {
    constructor(integrationRepository, unitOfWork, integrationValidator = null, appDefinitionRepository = null, backendJsUpdater = null) {
        this.integrationRepository = integrationRepository;
        this.unitOfWork = unitOfWork;
        this.appDefinitionRepository = appDefinitionRepository;
        this.backendJsUpdater = backendJsUpdater;
        // Allow validator injection for testing, or create default
        this.integrationValidator = integrationValidator ||
            new IntegrationValidator(integrationRepository);
    }

    /**
     * Execute the use case
     * @param {object} request - Request data
     * @param {string} request.name - Integration name (kebab-case)
     * @param {string} request.displayName - Human-readable name
     * @param {string} request.description - Description
     * @param {string} request.type - Integration type (api, webhook, sync, etc.)
     * @param {string} request.category - Category
     * @param {array} request.tags - Tags
     * @param {object} request.entities - Entity configuration
     * @param {object} request.capabilities - Capabilities
     * @param {object} request.requirements - Requirements
     * @returns {Promise<{success: boolean, integration: object}>}
     */
    async execute(request) {
        try {
            // 1. Create domain entity (validates name format via value object)
            const integration = Integration.create({
                name: request.name,
                displayName: request.displayName,
                description: request.description,
                type: request.type || 'custom',
                category: request.category,
                tags: request.tags || [],
                entities: request.entities || {},
                capabilities: request.capabilities || {},
                requirements: request.requirements || {},
                options: request.options || {}
            });

            // 2. Validate through domain service (entity rules + domain rules + uniqueness)
            const validation = await this.integrationValidator.validate(integration);
            if (!validation.isValid) {
                throw new ValidationException(validation.errors);
            }

            // 3. Save through repository (validates schema, writes files atomically)
            await this.integrationRepository.save(integration);

            // 4. Register in AppDefinition (if repository is available)
            if (this.appDefinitionRepository) {
                try {
                    const appDef = await this.appDefinitionRepository.load();
                    if (appDef) {
                        appDef.registerIntegration(integration.name.value);
                        await this.appDefinitionRepository.save(appDef);
                    }
                } catch (error) {
                    // Log but don't fail - app definition might not exist yet
                    console.warn('Could not register integration in app definition:', error.message);
                }
            }

            // 5. Register in backend.js (if updater is available)
            if (this.backendJsUpdater) {
                try {
                    if (await this.backendJsUpdater.exists()) {
                        await this.backendJsUpdater.registerIntegration(integration.name.value);
                    }
                } catch (error) {
                    // Log but don't fail - backend.js might not exist or have different structure
                    console.warn('Could not register integration in backend.js:', error.message);
                }
            }

            // 6. Commit transaction (cleanup backups)
            await this.unitOfWork.commit();

            return {
                success: true,
                integration: integration.toObject()
            };
        } catch (error) {
            // Rollback all file operations on error
            await this.unitOfWork.rollback();

            throw error;
        }
    }
}

module.exports = {CreateIntegrationUseCase};
