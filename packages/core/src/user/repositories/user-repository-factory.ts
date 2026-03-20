import { UserRepositoryMongo } from './user-repository-mongo';
import { UserRepositoryPostgres } from './user-repository-postgres';
import { UserRepositoryDocumentDB } from './user-repository-documentdb';
import { UserRepositoryInterface } from './user-repository-interface';
import databaseConfig = require('../../database/config');

export function createUserRepository(): UserRepositoryInterface {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new UserRepositoryMongo();
        case 'postgresql':
            return new UserRepositoryPostgres();
        case 'documentdb':
            return new UserRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { UserRepositoryMongo, UserRepositoryPostgres, UserRepositoryDocumentDB };
