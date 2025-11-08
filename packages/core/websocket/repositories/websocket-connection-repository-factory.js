const { WebsocketConnectionRepositoryMongoDBNative } = require('./websocket-connection-repository-mongodb-native');
const { WebsocketConnectionRepositoryPostgres } = require('./websocket-connection-repository-postgres');
const config = require('../../database/config');

function createWebsocketConnectionRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new WebsocketConnectionRepositoryMongoDBNative();

        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    WebsocketConnectionRepositoryMongoDBNative,
    WebsocketConnectionRepositoryPostgres,
};
