const { mongoose } = require('../mongoose');
const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');
const { removeUndefinedValues } = require('../utils/documentdb-compatibility');

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

    /**
     * @param {number} maxTimeMS
     * @returns {Promise<number>} Response time in milliseconds
     */
    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();
        await this.prisma.$queryRaw`SELECT 1`.catch(() => {
            return this.prisma.$runCommandRaw({ ping: 1 });
        });
        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        // Remove undefined values to prevent Prisma from using $$REMOVE (DocumentDB unsupported)
        const cleanedData = removeUndefinedValues(credentialData);
        
        return await this.prisma.credential.create({
            data: cleanedData,
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
        const result = await this.prisma.$runCommandRaw({
            find: 'Credential',
            filter: { _id: { $oid: id } },
            limit: 1,
        });
        
        if (!result.cursor || !result.cursor.firstBatch || result.cursor.firstBatch.length === 0) {
            return null;
        }
        
        return result.cursor.firstBatch[0];
    }

    async deleteCredential(id) {
        await this.prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryMongoDB };
