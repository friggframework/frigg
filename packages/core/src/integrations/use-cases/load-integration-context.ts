import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationRecord } from '../types';

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

interface ModuleRepository {
    findEntitiesByIds(ids: string[]): Promise<Array<{ id: string; [key: string]: unknown }>>;
}

interface IntegrationContext {
    record: IntegrationRecord & { entities: unknown[] };
    modules: unknown[];
}

export class LoadIntegrationContextUseCase {
    private integrationRepository: IntegrationRepositoryInterface;
    private moduleRepository: ModuleRepository;
    private moduleFactory: ModuleFactory;

    constructor({ integrationRepository, moduleRepository, moduleFactory }: {
        integrationRepository: IntegrationRepositoryInterface;
        moduleRepository: ModuleRepository;
        moduleFactory: ModuleFactory;
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

    async execute({ integrationId, integrationRecord }: {
        integrationId?: string;
        integrationRecord?: IntegrationRecord;
    }): Promise<IntegrationContext> {
        const record = integrationRecord
            ? integrationRecord
            : await this.integrationRepository.findIntegrationById(integrationId!);

        if (!record) {
            const error: Error & { code?: string } = new Error('Integration record not found');
            error.code = 'INTEGRATION_RECORD_NOT_FOUND';
            throw error;
        }

        if (!Array.isArray(record.entitiesIds) || record.entitiesIds.length === 0) {
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

        const modules: unknown[] = [];
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
