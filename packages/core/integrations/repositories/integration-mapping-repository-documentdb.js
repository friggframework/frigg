const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { IntegrationMappingRepositoryInterface } = require('./integration-mapping-repository-interface');

class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('IntegrationMapping');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'IntegrationMapping');
    }

    async findMappingById(mappingId) {
        return await this.collection.findOne({ _id: new ObjectId(mappingId) });
    }

    async findMappingsByIntegrationId(integrationId) {
        return await this.collection.find({ integrationId });
    }

    async createMapping(mappingData) {
        const doc = {
            ...mappingData,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async updateMapping(mappingId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(mappingId) },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findMappingById(mappingId);
    }

    async deleteMapping(mappingId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(mappingId) });
        return result.deletedCount > 0;
    }
}

module.exports = { IntegrationMappingRepositoryDocumentDB };

