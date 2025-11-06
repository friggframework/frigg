/**
 * MongoDB Schema Initialization for Prisma
 *
 * Dynamically parses the Prisma schema and ensures all collections exist before
 * the application starts handling requests. This prevents
 * "Cannot create namespace in multi-document transaction" errors.
 *
 * MongoDB does not allow creating collections inside transactions.
 * By pre-creating all collections at startup, we ensure all Prisma
 * operations can safely use transactions without namespace creation errors.
 *
 * Collection names are extracted dynamically from the Prisma schema file,
 * ensuring they stay in sync with schema changes without manual updates.
 *
 * @see https://github.com/prisma/prisma/issues/8305
 * @see https://www.mongodb.com/docs/manual/core/transactions/#transactions-and-operations
 */

const { ensureCollectionsExist } = require('./mongodb-collection-utils');
const { getCollectionsFromSchemaSync } = require('./prisma-schema-parser');
const config = require('../config');

/**
 * Initialize MongoDB schema by ensuring all collections exist
 *
 * This should be called once at application startup, after Prisma connection
 * is established but before handling any requests.
 *
 * Dynamically parses the Prisma schema to extract collection names,
 * ensuring automatic sync with schema changes.
 *
 * Uses Prisma's $runCommandRaw to create collections, which works with both
 * MongoDB and DocumentDB without requiring mongoose connection.
 *
 * Benefits:
 * - Prevents transaction namespace creation errors
 * - Fails fast if there are database connection issues
 * - Ensures consistent state across all instances
 * - Idempotent - safe to run multiple times
 * - Automatically syncs with Prisma schema changes
 * - No mongoose dependency required
 *
 * @returns {Promise<void>}
 *
 * @example
 * ```js
 * await connectPrisma();
 * await initializeMongoDBSchema(); // Run after Prisma connection
 * // Now safe to handle requests
 * ```
 */
async function initializeMongoDBSchema() {
    // Only run for MongoDB
    if (config.DB_TYPE !== 'mongodb') {
        console.log('Schema initialization skipped - not using MongoDB');
        return;
    }

    console.log('Initializing MongoDB schema - ensuring all collections exist...');
    const startTime = Date.now();

    try {
        // Dynamically parse Prisma schema to get collection names
        const collections = getCollectionsFromSchemaSync();

        if (collections.length === 0) {
            console.warn('No collections found in Prisma schema - skipping initialization');
            return;
        }

        await ensureCollectionsExist(collections);

        const duration = Date.now() - startTime;
        console.log(
            `MongoDB schema initialization complete - ${collections.length} collections verified (${duration}ms)`
        );
    } catch (error) {
        console.error('Failed to initialize MongoDB schema:', error.message);
        throw error;
    }
}

/**
 * Get list of Prisma collection names by parsing the schema
 * Useful for testing and introspection
 *
 * @returns {string[]} Array of collection names from Prisma schema
 */
function getPrismaCollections() {
    try {
        return getCollectionsFromSchemaSync();
    } catch (error) {
        console.warn('Could not parse Prisma collections:', error.message);
        return [];
    }
}

module.exports = {
    initializeMongoDBSchema,
    getPrismaCollections,
};
