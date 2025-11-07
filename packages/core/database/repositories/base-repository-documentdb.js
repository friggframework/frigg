/**
 * Base DocumentDB Repository
 * Provides lazy-loaded encrypted collections for DocumentDB adapters
 * 
 * Lazy loading pattern ensures:
 * - Repositories can be instantiated at module load time
 * - Collections are only accessed after native client connects
 * - Compatible with eager loading pattern in routers
 */

const { getNativeMongoClient } = require('../mongodb-native-client');
const { EncryptedCollection } = require('../encrypted-collection-wrapper');
const { FieldEncryptionService } = require('../encryption/field-encryption-service');
const { getEncryptedFields } = require('../encryption/encryption-schema-registry');
const { Cryptor } = require('../../encrypt/Cryptor');

class BaseRepositoryDocumentDB {
    constructor(collectionName, modelName) {
        this.collectionName = collectionName;
        this.modelName = modelName;
        this.nativeClient = getNativeMongoClient();
        this._collection = null;
    }

    _getCollection() {
        if (!this._collection) {
            const collection = this.nativeClient.collection(this.collectionName);
            
            const cryptor = new Cryptor({ shouldUseAws: !!process.env.KMS_KEY_ARN });
            const encryptionService = new FieldEncryptionService({
                cryptor,
                schema: { getEncryptedFields },
            });
            
            this._collection = new EncryptedCollection(
                collection,
                encryptionService,
                this.modelName
            );
        }
        return this._collection;
    }

    get collection() {
        return this._getCollection();
    }
}

module.exports = { BaseRepositoryDocumentDB };

