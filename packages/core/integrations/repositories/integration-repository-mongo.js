const { prisma } = require('../../database/prisma');
const {
    IntegrationRepositoryInterface,
} = require('./integration-repository-interface');

/**
 * MongoDB Integration Repository Adapter
 * Handles integration persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - Uses scalar fields for relations (userId, entityIds)
 * - IDs are strings with @db.ObjectId
 * - Arrays used for many-to-many relationships
 *
 * Migration from Mongoose:
 * - Constructor injection of Prisma client
 * - populate() → include in Prisma queries
 * - lean: true → No longer needed (Prisma returns plain objects)
 * - toString() conversions → Done automatically by Prisma
 */
class IntegrationRepositoryMongo extends IntegrationRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Find all integrations for a user
     * Replaces: IntegrationModel.find({ user: userId }).populate('entities')
     *
     * @param {string} userId - User ID (MongoDB ObjectId as string)
     * @returns {Promise<Array>} Array of integration objects
     */
    async findIntegrationsByUserId(userId) {
        const integrations = await this.prisma.integration.findMany({
            where: { userId },
            include: {
                entities: true,
            },
        });

        // Map to domain objects (maintains same API)
        return integrations.map((integration) => ({
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        }));
    }

    /**
     * Delete integration by ID
     * Replaces: IntegrationModel.deleteOne({ _id: integrationId })
     *
     * @param {string} integrationId - Integration ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteIntegrationById(integrationId) {
        await this.prisma.integration.delete({
            where: { id: integrationId },
        });

        // Return Mongoose-compatible result
        return { acknowledged: true, deletedCount: 1 };
    }

    /**
     * Find integration by name
     * Replaces: IntegrationModel.findOne({ 'config.type': name }).populate('entities')
     *
     * @param {string} name - Integration type name
     * @returns {Promise<Object>} Integration object
     */
    async findIntegrationByName(name) {
        const integration = await this.prisma.integration.findFirst({
            where: {
                config: {
                    path: ['type'],
                    equals: name,
                },
            },
            include: {
                entities: true,
            },
        });

        if (!integration) {
            throw new Error(`Integration with name ${name} not found`);
        }

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    /**
     * Find integration by ID
     * Replaces: IntegrationModel.findById(id).populate('entities')
     *
     * @param {string} id - Integration ID
     * @returns {Promise<Object>} Integration object
     */
    async findIntegrationById(id) {
        const integration = await this.prisma.integration.findUnique({
            where: { id },
            include: {
                entities: true,
            },
        });

        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    /**
     * Update integration status
     * Replaces: IntegrationModel.updateOne({ _id: integrationId }, { status })
     *
     * @param {string} integrationId - Integration ID
     * @param {string} status - New status
     * @returns {Promise<boolean>} Success indicator
     */
    async updateIntegrationStatus(integrationId, status) {
        await this.prisma.integration.update({
            where: { id: integrationId },
            data: { status },
        });

        return true; // Mongoose compatibility
    }

    /**
     * Update integration messages
     * Replaces: IntegrationModel.updateOne with $push operator
     *
     * @param {string} integrationId - Integration ID
     * @param {string} messageType - Type of message (errors, warnings, info, logs)
     * @param {string} messageTitle - Message title
     * @param {string} messageBody - Message body
     * @param {Date} messageTimestamp - Message timestamp
     * @returns {Promise<boolean>} Success indicator
     */
    async updateIntegrationMessages(
        integrationId,
        messageType,
        messageTitle,
        messageBody,
        messageTimestamp
    ) {
        // Get current integration
        const integration = await this.prisma.integration.findUnique({
            where: { id: integrationId },
        });

        if (!integration) {
            throw new Error(`Integration ${integrationId} not found`);
        }

        // Parse existing messages (JSON field)
        const messages = integration.messages || {};
        const messageArray = Array.isArray(messages[messageType])
            ? messages[messageType]
            : [];

        // Add new message
        messageArray.push({
            title: messageTitle,
            message: messageBody,
            timestamp: messageTimestamp,
        });

        // Update messages
        await this.prisma.integration.update({
            where: { id: integrationId },
            data: {
                [messageType]: messageArray,
            },
        });

        return true; // Mongoose compatibility
    }

    /**
     * Create a new integration
     * Replaces: IntegrationModel.create({ entities, user, config })
     *
     * MongoDB-specific: Uses scalar fields for relations
     *
     * @param {Array<string>} entities - Array of entity IDs (MongoDB ObjectIds)
     * @param {string} userId - User ID (MongoDB ObjectId)
     * @param {Object} config - Integration configuration
     * @returns {Promise<Object>} Created integration object
     */
    async createIntegration(entities, userId, config) {
        const data = {
            config,
            version: '0.0.0',
            userId: userId,
            entityIds: entities,
        };

        const integration = await this.prisma.integration.create({
            data,
            include: {
                entities: true,
            },
        });

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    /**
     * Find integration by user ID (returns single integration)
     * Replaces: IntegrationModel.findOne({ user: userId }).populate('entities')
     *
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Integration object or null
     */
    async findIntegrationByUserId(userId) {
        const integration = await this.prisma.integration.findFirst({
            where: { userId },
            include: {
                entities: true,
            },
        });

        if (!integration) {
            return null;
        }

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }
}

module.exports = { IntegrationRepositoryMongo };
