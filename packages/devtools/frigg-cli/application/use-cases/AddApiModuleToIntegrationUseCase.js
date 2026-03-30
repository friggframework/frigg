const {ValidationException} = require('../../domain/exceptions/DomainException');
const {IntegrationValidator} = require('../../domain/services/IntegrationValidator');

/**
 * AddApiModuleToIntegrationUseCase
 *
 * Application layer use case for adding API modules to existing integrations
 * Orchestrates the addition with validation and persistence
 */
class AddApiModuleToIntegrationUseCase {
    constructor(integrationRepository, apiModuleRepository, unitOfWork, integrationValidator = null, integrationJsUpdater = null) {
        this.integrationRepository = integrationRepository;
        this.apiModuleRepository = apiModuleRepository;
        this.unitOfWork = unitOfWork;
        this.integrationValidator = integrationValidator ||
            new IntegrationValidator(integrationRepository);
        this.integrationJsUpdater = integrationJsUpdater;
    }

    /**
     * Execute the use case
     * @param {object} request - Request data
     * @param {string} request.integrationName - Name of the integration
     * @param {string} request.moduleName - Name of the API module to add
     * @param {string} request.moduleVersion - Version of the API module
     * @param {string} request.source - Source of the module (npm, local, git)
     * @returns {Promise<{success: boolean, integration: object}>}
     */
    async execute(request) {
        try {
            // 1. Load the integration
            const integration = await this.integrationRepository.findByName(request.integrationName);
            if (!integration) {
                throw new ValidationException(`Integration '${request.integrationName}' not found`);
            }

            // 2. Verify API module exists
            const apiModuleExists = await this.apiModuleRepository.exists(request.moduleName);
            if (!apiModuleExists) {
                throw new ValidationException(`API module '${request.moduleName}' not found. Create it first with 'frigg create api-module ${request.moduleName}'`);
            }

            // 3. Validate API module addition
            const validation = this.integrationValidator.validateApiModuleAddition(
                integration,
                request.moduleName,
                request.moduleVersion || '1.0.0'
            );

            if (!validation.isValid) {
                throw new ValidationException(validation.errors);
            }

            // 4. Add the API module to the integration
            integration.addApiModule(
                request.moduleName,
                request.moduleVersion || '1.0.0',
                request.source || 'local'
            );

            // 5. Save the updated integration
            await this.integrationRepository.save(integration);

            // 6. Update Integration.js file to add module import and Definition entry
            if (this.integrationJsUpdater) {
                const integrationJsExists = await this.integrationJsUpdater.exists(request.integrationName);
                if (integrationJsExists) {
                    await this.integrationJsUpdater.addModuleToIntegration(
                        request.integrationName,
                        request.moduleName,
                        request.source || 'local'
                    );
                }
            }

            // 7. Commit transaction
            await this.unitOfWork.commit();

            return {
                success: true,
                integration: integration.toObject(),
                message: `API module '${request.moduleName}' added to integration '${request.integrationName}'`
            };
        } catch (error) {
            // Rollback all file operations on error
            await this.unitOfWork.rollback();

            throw error;
        }
    }
}

module.exports = {AddApiModuleToIntegrationUseCase};
