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

    async findEntitiesByIds(entitiesIds) {
        const entitiesRecords = await Entity.find({ _id: { $in: entitiesIds } }, '', { lean: true }).populate('credential');

        // todo: this is a workaround needed while we create an integration with the same entity twice
        if (entitiesRecords.length !== entitiesIds.length && entitiesIds[0] !== entitiesIds[1]) {
            throw new Error(`Some entities not found`);
        }

        return entitiesRecords.map(e => ({
            id: e._id,
            accountId: e.accountId,
            credential: e.credential,
            userId: e.user.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.__t,
            moduleName: e.moduleName,
        }));
    }

    async findEntitiesByUserId(userId) {
        return Entity.find(
            { user: userId },
            '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
            { lean: true }
        );
    }

    async findEntitiesByIds(entityIds) {
        const entities = await Entity.find(
            { _id: { $in: entityIds } },
            '',
            { lean: true }
        );

        return entities.map(e => ({
            id: e._id.toString(),
            accountId: e.accountId,
            credentialId: e.credential.toString(),
            userId: e.user.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.__t,
            moduleName: e.moduleName,
        }));
    }
}

module.exports = { ModuleRepository }; 