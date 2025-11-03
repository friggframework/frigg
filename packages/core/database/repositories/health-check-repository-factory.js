const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');
const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');
const { prisma } = require('../prisma');
const config = require('../config');

/**
 * @param {Object} [options]
 * @param {Object} [options.prismaClient] - Prisma client (defaults to singleton)
 * @returns {HealthCheckRepositoryInterface}
 */
function createHealthCheckRepository({ prismaClient = prisma } = {}) {
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
};
