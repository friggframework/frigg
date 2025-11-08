const { ObjectId } = require('mongodb');
const { getNativeMongoClient } = require('../mongodb-native-client');
const { BaseRepositoryDocumentDB } = require('./base-repository-documentdb');
const { HealthCheckRepositoryInterface } = require('./health-check-repository-interface');

class HealthCheckRepositoryMongoDBNative extends HealthCheckRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryDocumentDB('Credential', 'Credential');
        this.nativeClient = getNativeMongoClient();
    }

    get collection() {
        return this._base.collection;
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

module.exports = { HealthCheckRepositoryMongoDBNative };

