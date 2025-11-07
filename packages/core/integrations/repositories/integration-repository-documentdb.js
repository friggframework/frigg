const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { IntegrationRepositoryInterface } = require('./integration-repository-interface');

class IntegrationRepositoryDocumentDB extends IntegrationRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('Integration');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'Integration');
    }

    async findIntegrationById(id) {
        return await this.collection.findOne({ _id: new ObjectId(id) });
    }

    async findIntegrationByUserId(userId) {
        const integrations = await this.collection.find({ userId });
        return integrations[0] || null;
    }

    async findIntegrationsByUserId(userId) {
        return await this.collection.find({ userId });
    }

    async findIntegrationByName(name) {
        return await this.collection.findOne({ name });
    }

    async createIntegration(entities, userId, config) {
        const entityIds = Array.isArray(entities) 
            ? entities.map(e => e.id || e._id?.toString() || e)
            : [entities.id || entities._id?.toString() || entities];

        const doc = {
            userId,
            entityIds,
            config: config || {},
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async updateIntegrationStatus(integrationId, status) {
        await this.collection.updateOne(
            { _id: new ObjectId(integrationId) },
            { $set: { status, updatedAt: new Date() } }
        );

        return await this.findIntegrationById(integrationId);
    }

    async updateIntegrationMessages(integrationId, incomingMessages, outgoingMessages) {
        const update = { updatedAt: new Date() };
        
        if (incomingMessages !== undefined) {
            update.incomingMessages = incomingMessages;
        }
        if (outgoingMessages !== undefined) {
            update.outgoingMessages = outgoingMessages;
        }

        await this.collection.updateOne(
            { _id: new ObjectId(integrationId) },
            { $set: update }
        );

        return await this.findIntegrationById(integrationId);
    }

    async updateIntegrationConfig(integrationId, config) {
        await this.collection.updateOne(
            { _id: new ObjectId(integrationId) },
            { $set: { config, updatedAt: new Date() } }
        );

        return await this.findIntegrationById(integrationId);
    }

    async deleteIntegrationById(integrationId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(integrationId) });
        return result.deletedCount > 0;
    }
}

module.exports = { IntegrationRepositoryDocumentDB };

