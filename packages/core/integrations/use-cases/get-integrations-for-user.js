// Removed Integration wrapper - using IntegrationBase directly
const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');
const {
    describeRecord,
    visibilityClauses,
    matchesListFilters,
} = require('../../modules/scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../../modules/scope-policy');

/**
 * Use case for retrieving the integrations a caller may see: the ones they own
 * or their active organization owns, created in that organization (ADR-056
 * §3.6), each with `tenancy` ({scope, owner, organizationId, access}).
 * @class GetIntegrationsForUser
 */
class GetIntegrationsForUser {
    /**
     * Creates a new GetIntegrationsForUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     * @param {import('../../modules/repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module and entity data operations.
     * @param {Object} [params.scopePolicy] - from createScopePolicy
     */
    constructor({
        integrationRepository,
        integrationClasses,
        moduleFactory,
        moduleRepository,
        scopePolicy,
    }) {
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
        /**
         * @type {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    /**
     * @async
     * @param {Object} user - authenticated User
     * @param {{scope?: string, owner?: string}} [filters] - `?scope=` and `?owner=`
     * @returns {Promise<Object[]>} Array of integration DTOs.
     */
    async execute(user, filters = {}) {
        const ctx = this.scopePolicy.accessContext(user);
        const records = await this.integrationRepository.findIntegrationsByOwnership(
            visibilityClauses(ctx, 'integration')
        );

        const integrations = [];
        for (const record of records) {
            // The query is the filter; the same rule again means a repository
            // that returns too much cannot widen the list.
            const tenancy = describeRecord(record, ctx, 'integration');
            if (!tenancy || !matchesListFilters(tenancy, filters)) continue;
            integrations.push({ ...(await this.toDto(record)), tenancy });
        }
        return integrations;
    }

    /** Hydrates one stored integration record into its DTO. */
    async toDto(integrationRecord) {
        const entities = await this.moduleRepository.findEntitiesByIds(
            integrationRecord.entitiesIds
        );

        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name ===
                integrationRecord.config.type
        );

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity.id,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        return mapIntegrationClassToIntegrationDTO({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: entities,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages || { errors: [], warnings: [] },
            modules,
            options: integrationClass.getOptionDetails(),
        });
    }
}

/**
 * Every integration one user id owns, with no organization rules: the lookup
 * behind the app-level `friggCommands.findIntegrationsByUserId`, which has a
 * user id and no request.
 */
class GetIntegrationsByUserId {
    /** @param {ConstructorParameters<typeof GetIntegrationsForUser>[0]} params */
    constructor(params) {
        this.integrationRepository = params.integrationRepository;
        this.hydrator = new GetIntegrationsForUser(params);
    }

    /** @param {string} userId */
    async execute(userId) {
        const records = await this.integrationRepository.findIntegrationsByUserId(
            userId
        );
        const integrations = [];
        for (const record of records) {
            integrations.push(await this.hydrator.toDto(record));
        }
        return integrations;
    }
}

module.exports = { GetIntegrationsForUser, GetIntegrationsByUserId };
