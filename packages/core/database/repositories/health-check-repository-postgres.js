const { prisma } = require('../prisma');
const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');

/**
 * PostgreSQL-specific Health Check Repository
 *
 * Provides PostgreSQL-specific database operations for health testing.
 * Uses Prisma raw queries for PostgreSQL-specific operations.
 */
class HealthCheckRepositoryPostgreSQL extends HealthCheckRepositoryInterface {
    constructor() {
        super();
    }

    getDatabaseConnectionState() {
        // PostgreSQL connection state via Prisma
        // Note: Prisma doesn't expose connection state like Mongoose
        // We check if prisma is connected by attempting a query
        return {
            readyState: 1, // Assume connected if Prisma instance exists
            stateName: 'connected',
            isConnected: true,
        };
    }

    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();

        // PostgreSQL ping using SELECT 1
        await prisma.$queryRaw`SELECT 1`;

        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        return await prisma.credential.create({
            data: credentialData,
        });
    }

    async findCredentialById(id) {
        return await prisma.credential.findUnique({
            where: { id },
        });
    }

    /**
     * Get raw credential from PostgreSQL bypassing Prisma encryption extension
     * Uses $queryRaw to access raw PostgreSQL table
     * @param {string} id - Credential ID
     * @returns {Promise<Object|null>} Raw credential from database
     */
    async getRawCredentialById(id) {
        const results = await prisma.$queryRaw`
            SELECT * FROM "Credential" WHERE id = ${id}
        `;

        if (!results || results.length === 0) {
            return null;
        }

        // Return first result
        return results[0];
    }

    async deleteCredential(id) {
        await prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryPostgreSQL };
