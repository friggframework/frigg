const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../../database/encryption/field-encryption-service');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');
const { WebsocketConnectionRepositoryInterface } = require('./websocket-connection-repository-interface');

class WebsocketConnectionRepositoryDocumentDB extends WebsocketConnectionRepositoryInterface {
    constructor() {
        super();
        
        const nativeClient = getNativeMongoClient();
        const collection = nativeClient.collection('WebsocketConnection');
        
        const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
        const encryptionService = new FieldEncryptionService({
            cryptor,
            schema: { getEncryptedFields },
        });
        
        this.collection = new EncryptedCollection(collection, encryptionService, 'WebsocketConnection');
    }

    async createConnection(connectionData) {
        const doc = {
            ...connectionData,
            active: true,
            createdAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async findActiveConnectionsByUserId(userId) {
        return await this.collection.find({ userId, active: true });
    }

    async findConnectionById(connectionId) {
        return await this.collection.findOne({ _id: new ObjectId(connectionId) });
    }

    async findConnectionByConnectionId(connectionId) {
        return await this.collection.findOne({ connectionId });
    }

    async deactivateConnection(connectionId) {
        await this.collection.updateOne(
            { connectionId },
            { $set: { active: false } }
        );

        return await this.findConnectionByConnectionId(connectionId);
    }

    async deleteConnection(connectionId) {
        const result = await this.collection.deleteOne({ connectionId });
        return result.deletedCount > 0;
    }
}

module.exports = { WebsocketConnectionRepositoryDocumentDB };

