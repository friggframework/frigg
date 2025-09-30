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
 * - MongoDB: Uses native mongoose connection state checking
 * - PostgreSQL: Would use similar Prisma connection state APIs
 * - Both use same query patterns (no many-to-many differences)
 *
 * Migration from Mongoose:
 * - Constructor injection for testing support
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
     * Create a test encryption model
     * @returns {Model} Mongoose model with encryption plugin
     */
    createEncryptionTestModel() {
        const { Encrypt } = require('../../encrypt');

        const testSchema = new mongoose.Schema(
            {
                testSecret: { type: String, lhEncrypt: true },
                normalField: { type: String },
                nestedSecret: {
                    value: { type: String, lhEncrypt: true },
                },
            },
            { timestamps: false }
        );

        testSchema.plugin(Encrypt);

        return (
            mongoose.models.TestEncryption ||
            mongoose.model('TestEncryption', testSchema)
        );
    }

    /**
     * Save a test document to the database
     * @param {Model} TestModel - Mongoose model
     * @param {Object} data - Data to save
     * @returns {Promise<Document>} Saved document
     */
    async saveTestDocument(TestModel, data) {
        const testDoc = new TestModel(data);
        await testDoc.save();
        return testDoc;
    }

    /**
     * Find a test document by ID
     * @param {Model} TestModel - Mongoose model
     * @param {string} id - Document ID
     * @returns {Promise<Document>} Found document
     */
    async findTestDocumentById(TestModel, id) {
        return await TestModel.findById(id);
    }

    /**
     * Get raw document from collection (bypassing Mongoose)
     * Used for verifying encryption at the database level
     * @param {string} collectionName - Collection name
     * @param {Object} filter - Query filter
     * @returns {Promise<Object>} Raw document from database
     */
    async getRawDocumentFromCollection(collectionName, filter) {
        return await mongoose.connection.db
            .collection(collectionName)
            .findOne(filter);
    }

    /**
     * Delete a test document
     * @param {Model} TestModel - Mongoose model
     * @param {string} id - Document ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteTestDocument(TestModel, id) {
        return await TestModel.deleteOne({ _id: id });
    }
}

module.exports = { HealthCheckRepository };
