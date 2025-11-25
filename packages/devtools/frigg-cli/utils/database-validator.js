const path = require('path');
const fs = require('fs');
const { getDatabaseType: getDatabaseTypeFromCore } = require('@friggframework/core/database/config');
const { connectPrisma, disconnectPrisma } = require('@friggframework/core/database/prisma');

/**
 * Database Validation Utility
 * Validates database configuration and connectivity for Frigg applications
 */

/**
 * Normalizes MongoDB-compatible database types to 'mongodb'
 * DocumentDB uses the same Prisma client as MongoDB
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @returns {'mongodb'|'postgresql'} Normalized database type
 */
function normalizeMongoCompatible(dbType) {
    return dbType === 'documentdb' ? 'mongodb' : dbType;
}

/**
 * Validates that DATABASE_URL environment variable exists and has a value
 * @returns {Object} { valid: boolean, url?: string, error?: string }
 */
function validateDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return {
            valid: false,
            error: 'DATABASE_URL environment variable not found'
        };
    }

    if (databaseUrl.trim() === '') {
        return {
            valid: false,
            error: 'DATABASE_URL environment variable is empty'
        };
    }

    return {
        valid: true,
        url: databaseUrl
    };
}

/**
 * Determines database type from backend app definition
 * Reuses core logic from @friggframework/core/database/config
 *
 * @returns {Object} { dbType?: 'mongodb'|'postgresql', error?: string }
 */
function getDatabaseType() {
    try {
        // Use the core database config logic (same logic used at runtime)
        const dbType = getDatabaseTypeFromCore();
        return { dbType };
    } catch (error) {
        // Convert thrown errors to error object format for CLI
        // Strip [Frigg] prefix from error messages for cleaner CLI output
        const errorMessage = error.message.replace(/^\[Frigg\]\s*/, '');
        return {
            error: errorMessage,
            stack: error.stack // Include stack trace for debugging
        };
    }
}

/**
 * Tests database connectivity by attempting to connect
 * Uses the same Prisma client configuration as runtime
 *
 * @param {string} databaseUrl - Database connection URL (for validation purposes)
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type to determine appropriate health check
 * @param {number} timeout - Connection timeout in milliseconds (default: 5000)
 * @returns {Promise<Object>} { connected: boolean, error?: string }
 */
async function testDatabaseConnection(databaseUrl, dbType, timeout = 5000) {
    try {
        // Use the core Prisma client (same client used at runtime)
        // This automatically uses the correct client based on DB_TYPE
        const connectPromise = connectPrisma();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
        );

        const client = await Promise.race([connectPromise, timeoutPromise]);

        // Test with database-appropriate health check
        // MongoDB and DocumentDB don't support SQL, so we use the native ping command
        if (dbType === 'mongodb' || dbType === 'documentdb') {
            // Use MongoDB's native ping command via $runCommandRaw
            await client.$runCommandRaw({ ping: 1 });
        } else {
            // PostgreSQL: use a simple SQL query
            await client.$queryRaw`SELECT 1`;
        }

        await disconnectPrisma();

        return { connected: true };

    } catch (error) {
        try {
            await disconnectPrisma();
        } catch (disconnectError) {
            // Ignore disconnect errors
        }

        return {
            connected: false,
            error: error.message
        };
    }
}

/**
 * Checks if Prisma client is generated for the database type
 * Checks for the generated client directory in @friggframework/core/generated
 *
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @param {string} projectRoot - Project root directory (used for require.resolve context)
 * @returns {Object} { generated: boolean, path?: string, error?: string }
 */
function checkPrismaClientGenerated(dbType, projectRoot = process.cwd()) {
    try {
        // Normalize DocumentDB to MongoDB (they use the same Prisma client)
        const normalizedType = normalizeMongoCompatible(dbType);

        // Resolve where @friggframework/core actually is
        // This handles file: dependencies and symlinks correctly
        const corePackagePath = require.resolve('@friggframework/core', {
            paths: [projectRoot]
        });
        const corePackageDir = path.dirname(corePackagePath);

        // Check for the generated client directory (same path core uses)
        const clientPath = path.join(corePackageDir, 'generated', `prisma-${normalizedType}`);
        const clientIndexPath = path.join(clientPath, 'index.js');

        if (fs.existsSync(clientIndexPath)) {
            return {
                generated: true,
                path: clientPath
            };
        }

        return {
            generated: false,
            error: `Prisma client for ${dbType} not found at ${clientPath}. Run 'frigg db:setup' to generate it.`
        };

    } catch (error) {
        return {
            generated: false,
            error: `Failed to check Prisma client: ${error.message}`
        };
    }
}

module.exports = {
    validateDatabaseUrl,
    getDatabaseType,
    testDatabaseConnection,
    checkPrismaClientGenerated
};
