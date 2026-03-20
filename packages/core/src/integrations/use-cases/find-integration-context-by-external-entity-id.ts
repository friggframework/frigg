import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationRecord } from '../types';

interface ModuleRepository {
    findEntity(filter: { externalId: string }): Promise<{ id: string; userId?: string; [key: string]: unknown } | null>;
}

interface LoadIntegrationContextUseCase {
    execute(params: { integrationRecord: IntegrationRecord }): Promise<unknown>;
}

interface CodedError extends Error {
    code?: string;
}

export class FindIntegrationContextByExternalEntityIdUseCase {
    private integrationRepository: IntegrationRepositoryInterface;
    private moduleRepository: ModuleRepository;
    private loadIntegrationContextUseCase: LoadIntegrationContextUseCase;

    constructor({ integrationRepository, moduleRepository, loadIntegrationContextUseCase }: {
        integrationRepository: IntegrationRepositoryInterface;
        moduleRepository: ModuleRepository;
        loadIntegrationContextUseCase: LoadIntegrationContextUseCase;
    }) {
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

    async execute({ externalEntityId }: { externalEntityId: string }): Promise<{
        context: unknown;
        entity: unknown;
        record: IntegrationRecord;
    }> {
        if (!externalEntityId) {
            const error: CodedError = new Error('externalEntityId is required');
            error.code = 'EXTERNAL_ENTITY_ID_REQUIRED';
            throw error;
        }

        const entity = await this.moduleRepository.findEntity({
            externalId: externalEntityId,
        });

        if (!entity) {
            const error: CodedError = new Error(
                `Entity not found for externalId: ${externalEntityId}`
            );
            error.code = 'ENTITY_NOT_FOUND';
            throw error;
        }

        if (!entity.userId) {
            const error: CodedError = new Error('Entity does not have an associated user');
            error.code = 'ENTITY_USER_NOT_FOUND';
            throw error;
        }

        const integrationRecord = await this.integrationRepository.findIntegrationByUserId(
            entity.userId as string
        );

        if (!integrationRecord) {
            const error: CodedError = new Error(
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
