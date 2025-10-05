const path = require('path');
const fs = require('fs');
const { getDatabaseType: getDatabaseTypeFromCore } = require('@friggframework/core/database/config');
const { connectPrisma, disconnectPrisma } = require('@friggframework/core/database/prisma');

/**
 * Database Validation Utility
 * Validates database configuration and connectivity for Frigg applications
 */

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
        return { error: errorMessage };
    }
}

/**
 * Tests database connectivity by attempting to connect
 * Uses the same Prisma client configuration as runtime
 *
 * @param {string} databaseUrl - Database connection URL (for validation purposes)
 * @param {'mongodb'|'postgresql'} dbType - Database type to determine appropriate health check
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
        // MongoDB doesn't support SQL, so we use the native ping command
        if (dbType === 'mongodb') {
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
 * Uses require.resolve() to find the client regardless of package manager hoisting
 *
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {string} projectRoot - Project root directory (used for require.resolve context)
 * @returns {Object} { generated: boolean, path?: string, error?: string }
 */
function checkPrismaClientGenerated(dbType, projectRoot = process.cwd()) {
    const clientPackageName = `@prisma-${dbType}/client`;

    try {
        // Use require.resolve to locate the client package
        // This works with any package manager (npm, yarn, pnpm) and hoisting strategy
        const clientPath = require.resolve(clientPackageName, {
            paths: [
                // Try from @friggframework/core first (most likely location)
                path.join(projectRoot, 'node_modules', '@friggframework', 'core'),
                // Fallback to project root (in case of different hoisting)
                projectRoot
            ]
        });

        return {
            generated: true,
            path: path.dirname(clientPath)
        };

    } catch (error) {
        // require.resolve throws MODULE_NOT_FOUND if the client doesn't exist
        if (error.code === 'MODULE_NOT_FOUND') {
            return {
                generated: false,
                error: `Prisma client for ${dbType} (${clientPackageName}) not found. Run 'frigg db:setup' to generate it.`
            };
        }

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
