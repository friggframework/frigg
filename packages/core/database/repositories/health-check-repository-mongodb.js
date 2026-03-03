const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');

class HealthCheckRepositoryMongoDB extends HealthCheckRepositoryInterface {
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
            await this.prisma.$runCommandRaw({ ping: 1 });
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
        let timeoutId;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Database ping timeout')), maxTimeMS);
        });

        try {
            await Promise.race([
                this.prisma.$runCommandRaw({ ping: 1 }),
                timeoutPromise
            ]);
            return Date.now() - pingStart;
        } finally {
            clearTimeout(timeoutId);
        }
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
     * Get raw credential from database bypassing Prisma encryption extension.
     * Uses $runCommandRaw to query MongoDB directly.
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getRawCredentialById(id) {
        if (!id) return null;
        const result = await this.prisma.$runCommandRaw({
            find: 'Credential',
            filter: { _id: { $oid: id } },
            limit: 1,
        });
        return result.cursor?.firstBatch?.[0] || null;
    }

    async deleteCredential(id) {
        await this.prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryMongoDB };
