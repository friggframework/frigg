const { prisma } = require('../prisma');
const { mongoose } = require('../mongoose');
const {
    HealthCheckRepositoryInterface,
} = require('./health-check-repository-interface');

/**
 * Repository for Health Check database operations.
 * Provides atomic database operations for health testing.
 *
 * Follows DDD/Hexagonal Architecture:
 * - Infrastructure Layer (this repository)
 * - Pure database operations only, no business logic
 * - Used by Application Layer (Use Cases)
 *
 * Works identically for both MongoDB and PostgreSQL:
 * - Uses Prisma for database operations
 * - Encryption happens transparently via Prisma extension
 * - Both MongoDB and PostgreSQL use same Prisma API
 *
 * Migration from Mongoose to Prisma:
 * - Replaced Mongoose models with Prisma client
 * - Uses Credential model for encryption testing
 * - Maintains same method signatures for compatibility
 */
class HealthCheckRepository extends HealthCheckRepositoryInterface {
    constructor() {
        super();
    }

    /**
     * Get database connection state
     * @returns {Object} Object with readyState, stateName, and isConnected
     */
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

    /**
     * Ping the database to verify connectivity
     * @param {number} maxTimeMS - Maximum time to wait for ping response
     * @returns {Promise<number>} Response time in milliseconds
     * @throws {Error} If database is not connected or ping fails
     */
    async pingDatabase(maxTimeMS = 2000) {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping({ maxTimeMS });
        return Date.now() - pingStart;
    }

    /**
     * Create a test credential for encryption testing
     * @param {Object} credentialData - Credential data to create
     * @returns {Promise<Object>} Created credential
     */
    async createCredential(credentialData) {
        return await prisma.credential.create({
            data: credentialData,
        });
    }

    /**
     * Find a credential by ID
     * @param {string} id - Credential ID
     * @returns {Promise<Object|null>} Found credential or null
     */
    async findCredentialById(id) {
        return await prisma.credential.findUnique({
            where: { id },
        });
    }

    /**
     * Get raw credential from database bypassing Prisma encryption extension
     * @param {string} id - Credential ID
     * @returns {Promise<Object|null>} Raw credential from database
     */
    async getRawCredentialById(id) {
        return await mongoose.connection.db
            .collection('credentials')
            .findOne({ _id: id });
    }

    /**
     * Delete a credential by ID
     * @param {string} id - Credential ID
     * @returns {Promise<void>}
     */
    async deleteCredential(id) {
        await prisma.credential.delete({
            where: { id },
        });
    }
}

module.exports = { HealthCheckRepository };
