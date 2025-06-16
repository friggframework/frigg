const { Entity } = require('./entity');

class ModuleRepository {
    async findEntityById(entityId) {
        const entity = await Entity.findById(entityId, undefined, { lean: true }).populate('credential');
        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        return {
            id: entity._id,
            accountId: entity.accountId,
            credential: entity.credential,
            userId: entity.user.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.__t,
            moduleName: entity.moduleName,
        };
    }

    async findEntitiesByUserId(userId) {
        const entitiesRecords = await Entity.find(
            { user: userId },
            '',
            { lean: true }
        ).populate('credential');

        return entitiesRecords.map(e => ({
            id: e._id.toString(),
            accountId: e.accountId,
            credential: e.credential,
            userId: e.user.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.__t,
            moduleName: e.moduleName,
        }));
    }

    async findEntitiesByIds(entitiesIds) {
        const entitiesRecords = await Entity.find(
            { _id: { $in: entitiesIds } },
            '',
            { lean: true }
        ).populate('credential');

        return entitiesRecords.map(e => ({
            id: e._id.toString(),
            accountId: e.accountId,
            credential: e.credential,
            userId: e.user.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.__t,
            moduleName: e.moduleName,
        }));
    }

    /**
     * Remove the credential reference from an Entity document without loading a full Mongoose instance.
     * Useful when a credential has been revoked/deleted (e.g. via Module.deauthorize).
     * @param {string} entityId
     * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
     */
    async unsetCredential(entityId) {
        const result = await Entity.updateOne({ _id: entityId }, { $unset: { credential: "" } });
        return result.acknowledged;
    }

    async findEntity(filter) {
        const entity = await Entity.findOne(filter, undefined, { lean: true }).populate('credential');
        if (!entity) {
            return null;
        }

        return {
            id: entity._id.toString(),
            accountId: entity.accountId,
            credential: entity.credential,
            userId: entity.user.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.__t,
            moduleName: entity.moduleName,
        };
    }

    async createEntity(entityData) {
        const entity = await Entity.create(entityData);
        await entity.populate('credential');

        return {
            id: entity._id.toString(),
            accountId: entity.accountId,
            credential: entity.credential,
            userId: entity.user.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.__t,
            moduleName: entity.moduleName,
        };
    }

}

module.exports = { ModuleRepository }; 