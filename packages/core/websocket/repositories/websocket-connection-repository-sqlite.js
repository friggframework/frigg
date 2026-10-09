/**
 * SQLite Websocket Connection Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see WebsocketConnectionRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { WebsocketConnectionRepositoryPostgres } = require('./websocket-connection-repository-postgres');

class WebsocketConnectionRepositorySqlite extends WebsocketConnectionRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    WebsocketConnectionRepositorySqlite,
};
