class LoadIntegrationContextUseCase {
    constructor({
        integrationRepository,
        moduleRepository,
        moduleFactory,
    }) {
        if (!integrationRepository) {
            throw new Error('integrationRepository is required');
        }
        if (!moduleRepository) {
            throw new Error('moduleRepository is required');
        }
        if (!moduleFactory) {
            throw new Error('moduleFactory is required');
        }

        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
        this.moduleFactory = moduleFactory;
    }

    async execute({ integrationId, integrationRecord }) {
        const record = integrationRecord
            ? integrationRecord
            : await this.integrationRepository.findIntegrationById(
                  integrationId
              );

        if (!record) {
            const error = new Error('Integration record not found');
            error.code = 'INTEGRATION_RECORD_NOT_FOUND';
            throw error;
        }

        if (
            !Array.isArray(record.entitiesIds) ||
            record.entitiesIds.length === 0
        ) {
            return {
                record: {
                    ...record,
                    entities: [],
                },
                modules: [],
            };
        }

        const entities = await this.moduleRepository.findEntitiesByIds(
            record.entitiesIds
        );

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity.id,
                record.userId
            );
            modules.push(moduleInstance);
        }

        return {
            record: {
                ...record,
                entities,
            },
            modules,
        };
    }
}

module.exports = { LoadIntegrationContextUseCase };
