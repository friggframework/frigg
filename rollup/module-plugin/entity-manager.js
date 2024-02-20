const { loadInstalledModules, Delegate } = require('@friggframework/core');

const { Entity } = require('./entity');
const { ModuleManager } = require('./manager');

class EntityManager {
    static primaryEntityClass = null; //primaryEntity;

    static entityManagerClasses = loadInstalledModules().map(
        (m) => m.EntityManager
    );

    static entityTypes = EntityManager.entityManagerClasses.map(
        (ManagerClass) => ManagerClass.getName()
    );

    static async getEntitiesForUser(userId) {
        const results = [];
        for (const Manager of this.entityManagerClasses) {
            results.push(...(await Manager.getEntitiesForUserId(userId)));
        }
        return results;
    }

    static checkIsValidType(entityType) {
        const indexOfEntity = EntityManager.entityTypes.indexOf(entityType);
        return indexOfEntity >= 0;
    }

    static getEntityManagerClass(entityType = '') {
        const normalizedType = entityType.toLowerCase();

        const indexOfEntityType =
            EntityManager.entityTypes.indexOf(normalizedType);
        if (!EntityManager.checkIsValidType(normalizedType)) {
            throw new Error(
                `Error: Invalid entity type of ${normalizedType}, options are ${EntityManager.entityTypes.join(
                    ', '
                )}`
            );
        }

        const managerClass =
            EntityManager.entityManagerClasses[indexOfEntityType];

        if (!(managerClass.prototype instanceof ModuleManager)) {
            throw new Error('The Entity is not an instance of ModuleManager');
        }

        return managerClass;
    }

    static async getEntityManagerInstanceFromEntityId(entityId, userId) {
        const entityMO = new Entity();
        const entity = await entityMO.get(entityId);
        let entityManagerClass;
        for (const Manager of this.entityManagerClasses) {
            if (entity instanceof Manager.Entity.Model) {
                entityManagerClass = Manager;
            }
        }
        const instance = await entityManagerClass.getInstance({
            userId,
            entityId,
        });
        return instance;
    }
}

module.exports = { EntityManager };
