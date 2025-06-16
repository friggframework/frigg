const { Module } = require('../module');

class GetModule {
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(entityId, userId) {
        const entity = await this.moduleRepository.findEntityById(
            entityId,
            userId
        );

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        if (entity.userId !== userId) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const entityType = entity.type;
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            const modelName = Module.getEntityModelFromDefinition(def).modelName;
            return entityType === modelName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        const module = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        // todo: this properties should be methods in the Module class
        return {
            id: module.entity.id,
            name: module.entity.name,
            type: module.entity.moduleName,
            moduleName: module.entity.moduleName,
            credential: module.credential,
            externalId: module.entity.externalId,
            userId: module.entity.user.toString(),
        }
    }
}

module.exports = { GetModule };