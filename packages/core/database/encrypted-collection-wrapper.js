/**
 * Encrypted Collection Wrapper
 * Wraps MongoDB native driver collections with automatic field-level encryption/decryption
 */

class EncryptedCollection {
    constructor(collection, encryptionService, modelName) {
        this.collection = collection;
        this.encryptionService = encryptionService;
        this.modelName = modelName;
    }

    async findOne(filter, options) {
        const doc = await this.collection.findOne(filter, options);
        
        if (doc) {
            return await this.encryptionService.decryptFields(this.modelName, doc);
        }
        
        return doc;
    }

    async find(filter, options) {
        const cursor = this.collection.find(filter, options);
        const docs = await cursor.toArray();
        
        if (docs.length === 0) {
            return docs;
        }

        return await Promise.all(
            docs.map(doc => this.encryptionService.decryptFields(this.modelName, doc))
        );
    }

    async insertOne(doc, options) {
        const encrypted = await this.encryptionService.encryptFields(this.modelName, doc);
        return await this.collection.insertOne(encrypted, options);
    }

    async insertMany(docs, options) {
        const encrypted = await this.encryptionService.encryptFieldsInBulk(this.modelName, docs);
        return await this.collection.insertMany(encrypted, options);
    }

    async updateOne(filter, update, options) {
        if (update.$set) {
            update.$set = await this.encryptionService.encryptFields(this.modelName, update.$set);
        }
        
        return await this.collection.updateOne(filter, update, options);
    }

    async updateMany(filter, update, options) {
        if (update.$set) {
            update.$set = await this.encryptionService.encryptFields(this.modelName, update.$set);
        }
        
        return await this.collection.updateMany(filter, update, options);
    }

    async deleteOne(filter, options) {
        return await this.collection.deleteOne(filter, options);
    }

    async deleteMany(filter, options) {
        return await this.collection.deleteMany(filter, options);
    }

    async countDocuments(filter, options) {
        return await this.collection.countDocuments(filter, options);
    }
}

module.exports = { EncryptedCollection };

