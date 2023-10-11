const { Entity } = require("./entity");
const { Auther } = require('./auther');

class ModuleFactory {
    constructor(...params) {
        this.moduleDefinitions = params;
        this.moduleTypes = this.moduleDefinitions.map(
            (def) => def.name
        );
    }

    async getEntitiesForUser(userId) {
        let results = [];
        for (const moduleDefinition of this.moduleDefinitions) {
            const list = await moduleDefinition.Entity.find(
                { user: userId },
                '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
                { lean: true }
            );
            for (const entity of list) {
                results.push({
                    id: entity._id,
                    type: moduleDefinition.getName(),
                    ...entity,
                })
            }
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
            (def) => entity instanceof def.Entity
        )
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