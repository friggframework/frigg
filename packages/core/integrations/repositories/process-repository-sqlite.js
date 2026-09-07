/**
 * SQLite Process Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see ProcessRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { ProcessRepositoryPostgres } = require('./process-repository-postgres');

class ProcessRepositorySqlite extends ProcessRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    ProcessRepositorySqlite,
};
