const {
    WebsocketConnectionRepositoryMongo,
} = require('./websocket-connection-repository-mongo');
const {
    WebsocketConnectionRepositoryPostgres,
} = require('./websocket-connection-repository-postgres');
const {
    WebsocketConnectionRepositoryDocumentDB,
} = require('./websocket-connection-repository-documentdb');
const {
    WebsocketConnectionRepositorySqlite,
} = require('./websocket-connection-repository-sqlite');
const config = require('../../database/config');

/**
 * Websocket Connection Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * @returns {WebsocketConnectionRepositoryInterface} Configured repository adapter
 */
function createWebsocketConnectionRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new WebsocketConnectionRepositoryMongo();

        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres();

        case 'documentdb':
            return new WebsocketConnectionRepositoryDocumentDB();

        case 'sqlite':
            return new WebsocketConnectionRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    // Export adapters for direct testing
    WebsocketConnectionRepositoryMongo,
    WebsocketConnectionRepositoryPostgres,
    WebsocketConnectionRepositoryDocumentDB,
    WebsocketConnectionRepositorySqlite,
};
