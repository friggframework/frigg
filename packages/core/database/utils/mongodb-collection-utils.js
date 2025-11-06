/**
 * MongoDB Collection Utilities
 *
 * Provides utilities for managing MongoDB collections, particularly for
 * handling the constraint that collections cannot be created inside
 * multi-document transactions.
 *
 * Uses Prisma's $runCommandRaw to send native MongoDB commands directly,
 * avoiding the need for mongoose connection.
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
 * Uses Prisma's $runCommandRaw to send native MongoDB commands, which works with
 * both MongoDB and DocumentDB.
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
        // Check if collection exists using Prisma's $runCommandRaw
        const collections = await prisma.$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName }
        });

        if (collections.cursor.firstBatch.length === 0) {
            // Collection doesn't exist, create it
            await prisma.$runCommandRaw({
                create: collectionName
            });
            console.log(`✓ Created collection: ${collectionName}`);
        }
    } catch (error) {
        // Ignore "already exists" errors (code 48: NamespaceExists)
        if (error.code !== 48 && error.codeName !== 'NamespaceExists') {
            console.warn(`Warning: Could not ensure collection ${collectionName}:`, error.message);
        }
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
        const collections = await prisma.$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName }
        });

        return collections.cursor.firstBatch.length > 0;
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
