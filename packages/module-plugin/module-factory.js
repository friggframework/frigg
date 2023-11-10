const { Entity } = require("./entity");
const { Auther } = require('./auther');

class ModuleFactory {
    constructor(...params) {
        this.moduleDefinitions = params;
        this.moduleTypes = this.moduleDefinitions.map(
            (def) => def.moduleName
        );
    }

    async getEntitiesForUser(userId) {
        let results = [];
        for (const moduleDefinition of this.moduleDefinitions) {
            const moduleInstance = await Auther.getInstance({
                userId,
                definition: moduleDefinition
            });
            const list = await moduleInstance.getEntitiesForUserId(userId);
            console.log('getEntitiesForUser list', list, userId, moduleInstance);
            results.push(...list);
        }
        return results;
    }

    checkIsValidType(entityType) {
        return this.moduleTypes.includes(entityType);
    }

    getModuleDefinitionFromTypeName(typeName) {
        return
    }


    async getModuleInstanceFromEntityId(entityId, userId) {
        const entity = await Entity.findById(entityId);
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => {
                console.log('entity', entity instanceof Auther.getEntityModelFromDefinition(def),
                    entity['__t'] === Auther.getEntityModelFromDefinition(def).modelName,
                    Auther.getEntityModelFromDefinition(def).modelName,
                    entity, Auther.getEntityModelFromDefinition(def));
                return entity['__t'] === Auther.getEntityModelFromDefinition(def).modelName
            }
        )
        console.log('moduleDefinition', moduleDefinition);
        return await Auther.getInstance({
            userId,
            entityId,
            definition: moduleDefinition
        });
    }

     async getInstanceFromTypeName(typeName, userId) {
        const moduleDefinition =this.moduleDefinitions.find(
            (def) => def.getName() === typeName
        );
         return await Auther.getInstance({
             userId,
             definition: moduleDefinition
         });
    }
}

module.exports = { ModuleFactory };
