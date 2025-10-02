const {
    createEncryptionExtension,
} = require('./encryption/prisma-encryption-extension');
const { registerCustomSchema } = require('./encryption/encryption-schema-registry');
const { Cryptor } = require('../encrypt/Cryptor');

const DB_TYPE = process.env.DB_TYPE || 'mongodb';

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
        console.warn(
            '[Frigg] No encryption keys configured (KMS_KEY_ARN or AES_KEY_ID). ' +
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
        if (process.env.FRIGG_DEBUG) {
            console.log('[Frigg Debug] Could not load custom encryption schema:', error.message);
        }
    }
}

const prismaClientSingleton = () => {
    let PrismaClient;

    if (DB_TYPE === 'mongodb') {
        PrismaClient = require('@prisma-mongo/client').PrismaClient;
    } else if (DB_TYPE === 'postgresql') {
        PrismaClient = require('@prisma-postgres/client').PrismaClient;
    } else {
        throw new Error(
            `Unsupported DB_TYPE: ${DB_TYPE}. Supported values: 'mongodb', 'postgresql'`
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

            console.log(
                `[Frigg] Field-level encryption enabled using ${encryptionConfig.method.toUpperCase()}`
            );
        } catch (error) {
            console.error(
                '[Frigg] Failed to initialize encryption extension:',
                error.message
            );
            console.warn('[Frigg] Continuing without encryption...');
        }
    } else {
        console.log('[Frigg] Field-level encryption disabled');
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
    return getPrismaClient();
}

module.exports = {
    prisma,
    connectPrisma,
    disconnectPrisma,
    getEncryptionConfig,
};
