const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');
const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');
const { HealthCheckRepositoryDocumentDB } = require('./health-check-repository-documentdb');
const { isDocumentDB } = require('../utils/documentdb-compatibility');
const config = require('../config');

/**
 * Factory function to create a health check repository for the configured database type.
 * Requires explicit prismaClient injection to support IoC container patterns.
 *
 * @param {Object} options
 * @param {Object} options.prismaClient - Prisma client instance (required for dependency injection)
 * @returns {HealthCheckRepositoryInterface} Database-specific health check repository
 * @throws {Error} If prismaClient is not provided
 *
 * @example
 * const { prisma } = require('../prisma');
 * const repository = createHealthCheckRepository({ prismaClient: prisma });
 */
function createHealthCheckRepository({ prismaClient } = {}) {
    if (isDocumentDB()) {
        return new HealthCheckRepositoryDocumentDB();
    }

    if (!prismaClient) {
        throw new Error('prismaClient is required');
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new HealthCheckRepositoryMongoDB({ prismaClient });

        case 'postgresql':
            return new HealthCheckRepositoryPostgreSQL({ prismaClient });

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createHealthCheckRepository,
    HealthCheckRepositoryMongoDB,
    HealthCheckRepositoryPostgreSQL,
    HealthCheckRepositoryDocumentDB,
};
