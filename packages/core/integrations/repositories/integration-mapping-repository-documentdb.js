const { ObjectId } = require('mongodb');
const { BaseRepositoryDocumentDB } = require('../../database/repositories/base-repository-documentdb');
const { IntegrationMappingRepositoryInterface } = require('./integration-mapping-repository-interface');

class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryDocumentDB('IntegrationMapping', 'IntegrationMapping');
    }

    get collection() {
        return this._base.collection;
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

