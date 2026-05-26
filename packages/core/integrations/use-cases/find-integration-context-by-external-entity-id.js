class FindIntegrationContextByExternalEntityIdUseCase {
    constructor({
        integrationRepository,
        moduleRepository,
        loadIntegrationContextUseCase,
    } = {}) {
        if (!integrationRepository) {
            throw new Error('integrationRepository is required');
        }
        if (!moduleRepository) {
            throw new Error('moduleRepository is required');
        }
        if (!loadIntegrationContextUseCase) {
            throw new Error('loadIntegrationContextUseCase is required');
        }

        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
        this.loadIntegrationContextUseCase = loadIntegrationContextUseCase;
    }

    async execute({ externalId }) {
        if (!externalId) {
            const error = new Error('externalId is required');
            error.code = 'EXTERNAL_ID_REQUIRED';
            throw error;
        }

        const entity = await this.moduleRepository.findEntity({
            externalId,
        });

        if (!entity) {
            const error = new Error(
                `Entity not found for externalId: ${externalId}`
            );
            error.code = 'ENTITY_NOT_FOUND';
            throw error;
        }

        const integrations =
            await this.integrationRepository.findIntegrationsByEntityId(
                entity.id
            );

        if (!integrations || integrations.length === 0) {
            const error = new Error(
                `Integration not found for entity: ${entity.id}`
            );
            error.code = 'INTEGRATION_NOT_FOUND';
            throw error;
        }

        const integrationRecord = integrations[0];

        const context = await this.loadIntegrationContextUseCase.execute({
            integrationRecord,
        });

        return {
            context,
            entity,
            record: integrationRecord,
        };
    }
}

module.exports = { FindIntegrationContextByExternalEntityIdUseCase };
