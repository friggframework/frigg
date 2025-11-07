const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../mongodb-native-client');
const { EncryptedCollection } = require('../encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../encryption/field-encryption-service');
const { getEncryptedFields } = require('../encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { HealthCheckRepositoryInterface } = require('./health-check-repository-interface');

class HealthCheckRepositoryDocumentDB extends HealthCheckRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        this.nativeClient = nativeClient;
        
        const collection = nativeClient.collection('Credential');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'Credential');
    }

    async getDatabaseConnectionState() {
        let isConnected = false;
        let stateName = 'unknown';
        
        try {
            await this.nativeClient.runCommand({ ping: 1 });
            isConnected = true;
            stateName = 'connected';
        } catch (error) {
            stateName = 'disconnected';
        }

        return {
            readyState: isConnected ? 1 : 0,
            stateName,
            isConnected,
        };
    }

    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();
        await this.nativeClient.runCommand({ ping: 1 });
        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        const result = await this.collection.insertOne(credentialData);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async findCredentialById(id) {
        return await this.collection.findOne({ _id: new ObjectId(id) });
    }

    async getRawCredentialById(id) {
        const rawCollection = this.nativeClient.collection('Credential');
        return await rawCollection.findOne({ _id: new ObjectId(id) });
    }

    async deleteCredentialById(id) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
        return result.deletedCount > 0;
    }
}

module.exports = { HealthCheckRepositoryDocumentDB };

