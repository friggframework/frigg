/**
 * Database Configuration
 * Manages configuration for Prisma ORM operations
 */

/**
 * Determines database type from environment or app definition
 *
 * Detection order:
 * 1. DB_TYPE environment variable (set for migration handlers)
 * 2. App definition (backend/index.js Definition.database configuration)
 *
 * @returns {'mongodb'|'postgresql'|'documentdb'} Database type
 * @throws {Error} If database type cannot be determined or app definition missing
 */
function getDatabaseType() {
    // First, check DB_TYPE environment variable (migration handlers set this)
    if (process.env.DB_TYPE) {
        return process.env.DB_TYPE;
    }

    // Fallback: Load app definition
    // Uses loadAppDefinition() which respects setAppDefinition() cache.
    // This is critical for platforms like Netlify where process.cwd()-based
    // discovery fails at runtime (process.cwd() is /var/task, not the project root).
    try {
        const {
            loadAppDefinition,
        } = require('../handlers/app-definition-loader');

        const { appDefinition } = loadAppDefinition();
        const database = appDefinition?.database;

        if (!database) {
            throw new Error(
                '[Frigg] App definition missing database configuration. ' +
                    'Add database: { postgres: { enable: true } } (or mongoDB/documentDB) to your backend/index.js'
            );
        }

        // Determine database type from enabled database
        // Priority order: postgres > mongoDB > documentDB
        if (database.postgres?.enable === true) {
            return 'postgresql';
        }
        if (database.mongoDB?.enable === true) {
            return 'mongodb';
        }
        if (database.documentDB?.enable === true) {
            return 'documentdb';
        }

        throw new Error(
            '[Frigg] No database enabled in app definition. ' +
                'Set one of: database.postgres.enable, database.mongoDB.enable, or database.documentDB.enable to true'
        );
    } catch (error) {
        // Re-throw with context if it's our error
        if (error.message.includes('[Frigg]')) {
            throw error;
        }
        // Wrap unexpected errors
        throw new Error(
            `[Frigg] Failed to determine database type: ${error.message}`
        );
    }
}

/**
 * Cached database type (lazy evaluation)
 * @type {'mongodb'|'postgresql'|'documentdb'|null}
 */
let cachedDbType = null;

/**
 * Enable Prisma debug logging
 * Set PRISMA_LOG_LEVEL to comma-separated list: query,info,warn,error
 * @type {string}
 */
const PRISMA_LOG_LEVEL = process.env.PRISMA_LOG_LEVEL || 'error,warn';

/**
 * Enable Prisma query logging for performance monitoring
 * @type {boolean}
 */
const PRISMA_QUERY_LOGGING = process.env.PRISMA_QUERY_LOGGING === 'true';

module.exports = {
    getDatabaseType, // Export for testing and direct use
    PRISMA_LOG_LEVEL,
    PRISMA_QUERY_LOGGING,
};

/**
 * Lazy-evaluated database type determined from app definition
 * Only evaluates when accessed, preventing module load failures in test environments
 * @type {'mongodb'|'postgresql'|'documentdb'}
 */
Object.defineProperty(module.exports, 'DB_TYPE', {
    get() {
        if (cachedDbType === null) {
            cachedDbType = getDatabaseType();
        }
        return cachedDbType;
    },
    enumerable: true,
    configurable: true,
});
