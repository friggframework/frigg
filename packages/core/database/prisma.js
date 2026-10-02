const {
    createEncryptionExtension,
} = require('./encryption/prisma-encryption-extension');
const { loadCustomEncryptionSchema } = require('./encryption/encryption-schema-registry');
const { logger } = require('./encryption/logger');
const { Cryptor } = require('../encrypt/Cryptor');
const { getEncryptionConfig } = require('./encryption/encryption-config');
const config = require('./config');

/**
 * Ensures DATABASE_URL is set for MongoDB connections
 * Falls back to MONGO_URI if DATABASE_URL is not set
 * Infrastructure layer concern - maps legacy MONGO_URI to Prisma's expected DATABASE_URL
 * 
 * Note: This should only be called when DB_TYPE is 'mongodb' or 'documentdb'
 */
function ensureMongoDbUrl() {
    // If DATABASE_URL is already set, use it
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
        return;
    }

    // Fallback to MONGO_URI for backwards compatibility with DocumentDB deployments
    if (process.env.MONGO_URI && process.env.MONGO_URI.trim()) {
        process.env.DATABASE_URL = process.env.MONGO_URI;
        logger.debug('Using MONGO_URI as DATABASE_URL for Mongo-compatible connection');
        return;
    }

    // Neither is set - error
    throw new Error(
        'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB/DocumentDB'
    );
}

const prismaClientSingleton = () => {
    let PrismaClient;

    // Helper to try loading Prisma client from multiple locations
    const loadPrismaClient = (dbType) => {
        const paths = [
            // Lambda layer location (when using Prisma Lambda layer)
            `/opt/nodejs/node_modules/generated/prisma-${dbType}`,
            // Local development location (relative to core package)
            `../generated/prisma-${dbType}`,
        ];

        for (const path of paths) {
            try {
                return require(path).PrismaClient;
            } catch (err) {
                // Continue to next path
            }
        }

        throw new Error(
            `Cannot find Prisma client for ${dbType}. Tried paths: ${paths.join(', ')}`
        );
    };

    if (config.DB_TYPE === 'mongodb' || config.DB_TYPE === 'documentdb') {
        // Ensure DATABASE_URL is set (fallback to MONGO_URI if needed)
        ensureMongoDbUrl();
        PrismaClient = loadPrismaClient('mongodb');
    } else if (config.DB_TYPE === 'postgresql') {
        PrismaClient = loadPrismaClient('postgresql');
    } else {
        throw new Error(
            `Unsupported database type: ${config.DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
        );
    }

    let client = new PrismaClient({
        log: process.env.PRISMA_LOG_LEVEL
            ? process.env.PRISMA_LOG_LEVEL.split(',')
            : ['error', 'warn'],
        errorFormat: 'pretty',
    });

    // Throws when a deployed runtime has no encryption key: the app must not
    // start and write sensitive fields in plaintext.
    const encryptionConfig = getEncryptionConfig();

    if (encryptionConfig.enabled) {
        // Fail closed: if the extension cannot be installed, do not hand out
        // a client that would write plaintext.
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
        } catch (error) {
            logger.error('Failed to initialize encryption extension:', error);
            throw error;
        }

        logger.info(
            `Field-level encryption enabled using ${encryptionConfig.method.toUpperCase()}`
        );
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
    if (config.DB_TYPE === 'mongodb' || config.DB_TYPE === 'documentdb') {
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
