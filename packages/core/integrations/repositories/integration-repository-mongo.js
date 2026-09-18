const { prisma } = require('../../database/prisma');
const {
    IntegrationRepositoryInterface,
} = require('./integration-repository-interface');
const { validateConfigPatch } = require('./config-patch-shared');

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
    constructor() {
        super();
        this.prisma = prisma;
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
            createdAt: integration.createdAt,
        }));
    }

    /**
     * Find integrations, optionally filtered by config type and/or status.
     *
     * @param {Object} [filter={}]
     * @param {string} [filter.type] - Integration type (config.type)
     * @param {string} [filter.status] - Integration status
     * @returns {Promise<Array>} Array of integration objects (possibly empty)
     */
    async findIntegrations({ type, status } = {}) {
        const where = {};
        if (type) {
            where.config = { path: ['type'], equals: type };
        }
        if (status) {
            where.status = status;
        }

        const integrations = await this.prisma.integration.findMany({
            where,
            include: {
                entities: true,
            },
        });

        return integrations.map((integration) => ({
            id: integration.id,
            entitiesIds: integration.entities.map((e) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
            createdAt: integration.createdAt,
        }));
    }

    /**
     * Find every integration in a report-shaped projection.
     *
     * type lives in config.type (a JSON path not portably groupable across
     * DBs); it is left in the row for the caller to bucket.
     *
     * @param {Object} [filter={}]
     * @param {string} [filter.status] - Integration status
     * @param {string} [filter.userId] - Owning user ID (ObjectId as string)
     * @returns {Promise<Array>} Report-shaped integration rows
     */
    async findAllForReport({ status, userId } = {}) {
        const where = {};
        if (status) where.status = status;
        if (userId !== undefined && userId !== null) where.userId = userId;

        const integrations = await this.prisma.integration.findMany({
            where,
            include: { entities: { select: { id: true } } },
        });

        return integrations.map((integration) => ({
            id: integration.id,
            type: integration.config?.type ?? null,
            status: integration.status ?? null,
            userId: integration.userId ?? null,
            version: integration.version ?? null,
            errorCount: Array.isArray(integration.errors)
                ? integration.errors.length
                : 0,
            moduleCount: integration.entities?.length ?? 0,
            createdAt: integration.createdAt ?? null,
            updatedAt: integration.updatedAt ?? null,
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
     * Find all integrations whose entity set includes the given entity ID.
     *
     * @param {string} entityId - Entity ID (MongoDB ObjectId as string)
     * @returns {Promise<Array>} Array of integration objects (possibly empty)
     */
    async findIntegrationsByEntityId(entityId) {
        const integrations = await this.prisma.integration.findMany({
            where: {
                entityIds: { has: entityId },
            },
            include: {
                entities: true,
            },
        });

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

    /**
     * Update integration configuration
     * Replaces: IntegrationModel.updateOne({ _id: integrationId }, { config })
     *
     * @param {string} integrationId - Integration ID (MongoDB ObjectId as string)
     * @param {Object} config - Updated configuration object
     * @returns {Promise<Object>} Updated integration object
     */
    async updateIntegrationConfig(integrationId, config) {
        if (config === null || config === undefined) {
            throw new Error('Config parameter is required');
        }

        const integration = await this.prisma.integration.update({
            where: { id: integrationId },
            data: { config },
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
     * Atomically merge a patch into the existing config via findAndModify,
     * so the write and the post-write read happen in one server-side round
     * trip with no JS-side read-modify-write to race on. entityIds is a
     * scalar array directly on the Integration document in Mongo, so the
     * raw document already carries everything needed to shape the return
     * value — no follow-up findUnique.
     *
     * @param {string} integrationId - Integration ID
     * @param {Object} patch - Keys to merge into the existing config
     * @returns {Promise<Object>} Updated integration object
     */
    async patchIntegrationConfig(integrationId, patch) {
        validateConfigPatch(patch);

        const $set = {};
        for (const [key, value] of Object.entries(patch)) {
            $set[`config.${key}`] = value;
        }
        $set.updatedAt = new Date();

        const result = await this.prisma.$runCommandRaw({
            findAndModify: 'Integration',
            query: { _id: { $oid: integrationId } },
            update: { $set },
            new: true,
        });

        const doc = result && result.value;
        if (!doc) {
            throw new Error(`Integration with id ${integrationId} not found`);
        }

        return {
            id: doc._id.$oid ?? doc._id,
            entitiesIds: (doc.entityIds || []).map(
                (entityId) => entityId.$oid ?? entityId
            ),
            userId: doc.userId?.$oid ?? doc.userId ?? null,
            config: doc.config,
            version: doc.version,
            status: doc.status,
            messages: doc.messages,
        };
    }
}

module.exports = { IntegrationRepositoryMongo };
