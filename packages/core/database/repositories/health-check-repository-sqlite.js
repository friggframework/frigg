/**
 * SQLite Health Check Repository
 *
 * SQLite uses the same Prisma schema structure as PostgreSQL:
 * - Int IDs with autoincrement
 * - JSON stored as String
 *
 * This implementation extends PostgreSQL since the data access patterns are identical.
 *
 * @see HealthCheckRepositoryPostgreSQL
 */

const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');

class HealthCheckRepositorySqlite extends HealthCheckRepositoryPostgreSQL {
    /**
     * @param {Object} params
     * @param {Object} params.prismaClient - Prisma client instance
     */
    constructor({ prismaClient }) {
        super({ prismaClient });
    }
}

module.exports = { HealthCheckRepositorySqlite };
