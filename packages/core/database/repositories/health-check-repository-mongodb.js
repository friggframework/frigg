const { prisma } = require('../prisma');
const { mongoose } = require('../mongoose');
const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');

/**
 * MongoDB-specific Health Check Repository
 *
 * Provides MongoDB-specific database operations for health testing.
 * Uses Prisma for MongoDB operations (Mongoose is legacy/unused).
 */
class HealthCheckRepositoryMongoDB extends HealthCheckRepositoryInterface {
    constructor() {
        super();
    }

    async getDatabaseConnectionState() {
        // Prisma doesn't expose connection state like Mongoose
        // We need to actually test the connection
        let isConnected = false;
        let stateName = 'unknown';
        
        try {
            // Try a quick query to see if we're connected
            await prisma.$runCommandRaw({ ping: 1 });
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
        // Use Prisma's $queryRaw to execute a ping command
        await prisma.$queryRaw`SELECT 1`.catch(() => {
            // For MongoDB, use runCommandRaw instead
            return prisma.$runCommandRaw({ ping: 1 });
        });
        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        // Note: Collection existence is ensured at application startup via
        // initializeMongoDBSchema() in database/utils/mongodb-schema-init.js
        // This prevents "Cannot create namespace in multi-document transaction" errors
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
     * Get raw credential from MongoDB bypassing Prisma encryption extension
     * Uses Mongoose to access raw MongoDB collection
     * @param {string} id - Credential ID
     * @returns {Promise<Object|null>} Raw credential from database
     */
    async getRawCredentialById(id) {
        const { ObjectId } = require('mongodb');
        return await mongoose.connection.db
            .collection('Credential')
            .findOne({ _id: new ObjectId(id) });
    }

    async deleteCredential(id) {
        await prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepositoryMongoDB };
