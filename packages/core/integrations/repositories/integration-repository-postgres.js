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
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 * - Implicit join tables for many-to-many relationships (_EntityToIntegration)
 * - Uses connect/disconnect syntax for relations
 */
class IntegrationRepositoryPostgres extends IntegrationRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert integration object IDs to strings
     * @private
     * @param {Object|null} integration - Integration object from database
     * @returns {Object|null} Integration with string IDs
     */
    _convertIntegrationIds(integration) {
        if (!integration) return integration;
        return {
            ...integration,
            id: integration.id?.toString(),
            userId: integration.userId?.toString(),
            entities: integration.entities?.map(e => ({
                ...e,
                id: e.id?.toString(),
                userId: e.userId?.toString(),
                credentialId: e.credentialId?.toString()
            }))
        };
    }

    /**
     * Find all integrations for a user
     *
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Array>} Array of integration objects with string IDs
     */
    async findIntegrationsByUserId(userId) {
        const intUserId = this._convertId(userId);
        const integrations = await this.prisma.integration.findMany({
            where: { userId: intUserId },
            include: {
                entities: true,
            },
        });

        // Map to domain objects with string IDs
        return integrations.map((integration) => {
            const converted = this._convertIntegrationIds(integration);
            return {
                id: converted.id,
                entitiesIds: converted.entities.map((e) => e.id),
                userId: converted.userId,
                config: converted.config,
                version: converted.version,
                status: converted.status,
                messages: converted.messages,
            };
        });
    }

    /**
     * Delete integration by ID
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @returns {Promise<Object>} Deletion result
     */
    async deleteIntegrationById(integrationId) {
        const intId = this._convertId(integrationId);
        await this.prisma.integration.delete({
            where: { id: intId },
        });

        // Return Mongoose-compatible result
        return { acknowledged: true, deletedCount: 1 };
    }

    /**
     * Find integration by name
     *
     * @param {string} name - Integration type name
     * @returns {Promise<Object>} Integration object with string IDs
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

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    /**
     * Find integration by ID
     *
     * @param {string} id - Integration ID (string from application layer)
     * @returns {Promise<Object>} Integration object with string IDs
     */
    async findIntegrationById(id) {
        const intId = this._convertId(id);
        const integration = await this.prisma.integration.findUnique({
            where: { id: intId },
            include: {
                entities: true,
            },
        });

        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    /**
     * Update integration status
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {string} status - New status
     * @returns {Promise<boolean>} Success indicator
     */
    async updateIntegrationStatus(integrationId, status) {
        const intId = this._convertId(integrationId);
        await this.prisma.integration.update({
            where: { id: intId },
            data: { status },
        });

        return true; // Mongoose compatibility
    }

    /**
     * Update integration messages
     *
     * @param {string} integrationId - Integration ID (string from application layer)
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
        const intId = this._convertId(integrationId);

        // Get current integration
        const integration = await this.prisma.integration.findUnique({
            where: { id: intId },
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
            where: { id: intId },
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
     * @param {Array<string>} entities - Array of entity IDs (strings from application layer)
     * @param {string} userId - User ID (string from application layer)
     * @param {Object} config - Integration configuration
     * @returns {Promise<Object>} Created integration object with string IDs
     */
    async createIntegration(entities, userId, config) {
        const data = {
            config,
            version: '0.0.0',
        };

        // PostgreSQL: use nested relations with ID conversion
        if (userId) {
            data.user = { connect: { id: this._convertId(userId) } };
        }
        if (entities && entities.length > 0) {
            data.entities = {
                connect: entities.map((id) => ({ id: this._convertId(id) })),
            };
        }

        const integration = await this.prisma.integration.create({
            data,
            include: {
                entities: true,
            },
        });

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    /**
     * Find integration by user ID (returns single integration)
     *
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Object|null>} Integration object with string IDs or null
     */
    async findIntegrationByUserId(userId) {
        const intUserId = this._convertId(userId);
        const integration = await this.prisma.integration.findFirst({
            where: { userId: intUserId },
            include: {
                entities: true,
            },
        });

        if (!integration) {
            return null;
        }

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }
}

module.exports = { IntegrationRepositoryPostgres };
