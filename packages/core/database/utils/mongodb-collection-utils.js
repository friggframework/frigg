/**
 * MongoDB Collection Utilities
 *
 * Provides utilities for managing MongoDB collections, particularly for
 * handling the constraint that collections cannot be created inside
 * multi-document transactions.
 *
 * Uses Prisma's $runCommandRaw to execute MongoDB admin commands.
 *
 * @see https://github.com/prisma/prisma/issues/8305
 * @see https://www.mongodb.com/docs/manual/core/transactions/#transactions-and-operations
 */

const { prisma } = require('../prisma');

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
        const result = await prisma.$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName },
        });

        const collections = result.cursor?.firstBatch || [];

        if (collections.length === 0) {
            await prisma.$runCommandRaw({ create: collectionName });
            console.log(`Created MongoDB collection: ${collectionName}`);
        }
    } catch (error) {
        if (error.codeName === 'NamespaceExists') {
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
        const result = await prisma.$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName },
        });

        const collections = result.cursor?.firstBatch || [];
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
