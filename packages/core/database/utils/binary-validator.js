const path = require('path');
const fs = require('fs');
const { getPrismaBinaryTarget } = require('./platform-detector');

/**
 * Binary Validator Service
 * Validates that Prisma client binaries exist for the current platform
 *
 * Domain Service following hexagonal architecture patterns
 */

/**
 * Checks if the Prisma query engine binary exists for the current platform
 * @param {string} clientPath - Path to the generated Prisma client directory
 * @param {string|null} expectedTarget - Expected binary target (defaults to current platform)
 * @returns {Object} { exists: boolean, binaryPath?: string, target?: string, error?: string }
 */
function checkPlatformBinary(clientPath, expectedTarget = null) {
    try {
        const target = expectedTarget || getPrismaBinaryTarget();

        if (!target) {
            return {
                exists: false,
                error: 'Unable to determine platform binary target'
            };
        }

        // Prisma stores query engine binaries in the client directory
        // Path pattern: generated/prisma-{dbType}/libquery_engine-{target}.{extension}
        // Extensions: .so.node (Linux/macOS), .dll.node (Windows)
        const possibleExtensions = ['.so.node', '.dll.node', '.node'];

        for (const ext of possibleExtensions) {
            const binaryFileName = `libquery_engine-${target}${ext}`;
            const binaryPath = path.join(clientPath, binaryFileName);

            if (fs.existsSync(binaryPath)) {
                return {
                    exists: true,
                    binaryPath,
                    target
                };
            }
        }

        // Binary not found
        return {
            exists: false,
            target,
            error: `Query engine binary not found for platform: ${target}`
        };

    } catch (error) {
        return {
            exists: false,
            error: `Error checking platform binary: ${error.message}`
        };
    }
}

/**
 * Lists all available query engine binaries in the client directory
 * Useful for debugging and understanding what's actually installed
 * @param {string} clientPath - Path to the generated Prisma client directory
 * @returns {Array<string>} List of binary targets found
 */
function listAvailableBinaries(clientPath) {
    try {
        if (!fs.existsSync(clientPath)) {
            return [];
        }

        const files = fs.readdirSync(clientPath);
        // Match pattern: libquery_engine-{target}.{extension}
        // Target can include dots, hyphens, etc. (e.g., rhel-openssl-3.0.x)
        // Extensions: .so.node, .dll.node, .node
        const binaryPattern = /^libquery_engine-(.+?)\.(so\.node|dll\.node|node)$/;

        const targets = files
            .filter(file => binaryPattern.test(file))
            .map(file => {
                const match = file.match(binaryPattern);
                return match ? match[1] : null;
            })
            .filter(Boolean);

        return targets;

    } catch (error) {
        return [];
    }
}

/**
 * Comprehensive validation of Prisma client for current platform
 * @param {string} clientPath - Path to the generated Prisma client directory
 * @returns {Object} Detailed validation result
 */
function validatePrismaClient(clientPath) {
    // Check if client directory exists
    if (!fs.existsSync(clientPath)) {
        return {
            valid: false,
            clientExists: false,
            platformBinaryExists: false,
            error: 'Prisma client directory not found',
            clientPath
        };
    }

    // Check if client index file exists
    const clientIndexPath = path.join(clientPath, 'index.js');
    if (!fs.existsSync(clientIndexPath)) {
        return {
            valid: false,
            clientExists: false,
            platformBinaryExists: false,
            error: 'Prisma client index.js not found',
            clientPath
        };
    }

    // Check platform-specific binary
    const binaryCheck = checkPlatformBinary(clientPath);

    if (!binaryCheck.exists) {
        const availableBinaries = listAvailableBinaries(clientPath);

        return {
            valid: false,
            clientExists: true,
            platformBinaryExists: false,
            requiredTarget: binaryCheck.target,
            availableTargets: availableBinaries,
            error: binaryCheck.error,
            clientPath,
            suggestion: availableBinaries.length > 0
                ? `Found binaries for: ${availableBinaries.join(', ')}. Run 'frigg db:setup' to regenerate for your platform.`
                : 'No query engine binaries found. Run \'frigg db:setup\' to generate the client.'
        };
    }

    // All checks passed
    return {
        valid: true,
        clientExists: true,
        platformBinaryExists: true,
        requiredTarget: binaryCheck.target,
        binaryPath: binaryCheck.binaryPath,
        clientPath
    };
}

/**
 * Checks if regeneration is needed for the current platform
 * Returns true if client exists but platform binary is missing
 * @param {string} clientPath - Path to the generated Prisma client directory
 * @returns {boolean}
 */
function needsRegeneration(clientPath) {
    const validation = validatePrismaClient(clientPath);
    return validation.clientExists && !validation.platformBinaryExists;
}

module.exports = {
    checkPlatformBinary,
    listAvailableBinaries,
    validatePrismaClient,
    needsRegeneration
};
