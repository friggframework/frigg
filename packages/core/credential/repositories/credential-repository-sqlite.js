/**
 * SQLite Credential Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 * Only difference is the Prisma client used (prisma-sqlite vs prisma-postgresql).
 *
 * @see CredentialRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { CredentialRepositoryPostgres } = require('./credential-repository-postgres');

class CredentialRepositorySqlite extends CredentialRepositoryPostgres {
    constructor() {
        // Parent uses this.prisma = prisma from module
        // But SQLite uses different prisma instance
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    CredentialRepositorySqlite,
};
