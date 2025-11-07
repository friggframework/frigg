/**
 * MongoDB Collection Utilities
 * Works with both Prisma and native MongoDB driver
 */

const { prisma } = require('../prisma');
const { isDocumentDB } = require('./documentdb-compatibility');

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
        let collections;
        
        if (isDocumentDB()) {
            const { getNativeMongoClient } = require('../mongodb-native-client');
            const nativeClient = getNativeMongoClient();
            
            collections = await nativeClient.runCommand({
                listCollections: 1,
                filter: { name: collectionName }
            });
        } else {
            collections = await prisma.$runCommandRaw({
                listCollections: 1,
                filter: { name: collectionName }
            });
        }

        if (collections.cursor.firstBatch.length === 0) {
            if (isDocumentDB()) {
                const { getNativeMongoClient } = require('../mongodb-native-client');
                const nativeClient = getNativeMongoClient();
                await nativeClient.runCommand({ create: collectionName });
            } else {
                await prisma.$runCommandRaw({ create: collectionName });
            }
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
