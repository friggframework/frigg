const { prisma } = require('../prisma');
const { mongoose } = require('../mongoose');
const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');
const {
    ensureCollectionExists,
} = require('../utils/mongodb-collection-utils');

/**
 * MongoDB-specific Health Check Repository
 *
 * Provides MongoDB-specific database operations for health testing.
 * Uses Mongoose for MongoDB-specific operations (raw access, ping).
 */
class HealthCheckRepositoryMongoDB extends HealthCheckRepositoryInterface {
    constructor() {
        super();
    }

    getDatabaseConnectionState() {
        const stateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting',
        };
        const readyState = mongoose.connection.readyState;

        return {
            readyState,
            stateName: stateMap[readyState],
            isConnected: readyState === 1,
        };
    }

    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping({ maxTimeMS });
        return Date.now() - pingStart;
    }

    async createCredential(credentialData) {
        // Ensure collection exists before creating document
        // This prevents "Cannot create namespace in multi-document transaction" error
        // See: https://github.com/prisma/prisma/issues/8305
        await ensureCollectionExists('Credential');

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
