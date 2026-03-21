const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');
const {
    toObjectId,
    fromObjectId,
    findOne,
    insertOne,
    deleteOne,
} = require('../documentdb-utils');
const { DocumentDBEncryptionService } = require('../documentdb-encryption-service');

class HealthCheckRepositoryDocumentDB extends HealthCheckRepositoryInterface {
    /**
     * @param {Object} params
     * @param {Object} params.prismaClient - Prisma client instance
     */
    constructor({ prismaClient }) {
        super();
        this.prisma = prismaClient;
        this.encryptionService = new DocumentDBEncryptionService();
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
        let timeoutId;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Database ping timeout')), maxTimeMS);
        });

        try {
            await Promise.race([
                this.prisma.$runCommandRaw({ ping: 1 }),
                timeoutPromise,
            ]);
            return Date.now() - pingStart;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async createCredential(credentialData) {
        const now = new Date();
        const document = {
            ...credentialData,
            createdAt: now,
            updatedAt: now,
        };

        // Encrypt sensitive fields before insert
        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            document
        );
        const insertedId = await insertOne(this.prisma, 'Credential', encryptedDocument);
        const created = await findOne(this.prisma, 'Credential', { _id: insertedId });

        // Decrypt after read
        const decrypted = await this.encryptionService.decryptFields(
            'Credential',
            created
        );

        return {
            id: fromObjectId(decrypted._id),
            ...decrypted,
        };
    }

    async findCredentialById(id) {
        const doc = await findOne(this.prisma, 'Credential', {
            _id: toObjectId(id),
        });

        if (!doc) return null;

        // Decrypt sensitive fields
        const decrypted = await this.encryptionService.decryptFields('Credential', doc);

        return {
            id: fromObjectId(decrypted._id),
            ...decrypted,
        };
    }

    async getRawCredentialById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;

        const result = await this.prisma.$runCommandRaw({
            find: 'Credential',
            filter: { _id: objectId },
        });

        // Return raw document WITHOUT decryption
        // This allows the test to verify that fields are actually encrypted in the database
        return result?.cursor?.firstBatch?.[0] ?? null;
    }

    async deleteCredential(id) {
        const objectId = toObjectId(id);
        if (!objectId) return false;

        const result = await deleteOne(this.prisma, 'Credential', { _id: objectId });
        const deleted = result?.n ?? 0;
        return deleted > 0;
    }
}

module.exports = { HealthCheckRepositoryDocumentDB };

