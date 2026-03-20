import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';
import type { IntegrationClass } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Boom = require('@hapi/boom');

interface ModuleFactory {
    getModuleInstance(entityId: string, userId: string): Promise<unknown>;
}

export class DeleteIntegrationForUser {
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

    async execute(integrationId: string, userId: string): Promise<void> {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw Boom.notFound(
                `Integration with id of ${integrationId} does not exist`
            );
        }

        const integrationClass = this.integrationClasses.find(
            (ic) => ic.Definition.name === integrationRecord.config.type
        );

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const modules: unknown[] = [];
        const failedModuleLoads: Array<{ entityId: string; error: string }> = [];

        for (const entityId of integrationRecord.entitiesIds) {
            try {
                const moduleInstance = await this.moduleFactory.getModuleInstance(
                    entityId,
                    integrationRecord.userId
                );
                modules.push(moduleInstance);
            } catch (error: unknown) {
                const err = error as Error;
                console.error(
                    `[Integration Deletion] Failed to load module for entity ${entityId}:`,
                    err.message
                );
                failedModuleLoads.push({ entityId, error: err.message });
            }
        }

        if (failedModuleLoads.length > 0) {
            console.warn(
                `[Integration Deletion] ${failedModuleLoads.length}/${integrationRecord.entitiesIds.length} module(s) failed to load. Webhooks for these modules may require manual cleanup.`
            );
        }

        const integrationInstance = new integrationClass!({
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
        await integrationInstance.send('ON_DELETE');

        await this.integrationRepository.deleteIntegrationById(integrationId);
    }
}
