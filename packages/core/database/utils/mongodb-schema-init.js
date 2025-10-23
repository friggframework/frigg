/**
 * MongoDB Schema Initialization for Prisma
 *
 * Ensures all collections defined in the Prisma schema exist before
 * the application starts handling requests. This prevents
 * "Cannot create namespace in multi-document transaction" errors.
 *
 * MongoDB does not allow creating collections inside transactions.
 * By pre-creating all collections at startup, we ensure all Prisma
 * operations can safely use transactions without namespace creation errors.
 *
 * @see https://github.com/prisma/prisma/issues/8305
 * @see https://www.mongodb.com/docs/manual/core/transactions/#transactions-and-operations
 */

const { mongoose } = require('../mongoose');
const { ensureCollectionsExist } = require('./mongodb-collection-utils');
const config = require('../config');

/**
 * All collection names from Prisma schema (packages/core/prisma-mongodb/schema.prisma)
 * These correspond to the @@map() directives in the Prisma models
 */
const PRISMA_COLLECTIONS = [
    'User',                   // User model
    'Token',                  // Token model
    'Credential',             // Credential model
    'Entity',                 // Entity model
    'Integration',            // Integration model
    'IntegrationMapping',     // IntegrationMapping model
    'Process',                // Process model
    'Sync',                   // Sync model
    'DataIdentifier',         // DataIdentifier model
    'Association',            // Association model
    'AssociationObject',      // AssociationObject model
    'State',                  // State model
    'WebsocketConnection',    // WebsocketConnection model
];

/**
 * Initialize MongoDB schema by ensuring all collections exist
 *
 * This should be called once at application startup, after the database
 * connection is established but before handling any requests.
 *
 * Benefits:
 * - Prevents transaction namespace creation errors
 * - Fails fast if there are database connection issues
 * - Ensures consistent state across all instances
 * - Idempotent - safe to run multiple times
 *
 * @returns {Promise<void>}
 *
 * @example
 * ```js
 * await connectPrisma();
 * await initializeMongoDBSchema(); // Run after connection
 * // Now safe to handle requests
 * ```
 */
async function initializeMongoDBSchema() {
    // Only run for MongoDB
    if (config.DB_TYPE !== 'mongodb') {
        console.log('Schema initialization skipped - not using MongoDB');
        return;
    }

    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
        throw new Error(
            'Cannot initialize MongoDB schema - database not connected. ' +
            'Call connectPrisma() before initializeMongoDBSchema()'
        );
    }

    console.log('Initializing MongoDB schema - ensuring all collections exist...');
    const startTime = Date.now();

    try {
        await ensureCollectionsExist(PRISMA_COLLECTIONS);

        const duration = Date.now() - startTime;
        console.log(
            `MongoDB schema initialization complete - ${PRISMA_COLLECTIONS.length} collections verified (${duration}ms)`
        );
    } catch (error) {
        console.error('Failed to initialize MongoDB schema:', error.message);
        throw error;
    }
}

/**
 * Get list of Prisma collection names
 * Useful for testing and introspection
 *
 * @returns {string[]} Array of collection names
 */
function getPrismaCollections() {
    return [...PRISMA_COLLECTIONS];
}

module.exports = {
    initializeMongoDBSchema,
    getPrismaCollections,
    PRISMA_COLLECTIONS,
};
