const {
    createEncryptionExtension,
} = require('./encryption/prisma-encryption-extension');
const { registerCustomSchema } = require('./encryption/encryption-schema-registry');
const { logger } = require('./encryption/logger');
const { Cryptor } = require('../encrypt/Cryptor');
const config = require('./config');

/**
 * Ensures DATABASE_URL is set for MongoDB connections
 * Falls back to MONGO_URI if DATABASE_URL is not set
 * Infrastructure layer concern - maps legacy MONGO_URI to Prisma's expected DATABASE_URL
 * 
 * Note: This should only be called when DB_TYPE is 'mongodb'
 */
function ensureMongoDbUrl() {
    // If DATABASE_URL is already set, use it
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
        return;
    }

    // Fallback to MONGO_URI for backwards compatibility with DocumentDB deployments
    if (process.env.MONGO_URI && process.env.MONGO_URI.trim()) {
        process.env.DATABASE_URL = process.env.MONGO_URI;
        logger.debug('Using MONGO_URI as DATABASE_URL for MongoDB connection');
        return;
    }

    // Neither is set - error
    throw new Error(
        'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB'
    );
}

function getEncryptionConfig() {
    const STAGE = process.env.STAGE || process.env.NODE_ENV || 'development';
    const shouldBypassEncryption = ['dev', 'test', 'local'].includes(STAGE);

    if (shouldBypassEncryption) {
        return { enabled: false };
    }

    const hasKMS =
        process.env.KMS_KEY_ARN && process.env.KMS_KEY_ARN.trim() !== '';
    const hasAES =
        process.env.AES_KEY_ID && process.env.AES_KEY_ID.trim() !== '';

    if (!hasKMS && !hasAES) {
        logger.warn(
            'No encryption keys configured (KMS_KEY_ARN or AES_KEY_ID). ' +
            'Field-level encryption disabled. Set STAGE=production and configure keys to enable.'
        );
        return { enabled: false };
    }

    return {
        enabled: true,
        method: hasKMS ? 'kms' : 'aes',
    };
}

/**
 * Loads and registers custom encryption schema from appDefinition
 * Gracefully handles cases where appDefinition is not available
 */
function loadCustomEncryptionSchema() {
    try {
        // Lazy require to avoid circular dependency issues
        const path = require('node:path');
        const { findNearestBackendPackageJson } = require('../utils');

        const backendPackagePath = findNearestBackendPackageJson();
        if (!backendPackagePath) {
            return; // No backend found, skip custom schema
        }

        const backendDir = path.dirname(backendPackagePath);
        const backendIndexPath = path.join(backendDir, 'index.js');

        const backendModule = require(backendIndexPath);
        const appDefinition = backendModule?.Definition;

        if (!appDefinition) {
            return; // No app definition found
        }

        const customSchema = appDefinition.encryption?.schema;

        if (customSchema && Object.keys(customSchema).length > 0) {
            registerCustomSchema(customSchema);
        }
    } catch (error) {
        // Silently ignore errors - custom schema is optional
        // This handles cases like:
        // - Backend package.json not found (tests, standalone usage)
        // - No appDefinition defined
        // - No custom encryption schema specified
        logger.debug('Could not load custom encryption schema:', error.message);
    }
}

const prismaClientSingleton = () => {
    let PrismaClient;

    // Helper to try loading Prisma client from multiple locations
    const loadPrismaClient = (dbType) => {
        const fs = require('fs');
        const layerPath = `/opt/nodejs/node_modules/generated/prisma-${dbType}`;
        
        // Check if layer exists (when usePrismaLambdaLayer=true)
        if (fs.existsSync(layerPath)) {
            try {
                return require(layerPath).PrismaClient;
            } catch (err) {
                // Layer exists but failed to load - fall through to bundled paths
            }
        }
        
        // Layer doesn't exist or failed - use bundled/local paths (when usePrismaLambdaLayer=false)
        const localPaths = [
            // Bundled with function (when usePrismaLambdaLayer=false)
            `@friggframework/core/generated/prisma-${dbType}`,
            // Local development (relative to core package)
            `../generated/prisma-${dbType}`,
        ];

        for (const path of localPaths) {
            try {
                return require(path).PrismaClient;
            } catch (err) {
                // Continue to next path
            }
        }

        throw new Error(
            `Cannot find Prisma client for ${dbType}. ` +
            `Tried layer path: ${layerPath}, local paths: ${localPaths.join(', ')}`
        );
    };

    if (config.DB_TYPE === 'mongodb') {
        // Ensure DATABASE_URL is set (fallback to MONGO_URI if needed)
        ensureMongoDbUrl();
        PrismaClient = loadPrismaClient('mongodb');
    } else if (config.DB_TYPE === 'postgresql') {
        PrismaClient = loadPrismaClient('postgresql');
    } else {
        throw new Error(
            `Unsupported database type: ${config.DB_TYPE}. Supported values: 'mongodb', 'postgresql'`
        );
    }

    let client = new PrismaClient({
        log: process.env.PRISMA_LOG_LEVEL
            ? process.env.PRISMA_LOG_LEVEL.split(',')
            : ['error', 'warn'],
        errorFormat: 'pretty',
    });

    const encryptionConfig = getEncryptionConfig();

    if (encryptionConfig.enabled) {
        try {
            // Load custom encryption schema from appDefinition before creating extension
            loadCustomEncryptionSchema();

            const cryptor = new Cryptor({
                shouldUseAws: encryptionConfig.method === 'kms',
            });

            client = client.$extends(
                createEncryptionExtension({
                    cryptor,
                    enabled: true,
                })
            );

            logger.info(
                `Field-level encryption enabled using ${encryptionConfig.method.toUpperCase()}`
            );
        } catch (error) {
            logger.error(
                'Failed to initialize encryption extension:',
                error
            );
            logger.warn('Continuing without encryption...');
        }
    } else {
        logger.info('Field-level encryption disabled');
    }

    return client;
};

const globalForPrisma = global;

// Lazy initialization - only create singleton when first accessed
function getPrismaClient() {
    if (!globalForPrisma._prismaInstance) {
        globalForPrisma._prismaInstance = prismaClientSingleton();
    }
    return globalForPrisma._prismaInstance;
}

// Export a getter for lazy initialization
const prisma = new Proxy({}, {
    get(target, prop) {
        return getPrismaClient()[prop];
    }
});

async function disconnectPrisma() {
    await getPrismaClient().$disconnect();
}

async function connectPrisma() {
    await getPrismaClient().$connect();

    // Initialize MongoDB schema - ensure all collections exist
    // Only run for MongoDB/DocumentDB (not PostgreSQL)
    // This prevents "Cannot create namespace in multi-document transaction" errors
    if (config.DB_TYPE === 'mongodb') {
        const { initializeMongoDBSchema } = require('./utils/mongodb-schema-init');
        await initializeMongoDBSchema();
    }

    return getPrismaClient();
}

module.exports = {
    prisma,
    connectPrisma,
    disconnectPrisma,
    getEncryptionConfig,
    ensureMongoDbUrl, // Exported for testing
};
