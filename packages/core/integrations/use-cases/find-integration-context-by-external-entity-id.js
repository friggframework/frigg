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

    async execute({ externalEntityId }) {
        if (!externalEntityId) {
            const error = new Error('externalEntityId is required');
            error.code = 'EXTERNAL_ENTITY_ID_REQUIRED';
            throw error;
        }

        const entity = await this.moduleRepository.findEntity({
            externalId: externalEntityId,
        });

        if (!entity) {
            const error = new Error(
                `Entity not found for externalId: ${externalEntityId}`
            );
            error.code = 'ENTITY_NOT_FOUND';
            throw error;
        }

        if (!entity.userId) {
            const error = new Error('Entity does not have an associated user');
            error.code = 'ENTITY_USER_NOT_FOUND';
            throw error;
        }

        const integrationRecord =
            await this.integrationRepository.findIntegrationByUserId(
                entity.userId
            );

        if (!integrationRecord) {
            const error = new Error(
                `Integration not found for user: ${entity.userId}`
            );
            error.code = 'INTEGRATION_NOT_FOUND';
            throw error;
        }

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
