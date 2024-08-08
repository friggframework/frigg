const { Entity } = require('./entity');
const { Auther } = require('./auther');

class ModuleFactory {
    constructor(...params) {
        this.moduleDefinitions = params;
        this.moduleTypes = this.moduleDefinitions.map((def) => def.moduleName);
    }

    async getEntitiesForUser(userId) {
        let results = [];
        for (const moduleDefinition of this.moduleDefinitions) {
            const moduleInstance = await Auther.getInstance({
                userId,
                definition: moduleDefinition,
            });
            const list = await moduleInstance.getEntitiesForUserId(userId);
            results.push(...list);
        }
        return results;
    }

    checkIsValidType(entityType) {
        return this.moduleTypes.includes(entityType);
    }

    getModuleDefinitionFromTypeName(typeName) {
        return;
    }

    async getModuleInstanceFromEntityId(entityId, userId) {
        const entity = await Entity.findById(entityId);
        const moduleDefinition = this.moduleDefinitions.find(
            (def) =>
                entity.toJSON()['__t'] ===
                Auther.getEntityModelFromDefinition(def).modelName
        );
        if (!moduleDefinition) {
            throw new Error(
                'Module definition not found for entity type: ' + entity['__t']
            );
        }
        return await Auther.getInstance({
            userId,
            entityId,
            definition: moduleDefinition,
        });
    }

    async getInstanceFromTypeName(typeName, userId) {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName() === typeName
        );
        return await Auther.getInstance({
            userId,
            definition: moduleDefinition,
        });
    }
}

module.exports = { ModuleFactory };
