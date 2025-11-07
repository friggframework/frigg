const { ObjectId } = require('mongodb');
const { BaseRepositoryDocumentDB } = require('../../database/repositories/base-repository-documentdb');
const { WebsocketConnectionRepositoryInterface } = require('./websocket-connection-repository-interface');

class WebsocketConnectionRepositoryDocumentDB extends WebsocketConnectionRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryDocumentDB('WebsocketConnection', 'WebsocketConnection');
    }

    get collection() {
        return this._base.collection;
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

