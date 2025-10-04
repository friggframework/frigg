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
 * @param {string} databaseUrl - Database connection URL (unused, uses DATABASE_URL env var)
 * @param {'mongodb'|'postgresql'} dbType - Database type (unused, determined by core config)
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

        // Test with a simple query to verify connectivity
        await client.$queryRaw`SELECT 1`;

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
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {string} projectRoot - Project root directory
 * @returns {Object} { generated: boolean, path?: string, error?: string }
 */
function checkPrismaClientGenerated(dbType, projectRoot = process.cwd()) {
    try {
        const clientPackageName = dbType === 'mongodb' ? '@prisma-mongo/client' : '@prisma-postgres/client';
        const clientPath = path.join(
            projectRoot,
            'node_modules',
            '@friggframework',
            'core',
            'node_modules',
            clientPackageName
        );

        const indexPath = path.join(clientPath, 'index.js');

        if (fs.existsSync(indexPath)) {
            return {
                generated: true,
                path: clientPath
            };
        }

        return {
            generated: false,
            error: `Prisma client for ${dbType} not found at ${clientPath}`
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
