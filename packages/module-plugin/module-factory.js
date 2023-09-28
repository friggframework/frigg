const {Entity} = require("./entity");

class ModuleFactory {
    constructor(...params) {
        this.moduleClasses = params;
        this.moduleTypes = this.moduleClasses.map(
            (ModuleClass) => ModuleClass.getName()
        );
    }

    async getEntitiesForUser(userId) {
        const results = [];
        for (const ModuleClass of this.moduleClasses) {
            results.push(...(await ModuleClass.getEntitiesForUserId(userId)));
        }
        return results;
    }

    checkIsValidType(entityType) {
        const indexOfEntity = this.moduleTypes.indexOf(entityType);
        return indexOfEntity >= 0;
    }

    getModuleClass(entityType = '') {
        const normalizedType = entityType.toLowerCase();

        const indexOfEntityType =
            this.moduleTypes.indexOf(normalizedType);
        // if (!this.checkIsValidType(normalizedType)) {
        //     throw new Error(
        //         `Error: Invalid entity type of ${normalizedType}, options are ${this.moduleTypes.join(
        //             ', '
        //         )}`
        //     );
        // }

        const moduleClass =
            this.moduleClasses[indexOfEntityType];

        // if (!(moduleClass.prototype instanceof Module)) {
        //     throw new Error('The Entity is not an instance of ModuleManager');
        // }

        return moduleClass;
    }

    async getModuleInstanceFromEntityId(entityId, userId) {
        const entity = await Entity.findById(entityId);
        let moduleClass;
        for (const ModuleClass of this.moduleClasses) {
            if (entity instanceof ModuleClass.Entity) {
                moduleClass = ModuleClass;
            }
        }
        const instance = await moduleClass.getInstance({
            userId,
            entityId,
        });
        return instance;
    }
}

module.exports = { ModuleFactory };