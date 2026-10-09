/**
 * SQLite Token Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see TokenRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { TokenRepositoryPostgres } = require('./token-repository-postgres');

class TokenRepositorySqlite extends TokenRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    TokenRepositorySqlite,
};
