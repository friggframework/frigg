const { WebsocketConnectionRepositoryMongo } = require('./websocket-connection-repository-mongo');
const { WebsocketConnectionRepositoryPostgres } = require('./websocket-connection-repository-postgres');
const { WebsocketConnectionRepositoryDocumentDB } = require('./websocket-connection-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

function createWebsocketConnectionRepository() {
    if (isDocumentDB()) {
        return new WebsocketConnectionRepositoryDocumentDB();
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new WebsocketConnectionRepositoryMongo();

        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    WebsocketConnectionRepositoryMongo,
    WebsocketConnectionRepositoryPostgres,
    WebsocketConnectionRepositoryDocumentDB,
};
