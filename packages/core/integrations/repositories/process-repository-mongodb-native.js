const { ObjectId } = require('mongodb');
const { BaseRepositoryMongoDBNative } = require('../../database/repositories/base-repository-documentdb');
const { ProcessRepositoryInterface } = require('./process-repository-interface');

class ProcessRepositoryMongoDBNative extends ProcessRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryMongoDBNative('Process', 'Process');
    }

    get collection() {
        return this._base.collection;
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

module.exports = { ProcessRepositoryMongoDBNative };

