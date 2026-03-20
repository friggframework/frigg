import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationClass, IntegrationConfig, IntegrationDTO } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

export class UpdateIntegration {
    private readonly integrationRepository: IntegrationRepositoryInterface;
    private readonly integrationClasses: IntegrationClass[];
    private readonly moduleFactory: ModuleFactory;

    constructor({ integrationRepository, integrationClasses, moduleFactory }: {
        integrationRepository: IntegrationRepositoryInterface;
        integrationClasses: IntegrationClass[];
        moduleFactory: ModuleFactory;
    }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    async execute(integrationId: string, userId: string, config: IntegrationConfig): Promise<IntegrationDTO> {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw new Error(
                `No integration found by the ID of ${integrationId}`
            );
        }

        const integrationClass = this.integrationClasses.find(
            (ic) => ic.Definition.name === integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${integrationRecord.config.type}`
            );
        }

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const modules: unknown[] = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        await integrationInstance.initialize();
        await integrationInstance.send('ON_UPDATE', { config });

        return mapIntegrationClassToIntegrationDTO(integrationInstance) as IntegrationDTO;
    }
}
