import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationBase, IntegrationClass } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Boom = require('@hapi/boom');

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

interface ModuleRepository {
    findEntitiesByIds(ids: string[]): Promise<Array<{ id: string; [key: string]: unknown }>>;
}

export class GetIntegrationInstanceByDefinition {
    private integrationRepository: IntegrationRepositoryInterface;
    private moduleFactory: ModuleFactory;
    private moduleRepository: ModuleRepository;

    constructor({ integrationRepository, moduleFactory, moduleRepository }: {
        integrationRepository: IntegrationRepositoryInterface;
        moduleFactory: ModuleFactory;
        moduleRepository: ModuleRepository;
    }) {
        this.integrationRepository = integrationRepository;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    async execute(integrationClass: IntegrationClass): Promise<IntegrationBase> {
        const integrationRecord = await this.integrationRepository.findIntegrationByName(
            integrationClass.Definition.name
        );

        if (!integrationRecord) {
            throw Boom.notFound(
                `Integration with name of ${integrationClass.Definition.name} does not exist`
            );
        }

        const entities = await this.moduleRepository.findEntitiesByIds(
            integrationRecord.entitiesIds
        );

        const modules: unknown[] = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity.id,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: entities as unknown as string[],
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        await integrationInstance.initialize();

        return integrationInstance;
    }
}
