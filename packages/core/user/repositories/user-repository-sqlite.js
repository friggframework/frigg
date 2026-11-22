/**
 * SQLite User Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see UserRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { UserRepositoryPostgres } = require('./user-repository-postgres');

class UserRepositorySqlite extends UserRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    UserRepositorySqlite,
};
