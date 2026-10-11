/**
 * SQLite Sync Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see SyncRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { SyncRepositoryPostgres } = require('./sync-repository-postgres');

class SyncRepositorySqlite extends SyncRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    SyncRepositorySqlite,
};
