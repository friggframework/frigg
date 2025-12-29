const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');

class HealthCheckRepositoryPostgreSQL extends HealthCheckRepositoryInterface {
    /**
     * @param {Object} params
     * @param {Object} params.prismaClient - Prisma client instance
     */
    constructor({ prismaClient }) {
        super();
        this.prisma = prismaClient;
    }

    /**
     * @returns {Promise<{readyState: number, stateName: string, isConnected: boolean}>}
     */
    async getDatabaseConnectionState() {
        let isConnected = false;
        let stateName = 'unknown';

        try {
            await this.prisma.$queryRaw`SELECT 1`;
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

    /**
     * @param {number} maxTimeMS
     * @returns {Promise<number>} Response time in milliseconds
     */
    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();
        await this.prisma.$queryRaw`SELECT 1`;
        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        return await this.prisma.credential.create({
            data: credentialData,
        });
    }

    async findCredentialById(id) {
        return await this.prisma.credential.findUnique({
            where: { id },
        });
    }

    /**
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getRawCredentialById(id) {
        const results = await this.prisma.$queryRaw`
            SELECT * FROM "Credential" WHERE id = ${id}
        `;

        if (!results || results.length === 0) {
            return null;
        }

        return results[0];
    }

    async deleteCredential(id) {
        await this.prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryPostgreSQL };
