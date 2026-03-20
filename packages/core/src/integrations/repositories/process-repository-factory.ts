import { ProcessRepositoryMongo } from './process-repository-mongo';
import { ProcessRepositoryPostgres } from './process-repository-postgres';
import { ProcessRepositoryDocumentDB } from './process-repository-documentdb';
import type { ProcessRepositoryInterface } from './process-repository-interface';

import config from '../../database/config';

export function createProcessRepository(): ProcessRepositoryInterface {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ProcessRepositoryMongo();
        case 'postgresql':
            return new ProcessRepositoryPostgres();
        case 'documentdb':
            return new ProcessRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { ProcessRepositoryMongo } from './process-repository-mongo';
export { ProcessRepositoryPostgres } from './process-repository-postgres';
export { ProcessRepositoryDocumentDB } from './process-repository-documentdb';
