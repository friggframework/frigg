const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { SyncRepositoryInterface } = require('./sync-repository-interface');

class SyncRepositoryDocumentDB extends SyncRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('Sync');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'Sync');
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

module.exports = { SyncRepositoryDocumentDB };

