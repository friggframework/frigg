const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');
const { toObjectId } = require('../documentdb-utils');

class HealthCheckRepositoryDocumentDB extends HealthCheckRepositoryInterface {
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

    /**
     * @param {number} maxTimeMS
     * @returns {Promise<number>} Response time in milliseconds
     */
    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database ping timeout')), maxTimeMS)
        );

        await Promise.race([
            this.prisma.$runCommandRaw({ ping: 1 }),
            timeoutPromise,
        ]);

        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        return this.prisma.credential.create({
            data: credentialData,
        });
    }

    async findCredentialById(id) {
        return this.prisma.credential.findUnique({
            where: { id },
        });
    }

    async getRawCredentialById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;

        const result = await this.prisma.$runCommandRaw({
            find: 'Credential',
            filter: { _id: objectId },
        });

        return result?.cursor?.firstBatch?.[0] ?? null;
    }

    async deleteCredential(id) {
        await this.prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryDocumentDB };

