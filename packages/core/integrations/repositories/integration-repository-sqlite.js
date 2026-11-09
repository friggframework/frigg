/**
 * SQLite Integration Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see IntegrationRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');

class IntegrationRepositorySqlite extends IntegrationRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    IntegrationRepositorySqlite,
};
