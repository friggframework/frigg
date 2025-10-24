/**
 * MongoDB Collection Utilities
 *
 * Provides utilities for managing MongoDB collections, particularly for
 * handling the constraint that collections cannot be created inside
 * multi-document transactions.
 *
 * @see https://github.com/prisma/prisma/issues/8305
 * @see https://www.mongodb.com/docs/manual/core/transactions/#transactions-and-operations
 */

const { mongoose } = require('../mongoose');

/**
 * Ensures a MongoDB collection exists
 *
 * MongoDB doesn't allow creating collections (namespaces) inside multi-document
 * transactions. This function checks if a collection exists and creates it if needed,
 * preventing "Cannot create namespace in multi-document transaction" errors.
 *
 * @param {string} collectionName - Name of the collection to ensure exists
 * @returns {Promise<void>}
 *
 * @example
 * ```js
 * await ensureCollectionExists('Credential');
 * // Now safe to create documents in Credential collection
 * await prisma.credential.create({ data: {...} });
 * ```
 */
async function ensureCollectionExists(collectionName) {
    try {
        const collections = await mongoose.connection.db
            .listCollections({ name: collectionName })
            .toArray();

        if (collections.length === 0) {
            // Collection doesn't exist, create it outside of any transaction
            await mongoose.connection.db.createCollection(collectionName);
            console.log(`Created MongoDB collection: ${collectionName}`);
        }
    } catch (error) {
        // Collection might already exist due to race condition, or other error
        // Log warning but don't fail - let subsequent operations handle errors
        if (error.codeName === 'NamespaceExists') {
            // This is expected in race conditions, silently continue
            return;
        }
        console.warn(`Error ensuring collection ${collectionName} exists:`, error.message);
    }
}

/**
 * Ensures multiple MongoDB collections exist
 *
 * @param {string[]} collectionNames - Array of collection names to ensure exist
 * @returns {Promise<void>}
 *
 * @example
 * ```js
 * await ensureCollectionsExist(['Credential', 'User', 'Token']);
 * ```
 */
async function ensureCollectionsExist(collectionNames) {
    await Promise.all(collectionNames.map(name => ensureCollectionExists(name)));
}

/**
 * Checks if a collection exists in MongoDB
 *
 * @param {string} collectionName - Name of the collection to check
 * @returns {Promise<boolean>} True if collection exists, false otherwise
 */
async function collectionExists(collectionName) {
    try {
        const collections = await mongoose.connection.db
            .listCollections({ name: collectionName })
            .toArray();

        return collections.length > 0;
    } catch (error) {
        console.error(`Error checking if collection ${collectionName} exists:`, error.message);
        return false;
    }
}

module.exports = {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
};
