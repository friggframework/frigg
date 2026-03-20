import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationClass, IntegrationDTO } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

interface ModuleRepository {
    findEntitiesByIds(ids: string[]): Promise<Array<{ id: string; [key: string]: unknown }>>;
}

export class GetIntegrationsForUser {
    private integrationRepository: IntegrationRepositoryInterface;
    private integrationClasses: IntegrationClass[];
    private moduleFactory: ModuleFactory;
    private moduleRepository: ModuleRepository;

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

    async execute(userId: string): Promise<IntegrationDTO[]> {
        const integrationRecords = await this.integrationRepository.findIntegrationsByUserId(userId);

        const integrations: IntegrationDTO[] = [];

        for (const integrationRecord of integrationRecords) {
            const entities = await this.moduleRepository.findEntitiesByIds(
                integrationRecord.entitiesIds
            );

            const integrationClass = this.integrationClasses.find(
                (ic) => ic.Definition.name === integrationRecord.config.type
            );

            const modules: unknown[] = [];
            for (const entity of entities) {
                const moduleInstance = await this.moduleFactory.getModuleInstance(
                    entity.id,
                    integrationRecord.userId
                );
                modules.push(moduleInstance);
            }

            const integrationData = {
                id: integrationRecord.id,
                userId: integrationRecord.userId,
                entities: entities,
                config: integrationRecord.config,
                status: integrationRecord.status,
                version: integrationRecord.version,
                messages: integrationRecord.messages || { errors: [], warnings: [] },
                modules,
                options: integrationClass!.getOptionDetails(),
            };

            integrations.push(
                mapIntegrationClassToIntegrationDTO(integrationData) as IntegrationDTO
            );
        }

        return integrations;
    }
}
