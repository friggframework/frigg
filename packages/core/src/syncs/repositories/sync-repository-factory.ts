import { SyncRepositoryMongo } from './sync-repository-mongo';
import { SyncRepositoryPostgres } from './sync-repository-postgres';
import { SyncRepositoryDocumentDB } from './sync-repository-documentdb';
import type { SyncRepositoryInterface } from './sync-repository-interface';

import databaseConfig = require('../../database/config');

export function createSyncRepository(): SyncRepositoryInterface {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new SyncRepositoryMongo();

        case 'postgresql':
            return new SyncRepositoryPostgres();

        case 'documentdb':
            return new SyncRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { SyncRepositoryMongo } from './sync-repository-mongo';
export { SyncRepositoryPostgres } from './sync-repository-postgres';
export { SyncRepositoryDocumentDB } from './sync-repository-documentdb';
