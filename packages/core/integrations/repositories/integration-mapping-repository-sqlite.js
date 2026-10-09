/**
 * SQLite Integration Mapping Repository Adapter
 *
 * SQLite uses the same schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see IntegrationMappingRepositoryPostgres
 */

const { prisma } = require('../../database/prisma');
const { IntegrationMappingRepositoryPostgres } = require('./integration-mapping-repository-postgres');

class IntegrationMappingRepositorySqlite extends IntegrationMappingRepositoryPostgres {
    constructor() {
        super();
        this.prisma = prisma;
    }
}

module.exports = {
    IntegrationMappingRepositorySqlite,
};
