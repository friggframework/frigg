const { prisma } = require('../../database/prisma');
const {
    IntegrationRepositoryInterface,
} = require('./integration-repository-interface');
const { validateConfigPatch } = require('./config-patch-shared');
const { MESSAGE_TYPES, messagesOfType } = require('./message-item-shared');
const { strictIntId } = require('./report-id');

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
    constructor() {
        super();
        this.prisma = prisma;
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
                createdAt: converted.createdAt,
            };
        });
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
                createdAt: converted.createdAt,
            };
        });
    }

    /**
     * Find every integration in a report-shaped projection.
     *
     * type lives in config.type (a JSON path not portably groupable across
     * DBs); it is left in the row for the caller to bucket.
     *
     * @param {Object} [filter={}]
     * @param {string} [filter.status] - Integration status
     * @param {string|number} [filter.userId] - Owning user ID
     * @returns {Promise<Array>} Report-shaped integration rows
     */
    async findAllForReport({ status, userId } = {}) {
        const where = {};
        if (status) where.status = status;
        if (userId !== undefined && userId !== null) {
            // Strict: parseInt would coerce '12abc'/'12.9' to 12 and read the wrong user.
            where.userId = strictIntId(userId);
        }

        const integrations = await this.prisma.integration.findMany({
            where,
            include: { entities: { select: { id: true } } },
        });

        return integrations.map((integration) => ({
            id: integration.id?.toString(),
            type: integration.config?.type ?? null,
            status: integration.status ?? null,
            userId: integration.userId?.toString() ?? null,
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
     * @param {Object} item - Message item, stored as it is
     * @param {Object} options
     * @param {number} options.keepLast - How many of the newest items of the type to keep
     * @returns {Promise<boolean>} Success indicator
     */
    async updateIntegrationMessages(
        integrationId,
        messageType,
        item,
        { keepLast }
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
        const messageArray = messagesOfType(integration, messageType);

        // Add new message
        messageArray.push(item);

        // Update messages
        await this.prisma.integration.update({
            where: { id: intId },
            data: {
                [messageType]: messageArray.slice(-keepLast),
            },
        });

        return true; // Mongoose compatibility
    }

    /**
     * Find the stored messages of one type
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {string} messageType - Type of message (errors, warnings, info, logs)
     * @returns {Promise<Array>} The stored message items of that type, oldest first
     */
    async findIntegrationMessages(integrationId, messageType) {
        const intId = this._convertId(integrationId);
        const integration = await this.prisma.integration.findUnique({
            where: { id: intId },
            select: { [messageType]: true },
        });

        if (!integration) {
            throw new Error(`Integration ${integrationId} not found`);
        }

        return messagesOfType(integration, messageType);
    }

    /**
     * Append a rate-limit message item unless the same limit is stored.
     * One UPDATE with a NOT EXISTS guard. A concurrent UPDATE of the row
     * waits for the row lock and then evaluates the guard again on the new
     * row, so concurrent workers store one item. retryAt values are ISO UTC
     * strings, so a byte-wise (COLLATE "C") comparison orders them by time.
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {string} messageType - Type of message (errors, warnings, info, logs)
     * @param {Object} item - Message item with `code`, `module` and an ISO UTC `retryAt`
     * @param {Object} options
     * @param {string} options.retryAtFrom - ISO UTC start of the window, inclusive
     * @param {string} options.retryAtTo - ISO UTC end of the window, inclusive
     * @param {number} options.keepLast - How many of the newest items of the type to keep
     * @returns {Promise<boolean>} True when it appended the item
     */
    async appendRateLimitMessage(
        integrationId,
        messageType,
        item,
        { retryAtFrom, retryAtTo, keepLast }
    ) {
        if (!MESSAGE_TYPES.includes(messageType)) {
            throw new Error(`Unknown message type: ${messageType}`);
        }
        const column = `"${messageType}"`;
        const stored = `(CASE WHEN jsonb_typeof(${column}) = 'array' THEN ${column} ELSE '[]'::jsonb END)`;
        const sql = `
            UPDATE "Integration"
            SET ${column} = (
                SELECT COALESCE(jsonb_agg(elem ORDER BY idx), '[]'::jsonb)
                FROM jsonb_array_elements(${stored} || jsonb_build_array($1::jsonb))
                    WITH ORDINALITY AS t(elem, idx)
                WHERE idx > jsonb_array_length(${stored}) + 1 - $2::int
            ),
            "updatedAt" = NOW()
            WHERE "id" = $3
            AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(${stored}) AS kept(elem)
                WHERE kept.elem ->> 'code' = $4
                AND kept.elem ->> 'module' = $5
                AND (kept.elem ->> 'retryAt') COLLATE "C" BETWEEN $6 AND $7
            )
            RETURNING "id"
        `;
        const rows = await this.prisma.$queryRawUnsafe(
            sql,
            JSON.stringify(item),
            keepLast,
            this._convertId(integrationId),
            item.code,
            item.module,
            retryAtFrom,
            retryAtTo
        );
        return rows.length === 1;
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
     * Attach entities to an existing integration. Entities already attached
     * are left as they are.
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {Array<string>} entityIds - Entity IDs to attach
     * @returns {Promise<Object|null>} Updated integration, or null when the integration does not exist
     */
    async addEntitiesToIntegration(integrationId, entityIds) {
        const intId = this._convertId(integrationId);

        try {
            await this.prisma.integration.update({
                where: { id: intId },
                data: {
                    entities: {
                        connect: entityIds.map((id) => ({
                            id: this._convertId(id),
                        })),
                    },
                },
            });
        } catch (error) {
            if (error.code === 'P2025') return null;
            throw error;
        }
        return this.findIntegrationById(integrationId);
    }

    /**
     * Detach entities from an integration. Entities that are not attached
     * are ignored. The entities themselves are not deleted.
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {Array<string>} entityIds - Entity IDs to detach
     * @returns {Promise<Object|null>} Updated integration, or null when the integration does not exist
     */
    async removeEntitiesFromIntegration(integrationId, entityIds) {
        const intId = this._convertId(integrationId);

        try {
            await this.prisma.integration.update({
                where: { id: intId },
                data: {
                    entities: {
                        disconnect: entityIds.map((id) => ({
                            id: this._convertId(id),
                        })),
                    },
                },
            });
        } catch (error) {
            if (error.code === 'P2025') return null;
            throw error;
        }
        return this.findIntegrationById(integrationId);
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

    /**
     * Update integration configuration
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {Object} config - Updated configuration object
     * @returns {Promise<Object>} Updated integration object with string IDs
     */
    async updateIntegrationConfig(integrationId, config) {
        if (config === null || config === undefined) {
            throw new Error('Config parameter is required');
        }

        const intId = this._convertId(integrationId);
        const integration = await this.prisma.integration.update({
            where: { id: intId },
            data: { config },
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
     * Atomically merge a patch into the existing config with a single
     * jsonb concatenation — the database does the merge, so there is no
     * JS-side read-modify-write for concurrent callers to race on.
     *
     * @param {string} integrationId - Integration ID (string from application layer)
     * @param {Object} patch - Keys to merge into the existing config
     * @returns {Promise<Object>} Updated integration object with string IDs
     */
    async patchIntegrationConfig(integrationId, patch) {
        validateConfigPatch(patch);

        const intId = this._convertId(integrationId);
        const affectedCount = await this.prisma.$executeRawUnsafe(
            'UPDATE "Integration" SET "config" = COALESCE("config", \'{}\'::jsonb) || $1::jsonb, "updatedAt" = NOW() WHERE "id" = $2',
            JSON.stringify(patch),
            intId
        );

        if (!affectedCount) {
            throw new Error(`Integration with id ${integrationId} not found`);
        }

        return this.findIntegrationById(integrationId);
    }

    /**
     * Find all integrations whose entity set includes the given entity ID.
     *
     * @param {string|number} entityId - Entity ID (string from application layer)
     * @returns {Promise<Array>} Array of integration objects with string IDs (possibly empty)
     */
    async findIntegrationsByEntityId(entityId) {
        const intEntityId = this._convertId(entityId);
        const integrations = await this.prisma.integration.findMany({
            where: {
                entities: {
                    some: { id: intEntityId },
                },
            },
            include: {
                entities: true,
            },
        });

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
}

module.exports = { IntegrationRepositoryPostgres };
