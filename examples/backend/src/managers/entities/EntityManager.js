const Entity = require('../../base/models/Entity');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const primaryEntity = require('./QBOManager');
const mondayEntity = require('./MondayManager');
const rollWorksEntity = require('./RollWorksManager');
const hubSpotEntity = require('./HubSpotManager');
const revioEntity = require('./RevioManager');
const stackEntity = require('./StackManager');
const crossbeamEntity = require('./CrossbeamManager');
const salesloftEntity = require('./SalesloftManager');
const fastSpringIQEntity = require('./FastSpringIQManager');
const salesforceEntity = require('./SalesforceManager');
const connectWiseEntity = require('./ConnectWiseManager');
const activeCampaignEntity = require('./ActiveCampaignManager');
const marketoEntity = require('./MarketoManager');
const outreachEntity = require('./OutreachManager');
const attentiveEntity = require('./AttentiveManager');

class EntityManager {
    static primaryEntityClass = primaryEntity;

    static entityManagerClasses = [
        primaryEntity,
        stackEntity,
        hubSpotEntity,
        revioEntity,
        crossbeamEntity,
        salesloftEntity,
        mondayEntity,
        rollWorksEntity,
        fastSpringIQEntity,
        salesforceEntity,
        connectWiseEntity,
        marketoEntity,
        activeCampaignEntity,
        outreachEntity,
        attentiveEntity,
    ];

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

    constructor() {
        // ...
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

        if (!(managerClass.prototype instanceof LHModuleManager)) {
            throw new Error('The Entity is not an instance of LHModuleManager');
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

module.exports = EntityManager;
