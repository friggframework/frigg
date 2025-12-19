const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

class CreateIntegration {
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    async execute(entities, userId, config) {
        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name === config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${config.type}`
            );
        }

        const allEntities = [...entities];

        if (integrationClass.Definition?.entities) {
            for (const [entityKey, entityConfig] of Object.entries(
                integrationClass.Definition.entities
            )) {
                if (entityConfig.global === true) {
                    const globalEntity =
                        await this.moduleFactory.moduleRepository.findEntity({
                            moduleName: entityConfig.type,
                            isGlobal: true,
                        });

                    if (globalEntity && globalEntity.credential?.authIsValid) {
                        allEntities.push(globalEntity.id.toString());
                    } else if (entityConfig.required !== false) {
                        const reason = !globalEntity
                            ? 'not found'
                            : 'exists but credential is invalid';
                        throw new Error(
                            `Required global entity "${entityConfig.type}" ${reason}. Admin must configure this entity first.`
                        );
                    }
                }
            }
        }

        const integrationRecord =
            await this.integrationRepository.createIntegration(
                allEntities,
                userId,
                config
            );

        const modules = [];
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
        await integrationInstance.send('ON_CREATE', {
            integrationId: integrationRecord.id,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { CreateIntegration };
