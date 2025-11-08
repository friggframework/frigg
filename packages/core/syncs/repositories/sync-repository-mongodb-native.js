const { ObjectId } = require('mongodb');
const { BaseRepositoryMongoDBNative } = require('../../database/repositories/base-repository-documentdb');
const { SyncRepositoryInterface } = require('./sync-repository-interface');

class SyncRepositoryMongoDBNative extends SyncRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryMongoDBNative('Sync', 'Sync');
    }

    get collection() {
        return this._base.collection;
    }

    async getSyncObject(name, dataIdentifier, entity) {
        const entityId = entity?.id || entity?._id?.toString() || entity;
        
        return await this.collection.findOne({
            name,
            dataIdentifier,
            entityId,
        });
    }

    async createSync(syncData) {
        const doc = {
            ...syncData,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async updateSync(syncId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(syncId) },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.collection.findOne({ _id: new ObjectId(syncId) });
    }

    async deleteSync(syncId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(syncId) });
        return result.deletedCount > 0;
    }
}

module.exports = { SyncRepositoryMongoDBNative };

