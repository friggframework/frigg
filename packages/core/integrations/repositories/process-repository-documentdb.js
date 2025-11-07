const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { ProcessRepositoryInterface } = require('./process-repository-interface');

class ProcessRepositoryDocumentDB extends ProcessRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('Process');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'Process');
    }

    async createProcess(processData) {
        const doc = {
            ...processData,
            status: processData.status || 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async findProcessById(processId) {
        return await this.collection.findOne({ _id: new ObjectId(processId) });
    }

    async findProcessesByUserId(userId) {
        return await this.collection.find({ userId });
    }

    async updateProcess(processId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(processId) },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findProcessById(processId);
    }

    async deleteProcess(processId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(processId) });
        return result.deletedCount > 0;
    }
}

module.exports = { ProcessRepositoryDocumentDB };

