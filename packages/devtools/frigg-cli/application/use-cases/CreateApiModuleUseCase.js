const {ApiModule} = require('../../domain/entities/ApiModule');
const {ValidationException} = require('../../domain/exceptions/DomainException');

/**
 * CreateApiModuleUseCase
 *
 * Application layer use case for creating new API modules
 * Orchestrates API module creation with validation and persistence
 */
class CreateApiModuleUseCase {
    constructor(apiModuleRepository, unitOfWork, appDefinitionRepository = null) {
        this.apiModuleRepository = apiModuleRepository;
        this.unitOfWork = unitOfWork;
        this.appDefinitionRepository = appDefinitionRepository;
    }

    /**
     * Execute the use case
     * @param {object} request - Request data
     * @param {string} request.name - API module name (kebab-case)
     * @param {string} request.displayName - Human-readable name
     * @param {string} request.description - Description
     * @param {string} request.baseUrl - API base URL
     * @param {string} request.authType - Authentication type
     * @param {array} request.scopes - OAuth scopes
     * @param {array} request.credentials - Required credentials
     * @param {object} request.entities - Entity configurations
     * @param {object} request.endpoints - API endpoints
     * @returns {Promise<{success: boolean, apiModule: object}>}
     */
    async execute(request) {
        try {
            // 1. Create domain entity
            const apiModule = ApiModule.create({
                name: request.name,
                displayName: request.displayName,
                description: request.description,
                apiConfig: {
                    baseUrl: request.baseUrl || '',
                    authType: request.authType || 'oauth2',
                    version: request.apiVersion || 'v1'
                },
                entities: request.entities || {},
                scopes: request.scopes || [],
                credentials: request.credentials || [],
                endpoints: request.endpoints || {}
            });

            // 2. Validate business rules
            const validation = apiModule.validate();
            if (!validation.isValid) {
                throw new ValidationException(validation.errors);
            }

            // 3. Check for existing API module (uniqueness)
            const exists = await this.apiModuleRepository.exists(apiModule.name);
            if (exists) {
                throw new ValidationException(`API module '${apiModule.name}' already exists`);
            }

            // 4. Save through repository (writes files atomically)
            await this.apiModuleRepository.save(apiModule);

            // 5. Register in AppDefinition (if repository is available)
            if (this.appDefinitionRepository) {
                try {
                    const appDef = await this.appDefinitionRepository.load();
                    if (appDef) {
                        appDef.registerApiModule(apiModule.name, apiModule.version.value, 'local');
                        await this.appDefinitionRepository.save(appDef);
                    }
                } catch (error) {
                    console.warn('Could not register API module in app definition:', error.message);
                }
            }

            // 6. Commit transaction (cleanup backups)
            await this.unitOfWork.commit();

            return {
                success: true,
                apiModule: apiModule.toObject()
            };
        } catch (error) {
            // Rollback all file operations on error
            await this.unitOfWork.rollback();

            throw error;
        }
    }
}

module.exports = {CreateApiModuleUseCase};
