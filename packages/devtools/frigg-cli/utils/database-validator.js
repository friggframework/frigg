const path = require('path');
const fs = require('fs');
const { getDatabaseType: getDatabaseTypeFromCore } = require('@friggframework/core/database/config');
const { connectPrisma, disconnectPrisma } = require('@friggframework/core/database/prisma');
const { validatePrismaClient } = require('@friggframework/core/database/utils/binary-validator');
const { getPlatformDescription } = require('@friggframework/core/database/utils/platform-detector');

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
 * Checks if Prisma client is generated for the database type AND has platform-specific binaries
 * This is critical for cross-platform support (e.g., macOS users installing from npm packages built on Linux)
 *
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {string} projectRoot - Project root directory (used for require.resolve context)
 * @returns {Object} { generated: boolean, path?: string, error?: string, needsRegeneration?: boolean, suggestion?: string }
 */
function checkPrismaClientGenerated(dbType, projectRoot = process.cwd()) {
    try {
        // Resolve where @friggframework/core actually is
        // This handles file: dependencies and symlinks correctly
        const corePackagePath = require.resolve('@friggframework/core', {
            paths: [projectRoot]
        });
        const corePackageDir = path.dirname(corePackagePath);

        // Check for the generated client directory (same path core uses)
        const clientPath = path.join(corePackageDir, 'generated', `prisma-${dbType}`);

        // Use the comprehensive binary validator to check client and platform binaries
        const validation = validatePrismaClient(clientPath);

        // If validation passed, client is fully generated for this platform
        if (validation.valid) {
            return {
                generated: true,
                path: clientPath,
                platformBinary: validation.requiredTarget
            };
        }

        // If client directory doesn't exist at all
        if (!validation.clientExists) {
            return {
                generated: false,
                error: `Prisma client for ${dbType} not found at ${clientPath}. Run 'frigg db:setup' to generate it.`
            };
        }

        // Client exists but platform binary is missing (common issue on macOS)
        // This happens when package is installed from npm with pre-built binaries for a different platform
        if (validation.clientExists && !validation.platformBinaryExists) {
            const platform = getPlatformDescription();
            const availableInfo = validation.availableTargets && validation.availableTargets.length > 0
                ? ` Found binaries for: ${validation.availableTargets.join(', ')}.`
                : '';

            return {
                generated: false,
                needsRegeneration: true,
                clientPath,
                requiredTarget: validation.requiredTarget,
                availableTargets: validation.availableTargets,
                error: `Prisma client for ${dbType} exists but is missing binaries for your platform (${platform}).${availableInfo}`,
                suggestion: validation.suggestion || 'Run \'frigg db:setup\' to regenerate the client for your platform.'
            };
        }

        // Unknown validation failure
        return {
            generated: false,
            error: validation.error || 'Prisma client validation failed'
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
