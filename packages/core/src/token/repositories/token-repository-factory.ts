import { TokenRepositoryMongo } from './token-repository-mongo';
import { TokenRepositoryPostgres } from './token-repository-postgres';
import { TokenRepositoryDocumentDB } from './token-repository-documentdb';
import { TokenRepositoryInterface } from './token-repository-interface';
import databaseConfig = require('../../database/config');

export function createTokenRepository(): TokenRepositoryInterface {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new TokenRepositoryMongo();
        case 'postgresql':
            return new TokenRepositoryPostgres();
        case 'documentdb':
            return new TokenRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { TokenRepositoryMongo } from './token-repository-mongo';
export { TokenRepositoryPostgres } from './token-repository-postgres';
export { TokenRepositoryDocumentDB } from './token-repository-documentdb';
