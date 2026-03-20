import { ModuleRepositoryMongo } from './module-repository-mongo';
import { ModuleRepositoryPostgres } from './module-repository-postgres';
import { ModuleRepositoryDocumentDB } from './module-repository-documentdb';
import config from '../../database/config';
import type { ModuleRepositoryInterface } from './module-repository-interface';

export function createModuleRepository(): ModuleRepositoryInterface {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ModuleRepositoryMongo();

        case 'postgresql':
            return new ModuleRepositoryPostgres();

        case 'documentdb':
            return new ModuleRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export {
    ModuleRepositoryMongo,
    ModuleRepositoryPostgres,
    ModuleRepositoryDocumentDB,
};
