/**
 * SQLite Module Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see ModuleRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');

class ModuleRepositorySqlite extends ModuleRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    ModuleRepositorySqlite,
};
