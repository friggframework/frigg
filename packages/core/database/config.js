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
    try {
        const path = require('node:path');
        const fs = require('node:fs');
        const { findNearestBackendPackageJson } = require('../utils');

        let backendIndexPath;
        let database;
        const backendPackagePath = findNearestBackendPackageJson();

        if (!backendPackagePath) {
            throw new Error(
                '[Frigg] Cannot find backend package.json. ' +
                'Ensure backend/package.json exists in your project.'
            );
        }

        const backendDir = path.dirname(backendPackagePath);
        backendIndexPath = path.join(backendDir, 'index.js');

        if (!fs.existsSync(backendIndexPath)) {
            throw new Error(
                `[Frigg] Backend index.js not found at ${backendIndexPath}. ` +
                'Ensure backend/index.js exists with a Definition export.'
            );
        }

        let backendModule;
        try {
            backendModule = require(backendIndexPath);
        } catch (requireError) {
            // Extract the actual file with the error from the stack trace
            // Skip internal Node.js files (node:internal/*) and find first user file
            let errorFile = 'unknown file';
            const stackLines = requireError.stack?.split('\n') || [];

            for (const line of stackLines) {
                // Match file paths in stack trace, excluding node:internal
                const match = line.match(/\(([^)]+\.js):\d+:\d+\)/) || line.match(/at ([^(]+\.js):\d+:\d+/);
                if (match && match[1] && !match[1].includes('node:internal')) {
                    errorFile = match[1];
                    break;
                }
            }

            // Provide better error context for syntax/runtime errors
            throw new Error(
                `[Frigg] Failed to load app definition from ${backendIndexPath}\n` +
                `Error: ${requireError.message}\n` +
                `File with error: ${errorFile}\n` +
                `\nFull stack trace:\n${requireError.stack}\n\n` +
                'This error occurred while loading your app definition or its dependencies. ' +
                'Check the file listed above for syntax errors (trailing commas, missing brackets, etc.)'
            );
        }

        database = backendModule?.Definition?.database;

        if (!database) {
            throw new Error(
                '[Frigg] App definition missing database configuration. ' +
                `Add database: { postgres: { enable: true } } (or mongoDB/documentDB) to ${backendIndexPath}`
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
    configurable: true
});