import { createEncryptionExtension } from './encryption/prisma-encryption-extension';
import { loadCustomEncryptionSchema } from './encryption/encryption-schema-registry';
import { logger } from './encryption/logger';
import { Cryptor } from '../encrypt';
import config from './config';

export interface EncryptionConfig {
    enabled: boolean;
    method?: 'kms' | 'aes';
}

export function ensureMongoDbUrl(): void {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
        return;
    }

    if (process.env.MONGO_URI && process.env.MONGO_URI.trim()) {
        process.env.DATABASE_URL = process.env.MONGO_URI;
        logger.debug('Using MONGO_URI as DATABASE_URL for Mongo-compatible connection');
        return;
    }

    throw new Error(
        'DATABASE_URL or MONGO_URI environment variable must be set for MongoDB/DocumentDB'
    );
}

export function getEncryptionConfig(): EncryptionConfig {
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

export interface PrismaClientLike {
    $extends(extension: unknown): PrismaClientLike;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $runCommandRaw?(command: Record<string, unknown>): Promise<unknown>;
    $queryRaw?(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    [key: string]: unknown;
}

const prismaClientSingleton = (): PrismaClientLike => {
    let PrismaClientConstructor: new (options: Record<string, unknown>) => PrismaClientLike;

    const loadPrismaClient = (dbType: string): new (options: Record<string, unknown>) => PrismaClientLike => {
        const paths = [
            `/opt/nodejs/node_modules/generated/prisma-${dbType}`,
            `../generated/prisma-${dbType}`,
        ];

        for (const modulePath of paths) {
            try {
                return require(modulePath).PrismaClient;
            } catch (_err) {
                // Continue to next path
            }
        }

        throw new Error(
            `Cannot find Prisma client for ${dbType}. Tried paths: ${paths.join(', ')}`
        );
    };

    if (config.DB_TYPE === 'mongodb' || config.DB_TYPE === 'documentdb') {
        ensureMongoDbUrl();
        PrismaClientConstructor = loadPrismaClient('mongodb');
    } else if (config.DB_TYPE === 'postgresql') {
        PrismaClientConstructor = loadPrismaClient('postgresql');
    } else {
        throw new Error(
            `Unsupported database type: ${config.DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
        );
    }

    let client: PrismaClientLike = new PrismaClientConstructor({
        log: process.env.PRISMA_LOG_LEVEL
            ? process.env.PRISMA_LOG_LEVEL.split(',')
            : ['error', 'warn'],
        errorFormat: 'pretty',
    });

    const encryptionConfig = getEncryptionConfig();

    if (encryptionConfig.enabled) {
        try {
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
                `Field-level encryption enabled using ${encryptionConfig.method!.toUpperCase()}`
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

const globalForPrisma = global as typeof globalThis & {
    _prismaInstance?: PrismaClientLike;
};

function getPrismaClient(): PrismaClientLike {
    if (!globalForPrisma._prismaInstance) {
        globalForPrisma._prismaInstance = prismaClientSingleton();
    }
    return globalForPrisma._prismaInstance;
}

export const prisma: PrismaClientLike = new Proxy({} as PrismaClientLike, {
    get(_target, prop: string | symbol) {
        return (getPrismaClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
});

export async function disconnectPrisma(): Promise<void> {
    await getPrismaClient().$disconnect();
}

export async function connectPrisma(): Promise<PrismaClientLike> {
    await getPrismaClient().$connect();

    if (config.DB_TYPE === 'mongodb' || config.DB_TYPE === 'documentdb') {
        const { initializeMongoDBSchema } = require('./utils/mongodb-schema-init');
        await initializeMongoDBSchema();
    }

    return getPrismaClient();
}
