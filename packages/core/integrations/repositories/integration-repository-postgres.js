const { prisma } = require('../../database/prisma');
const {
    IntegrationRepositoryInterface,
} = require('./integration-repository-interface');

/**
 * PostgreSQL Integration Repository Adapter
 * Handles integration persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses nested relations for foreign keys (user, entities)
 * - IDs are integers with auto-increment
 * - Implicit join tables for many-to-many relationships (_EntityToIntegration)
 * - Uses connect/disconnect syntax for relations
 *
 * Key differences from MongoDB:
 * - user: { connect: { id } } instead of userId: string
 * - entities: { connect: [...] } instead of entityIds: [string]
 */
class IntegrationRepositoryPostgres extends IntegrationRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Find all integrations for a user
     *
     * @param {number} userId - User ID (PostgreSQL integer)
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
     *
     * @param {number} integrationId - Integration ID
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
     *
     * @param {number} id - Integration ID
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
     *
     * @param {number} integrationId - Integration ID
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
     *
     * @param {number} integrationId - Integration ID
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
     *
     * PostgreSQL-specific: Uses nested relations with connect syntax
     *
     * @param {Array<number>} entities - Array of entity IDs (PostgreSQL integers)
     * @param {number} userId - User ID (PostgreSQL integer)
     * @param {Object} config - Integration configuration
     * @returns {Promise<Object>} Created integration object
     */
    async createIntegration(entities, userId, config) {
        const data = {
            config,
            version: '0.0.0',
        };

        // PostgreSQL: use nested relations
        if (userId) {
            data.user = { connect: { id: userId } };
        }
        if (entities && entities.length > 0) {
            data.entities = {
                connect: entities.map((id) => ({ id })),
            };
        }

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
     *
     * @param {number} userId - User ID
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

module.exports = { IntegrationRepositoryPostgres };
