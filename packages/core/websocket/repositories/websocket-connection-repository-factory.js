const {
    WebsocketConnectionRepositoryPostgres,
} = require('./websocket-connection-repository-postgres');
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
            const { WebsocketConnectionRepositoryMongo } = require('./websocket-connection-repository-mongo');
            return new WebsocketConnectionRepositoryMongo();

        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres();

        case 'documentdb':
            const { WebsocketConnectionRepositoryDocumentDB } = require('./websocket-connection-repository-documentdb');
            return new WebsocketConnectionRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    // Export adapters for direct testing
    get WebsocketConnectionRepositoryMongo() { return require('./websocket-connection-repository-mongo').WebsocketConnectionRepositoryMongo; },
    WebsocketConnectionRepositoryPostgres,
    get WebsocketConnectionRepositoryDocumentDB() { return require('./websocket-connection-repository-documentdb').WebsocketConnectionRepositoryDocumentDB; },
};
