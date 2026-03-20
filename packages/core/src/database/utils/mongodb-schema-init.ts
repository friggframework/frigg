import { prisma } from '../prisma';
import { ensureCollectionsExist } from './mongodb-collection-utils';
import { getCollectionsFromSchemaSync } from './prisma-schema-parser';
import config from '../config';

export async function initializeMongoDBSchema(): Promise<void> {
    if (config.DB_TYPE !== 'mongodb' && config.DB_TYPE !== 'documentdb') {
        console.log('Schema initialization skipped - not using MongoDB-compatible database');
        return;
    }

    try {
        await (prisma as any).$runCommandRaw({ ping: 1 });
    } catch {
        throw new Error(
            'Cannot initialize MongoDB schema - database not connected. ' +
            'Call connectPrisma() before initializeMongoDBSchema()'
        );
    }

    console.log('Initializing MongoDB-compatible schema - ensuring all collections exist...');
    const startTime = Date.now();

    try {
        const collections = getCollectionsFromSchemaSync();

        if (collections.length === 0) {
            console.warn('No collections found in Prisma schema - skipping initialization');
            return;
        }

        await ensureCollectionsExist(collections);

        const duration = Date.now() - startTime;
        console.log(
            `MongoDB-compatible schema initialization complete - ${collections.length} collections verified (${duration}ms)`
        );
    } catch (error) {
        console.error('Failed to initialize MongoDB schema:', (error as Error).message);
        throw error;
    }
}

export function getPrismaCollections(): string[] {
    try {
        return getCollectionsFromSchemaSync();
    } catch (error) {
        console.warn('Could not parse Prisma collections:', (error as Error).message);
        return [];
    }
}
