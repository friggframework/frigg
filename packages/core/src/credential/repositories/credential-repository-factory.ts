import { CredentialRepositoryMongo } from './credential-repository-mongo';
import { CredentialRepositoryPostgres } from './credential-repository-postgres';
import { CredentialRepositoryDocumentDB } from './credential-repository-documentdb';
import { CredentialRepositoryInterface } from './credential-repository-interface';
import databaseConfig = require('../../database/config');

export function createCredentialRepository(): CredentialRepositoryInterface {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new CredentialRepositoryMongo();
        case 'postgresql':
            return new CredentialRepositoryPostgres();
        case 'documentdb':
            return new CredentialRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { CredentialRepositoryMongo, CredentialRepositoryPostgres, CredentialRepositoryDocumentDB };
