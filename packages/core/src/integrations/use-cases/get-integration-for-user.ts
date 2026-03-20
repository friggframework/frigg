import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationClass, IntegrationDTO } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Boom = require('@hapi/boom');

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

interface ModuleRepository {
    findEntitiesByIds(ids: string[]): Promise<Array<{ id: string; _id?: string; [key: string]: unknown }>>;
}

export class GetIntegrationForUser {
    private readonly integrationRepository: IntegrationRepositoryInterface;
    private readonly integrationClasses: IntegrationClass[];
    private readonly moduleFactory: ModuleFactory;
    private readonly moduleRepository: ModuleRepository;

    constructor({ integrationRepository, integrationClasses, moduleFactory, moduleRepository }: {
        integrationRepository: IntegrationRepositoryInterface;
        integrationClasses: IntegrationClass[];
        moduleFactory: ModuleFactory;
        moduleRepository: ModuleRepository;
    }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    async execute(integrationId: string, userId: string): Promise<IntegrationDTO> {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);
        const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord!.entitiesIds);

        if (!integrationRecord) {
            throw Boom.notFound(`Integration with id of ${integrationId} does not exist`);
        }

        if (integrationRecord.userId.toString() !== userId.toString()) {
            throw Boom.forbidden('User does not have access to this integration');
        }

        const integrationClass = this.integrationClasses.find(
            (ic) => ic.Definition.name === integrationRecord.config.type
        );

        const modules: unknown[] = [];
        for (const entity of entities) {
            const entityId = (entity as { _id?: string })._id || entity.id;
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass!({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: entities as unknown as string[],
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance) as IntegrationDTO;
    }
}
