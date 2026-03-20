/**
 * Database Configuration
 * Manages configuration for Prisma ORM operations
 */

export type DatabaseType = 'mongodb' | 'postgresql' | 'documentdb';

/**
 * Determines database type from environment or app definition
 *
 * Detection order:
 * 1. DB_TYPE environment variable (set for migration handlers)
 * 2. App definition (backend/index.js Definition.database configuration)
 */
function extractErrorFile(stack: string): string {
    const stackLines = stack.split('\n');
    for (const line of stackLines) {
        const match = /\(([^)]+\.js):\d+:\d+\)/.exec(line) || /at ([^(]+\.js):\d+:\d+/.exec(line);
        if (match?.[1] && !match[1].includes('node:internal')) {
            return match[1];
        }
    }
    return 'unknown file';
}

function resolveEnabledDatabase(database: Record<string, { enable?: boolean }>): DatabaseType {
    if (database.postgres?.enable === true) return 'postgresql';
    if (database.mongoDB?.enable === true) return 'mongodb';
    if (database.documentDB?.enable === true) return 'documentdb';

    throw new Error(
        '[Frigg] No database enabled in app definition. ' +
        'Set one of: database.postgres.enable, database.mongoDB.enable, or database.documentDB.enable to true'
    );
}

function loadAppDefinitionDatabase(backendIndexPath: string): Record<string, { enable?: boolean }> {
    let backendModule: { Definition?: { database?: Record<string, { enable?: boolean }> } };
    try {
        backendModule = require(backendIndexPath);
    } catch (requireError: unknown) {
        const err = requireError as Error & { stack?: string };
        const errorFile = extractErrorFile(err.stack || '');
        throw new Error(
            `[Frigg] Failed to load app definition from ${backendIndexPath}\n` +
            `Error: ${err.message}\n` +
            `File with error: ${errorFile}\n` +
            `\nFull stack trace:\n${err.stack}\n\n` +
            'This error occurred while loading your app definition or its dependencies. ' +
            'Check the file listed above for syntax errors (trailing commas, missing brackets, etc.)'
        );
    }

    const database = backendModule?.Definition?.database;
    if (!database) {
        throw new Error(
            '[Frigg] App definition missing database configuration. ' +
            `Add database: { postgres: { enable: true } } (or mongoDB/documentDB) to ${backendIndexPath}`
        );
    }

    return database;
}

export function getDatabaseType(): DatabaseType {
    if (process.env.DB_TYPE) {
        return process.env.DB_TYPE as DatabaseType;
    }

    try {
        const path = require('node:path');
        const fs = require('node:fs');
        const { findNearestBackendPackageJson } = require('../../utils');

        const backendPackagePath = findNearestBackendPackageJson();
        if (!backendPackagePath) {
            throw new Error(
                '[Frigg] Cannot find backend package.json. ' +
                'Ensure backend/package.json exists in your project.'
            );
        }

        const backendDir = path.dirname(backendPackagePath);
        const backendIndexPath = path.join(backendDir, 'index.js');

        if (!fs.existsSync(backendIndexPath)) {
            throw new Error(
                `[Frigg] Backend index.js not found at ${backendIndexPath}. ` +
                'Ensure backend/index.js exists with a Definition export.'
            );
        }

        const database = loadAppDefinitionDatabase(backendIndexPath);
        return resolveEnabledDatabase(database);
    } catch (error: unknown) {
        const err = error as Error;
        if (err.message.includes('[Frigg]')) {
            throw err;
        }
        throw new Error(
            `[Frigg] Failed to determine database type: ${err.message}`
        );
    }
}

let cachedDbType: DatabaseType | null = null;

export const PRISMA_LOG_LEVEL: string = process.env.PRISMA_LOG_LEVEL || 'error,warn';
export const PRISMA_QUERY_LOGGING: boolean = process.env.PRISMA_QUERY_LOGGING === 'true';

/**
 * Lazy-evaluated database type determined from app definition.
 * Only evaluates when accessed, preventing module load failures in test environments.
 */
export function getDbType(): DatabaseType {
    if (cachedDbType === null) {
        cachedDbType = getDatabaseType();
    }
    return cachedDbType;
}

/** Config object with lazy DB_TYPE for backward compatibility */
const config = {
    getDatabaseType,
    PRISMA_LOG_LEVEL,
    PRISMA_QUERY_LOGGING,
    get DB_TYPE(): DatabaseType {
        return getDbType();
    },
};

export default config;

// CommonJS-compatible named export for `import config = require('./config')`
export const DB_TYPE: DatabaseType = undefined as unknown as DatabaseType;

// Override with getter on module level for lazy evaluation
Object.defineProperty(exports, 'DB_TYPE', {
    get: getDbType,
    enumerable: true,
});

