const {
    WebsocketConnectionRepositoryMongo,
} = require('./websocket-connection-repository-mongo');
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
    // Export adapters for direct testing
    WebsocketConnectionRepositoryMongo,
    WebsocketConnectionRepositoryPostgres,
};
