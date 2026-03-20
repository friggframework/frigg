import { IntegrationMappingRepositoryMongo } from './integration-mapping-repository-mongo';
import { IntegrationMappingRepositoryPostgres } from './integration-mapping-repository-postgres';
import { IntegrationMappingRepositoryDocumentDB } from './integration-mapping-repository-documentdb';
import type { IntegrationMappingRepositoryInterface } from './integration-mapping-repository-interface';

import config from '../../database/config';

export function createIntegrationMappingRepository(): IntegrationMappingRepositoryInterface {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new IntegrationMappingRepositoryMongo();
        case 'postgresql':
            return new IntegrationMappingRepositoryPostgres();
        case 'documentdb':
            return new IntegrationMappingRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { IntegrationMappingRepositoryMongo } from './integration-mapping-repository-mongo';
export { IntegrationMappingRepositoryPostgres } from './integration-mapping-repository-postgres';
export { IntegrationMappingRepositoryDocumentDB } from './integration-mapping-repository-documentdb';
