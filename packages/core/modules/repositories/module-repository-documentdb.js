const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { ModuleRepositoryInterface } = require('./module-repository-interface');

class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('Entity');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'Entity');
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

module.exports = { ModuleRepositoryDocumentDB };

