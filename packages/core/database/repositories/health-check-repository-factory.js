const {
    HealthCheckRepositoryPostgreSQL,
} = require('./health-check-repository-postgres');
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
    if (!prismaClient) {
        throw new Error('prismaClient is required');
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');
            return new HealthCheckRepositoryMongoDB({ prismaClient });

        case 'postgresql':
            return new HealthCheckRepositoryPostgreSQL({ prismaClient });

        case 'documentdb':
            const { HealthCheckRepositoryDocumentDB } = require('./health-check-repository-documentdb');
            return new HealthCheckRepositoryDocumentDB({ prismaClient });

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createHealthCheckRepository,
    get HealthCheckRepositoryMongoDB() { return require('./health-check-repository-mongodb').HealthCheckRepositoryMongoDB; },
    HealthCheckRepositoryPostgreSQL,
    get HealthCheckRepositoryDocumentDB() { return require('./health-check-repository-documentdb').HealthCheckRepositoryDocumentDB; },
};
