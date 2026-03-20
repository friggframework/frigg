import { WebsocketConnectionRepositoryMongo } from './websocket-connection-repository-mongo';
import { WebsocketConnectionRepositoryPostgres } from './websocket-connection-repository-postgres';
import { WebsocketConnectionRepositoryDocumentDB } from './websocket-connection-repository-documentdb';
import { WebsocketConnectionRepositoryInterface } from './websocket-connection-repository-interface';
import databaseConfig = require('../../database/config');

export function createWebsocketConnectionRepository(): WebsocketConnectionRepositoryInterface {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new WebsocketConnectionRepositoryMongo();
        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres();
        case 'documentdb':
            return new WebsocketConnectionRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { WebsocketConnectionRepositoryMongo, WebsocketConnectionRepositoryPostgres, WebsocketConnectionRepositoryDocumentDB };
