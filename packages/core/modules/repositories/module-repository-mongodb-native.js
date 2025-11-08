const { ObjectId } = require('mongodb');
const { BaseRepositoryMongoDBNative } = require('../../database/repositories/base-repository-documentdb');
const { ModuleRepositoryInterface } = require('./module-repository-interface');

class ModuleRepositoryMongoDBNative extends ModuleRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryMongoDBNative('Entity', 'Entity');
    }

    get collection() {
        return this._base.collection;
    }

    async findEntityById(entityId) {
        return await this.collection.findOne({ _id: new ObjectId(entityId) });
    }

    async findEntitiesByUserId(userId) {
        return await this.collection.find({ userId });
    }

    async findEntitiesByIds(entitiesIds) {
        const objectIds = entitiesIds.map(id => new ObjectId(id));
        return await this.collection.find({ _id: { $in: objectIds } });
    }

    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        return await this.collection.find({ userId, moduleName });
    }

    async findEntity(filter) {
        return await this.collection.findOne(filter);
    }

    async createEntity(entityData) {
        const doc = {
            ...entityData,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async updateEntity(entityId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(entityId) },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findEntityById(entityId);
    }

    async unsetCredential(entityId) {
        await this.collection.updateOne(
            { _id: new ObjectId(entityId) },
            { $unset: { credential: '' }, $set: { updatedAt: new Date() } }
        );

        return await this.findEntityById(entityId);
    }

    async deleteEntity(entityId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(entityId) });
        return result.deletedCount > 0;
    }
}

module.exports = { ModuleRepositoryMongoDBNative };

