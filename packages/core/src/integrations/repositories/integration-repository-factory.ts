import { IntegrationRepositoryMongo } from './integration-repository-mongo';
import { IntegrationRepositoryPostgres } from './integration-repository-postgres';
import { IntegrationRepositoryDocumentDB } from './integration-repository-documentdb';
import type { IntegrationRepositoryInterface } from './integration-repository-interface';

import config from '../../database/config';

export function createIntegrationRepository(): IntegrationRepositoryInterface {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new IntegrationRepositoryMongo();
        case 'postgresql':
            return new IntegrationRepositoryPostgres();
        case 'documentdb':
            return new IntegrationRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export {
    IntegrationRepositoryMongo,
    IntegrationRepositoryPostgres,
    IntegrationRepositoryDocumentDB,
};
