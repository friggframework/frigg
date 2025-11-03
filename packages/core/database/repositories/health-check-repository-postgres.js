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

    async getDatabaseConnectionState() {
        // PostgreSQL connection state via Prisma
        // Prisma doesn't expose connection state, so we test it
        let isConnected = false;
        let stateName = 'unknown';
        
        try {
            // Try a quick query to see if we're connected
            await prisma.$queryRaw`SELECT 1`;
            isConnected = true;
            stateName = 'connected';
        } catch (error) {
            stateName = 'disconnected';
        }

        return {
            readyState: isConnected ? 1 : 0,
            stateName,
            isConnected,
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
