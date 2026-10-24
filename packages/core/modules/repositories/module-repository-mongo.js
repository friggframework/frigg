const { prisma } = require('../../database/prisma');
const { organizationWhere } = require('../../database/organization-where');
const { ModuleRepositoryInterface } = require('./module-repository-interface');

/**
 * MongoDB Module Repository Adapter
 * Handles Entity model operations for external service entities with MongoDB
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (ObjectId)
 * - No ID conversion needed (IDs are already strings)
 *
 * Prisma Migration Notes:
 * - Mongoose discriminator (__t) → moduleName field (module type: salesforce, hubspot, etc.)
 */
class ModuleRepositoryMongo extends ModuleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Convert any value to string (handles null/undefined)
     * @private
     * @param {*} value - Value to convert
     * @returns {string|null|undefined} String value or null/undefined
     */
    _toString(value) {
        if (value === null || value === undefined) return value;
        return String(value);
    }

    /**
     * Fetch credential by ID separately to ensure encryption extension processes it
     * This fixes the bug where credentials fetched via include bypass decryption
     * @private
     * @param {string|null|undefined} credentialId - Credential ID
     * @returns {Promise<Object|null>} Decrypted credential or null
     */
    async _fetchCredential(credentialId) {
        if (!credentialId) return null;

        const credential = await this.prisma.credential.findUnique({
            where: { id: credentialId },
        });

        return credential;
    }

    /**
     * Fetch multiple credentials in bulk separately to ensure decryption
     * More efficient than fetching one-by-one for arrays of entities
     * @private
     * @param {Array<string>} credentialIds - Array of credential IDs
     * @returns {Promise<Map<string, Object>>} Map of credentialId -> credential object
     */
    async _fetchCredentialsBulk(credentialIds) {
        if (!credentialIds || credentialIds.length === 0) {
            return new Map();
        }

        const validIds = credentialIds.filter(id => id !== null && id !== undefined);

        if (validIds.length === 0) {
            return new Map();
        }

        const credentials = await this.prisma.credential.findMany({
            where: { id: { in: validIds } },
        });

        const credentialMap = new Map();
        for (const credential of credentials) {
            credentialMap.set(credential.id, credential);
        }

        return credentialMap;
    }

    /**
     * The one place a stored entity row becomes the entity the application sees.
     * The provider's `data` is spread FIRST and every column is pinned after it:
     * a stored `id`, `userId` or `organizationId` in `data` must not decide who
     * owns the entity or who sees it.
     * @private
     */
    _mapEntity(row, credential) {
        return {
            ...(row.data || {}),
            id: row.id,
            credential,
            userId: row.userId,
            name: row.name,
            externalId: row.externalId,
            moduleName: row.moduleName,
            organizationId: row.organizationId ?? null,
        };
    }

    /**
     * Find entity by ID with credential
     * Replaces: Entity.findById(entityId).populate('credential')
     *
     * @param {string} entityId - Entity ID
     * @returns {Promise<Object>} Entity object with string IDs
     * @throws {Error} If entity not found
     */
    async findEntityById(entityId) {
        const entity = await this.prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const credential = await this._fetchCredential(entity.credentialId);

        return this._mapEntity(entity, credential);
    }

    /**
     * Find all entities for a user
     * Replaces: Entity.find({ user: userId }).populate('credential')
     *
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByUserId(userId) {
        const entities = await this.prisma.entity.findMany({
            where: { userId },
        });

        const credentialIds = entities.map(e => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => (this._mapEntity(e, credentialMap.get(e.credentialId) || null)));
    }

    /**
     * Find entities by array of IDs
     * Replaces: Entity.find({ _id: { $in: entitiesIds } }).populate('credential')
     *
     * @param {Array<string>} entitiesIds - Array of entity IDs
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByIds(entitiesIds) {
        const entities = await this.prisma.entity.findMany({
            where: { id: { in: entitiesIds } },
        });

        const credentialIds = entities.map(e => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => (this._mapEntity(e, credentialMap.get(e.credentialId) || null)));
    }

    /**
     * Find entities by user ID and module name
     * Replaces: Entity.find({ user: userId, moduleName: moduleName }).populate('credential')
     *
     * @param {string} userId - User ID
     * @param {string} moduleName - Module name
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        const entities = await this.prisma.entity.findMany({
            where: {
                userId,
                moduleName,
            },
        });

        const credentialIds = entities.map(e => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => (this._mapEntity(e, credentialMap.get(e.credentialId) || null)));
    }

    /**
     * Find entities matching any of the owner/organization pairs, in one query.
     * `organizationId: null` matches rows with no organization. The caller
     * (a use case) decides which pairs; this only runs them.
     *
     * @param {Array<{userId: string, organizationId: (string|null)}>} clauses
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByOwnership(clauses) {
        if (!Array.isArray(clauses) || clauses.length === 0) return [];
        const entities = await this.prisma.entity.findMany({
            where: {
                OR: clauses.map(({ userId, organizationId }) => ({
                    userId,
                    ...organizationWhere(organizationId),
                })),
            },
        });

        const credentialIds = entities.map(e => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => (this._mapEntity(e, credentialMap.get(e.credentialId) || null)));
    }

    /**
     * Remove credential reference from entity
     * Replaces: Entity.updateOne({ _id: entityId }, { $unset: { credential: "" } })
     *
     * @param {string} entityId - Entity ID
     * @returns {Promise<boolean>} Success indicator
     */
    async unsetCredential(entityId) {
        await this.prisma.entity.update({
            where: { id: entityId },
            data: { credentialId: null },
        });

        return true;
    }

    /**
     * Find entity by filter criteria
     * Replaces: Entity.findOne(filter).populate('credential')
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} Entity object with string IDs or null
     */
    async findEntity(filter) {
        const where = this._convertFilterToWhere(filter);
        const entity = await this.prisma.entity.findFirst({
            where,
        });

        if (!entity) {
            return null;
        }

        const credential = await this._fetchCredential(entity.credentialId);

        return this._mapEntity(entity, credential);
    }

    /**
     * Find all entities matching a filter.
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of entity objects with string IDs (empty if no match)
     */
    async findEntities(filter) {
        const where = this._convertFilterToWhere(filter);
        const entities = await this.prisma.entity.findMany({
            where,
        });

        const credentialIds = entities
            .map((e) => e.credentialId)
            .filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => (this._mapEntity(e, credentialMap.get(e.credentialId) || null)));
    }

    /**
     * Create a new entity
     * Replaces: Entity.create(entityData)
     *
     * @param {Object} entityData - Entity data
     * @param {{organizationId?: (string|null)}} [tenancy] - the organization the entity
     *   belongs to (ADR-056 §3.6). A separate argument, not a field of `entityData`,
     *   because `entityData` carries provider fields and one named `organizationId`
     *   must not be taken for ours.
     * @returns {Promise<Object>} Created entity object with string IDs
     */
    async createEntity(entityData, tenancy = {}) {
        const {
            user,
            userId,
            credential,
            credentialId,
            name,
            moduleName,
            externalId,
            ...dynamicData
        } = entityData;

        const data = {
            userId: userId || user,
            credentialId: credentialId || credential,
            name,
            moduleName,
            externalId,
            organizationId: tenancy.organizationId ?? null,
            data: dynamicData,
        };

        const entity = await this.prisma.entity.create({
            data,
        });

        const credentialObj = await this._fetchCredential(entity.credentialId);

        return this._mapEntity(entity, credentialObj);
    }

    /**
     * Update an entity by ID
     * Replaces: Entity.findByIdAndUpdate(entityId, updates, { new: true })
     *
     * @param {string} entityId - Entity ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated entity object with string IDs or null if not found
     */
    async updateEntity(entityId, updates) {
        const existing = await this.prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!existing) {
            return null;
        }

        const {
            user,
            userId,
            credential,
            credentialId,
            name,
            moduleName,
            externalId,
            ...dynamicData
        } = updates;

        const schemaUpdates = {};
        if (user !== undefined || userId !== undefined) {
            schemaUpdates.userId = userId || user;
        }
        if (credential !== undefined || credentialId !== undefined) {
            schemaUpdates.credentialId = credentialId || credential;
        }
        if (name !== undefined) schemaUpdates.name = name;
        if (moduleName !== undefined) schemaUpdates.moduleName = moduleName;
        if (externalId !== undefined) schemaUpdates.externalId = externalId;

        if (Object.keys(dynamicData).length > 0) {
            schemaUpdates.data = { ...(existing.data || {}), ...dynamicData };
        }

        try {
            const entity = await this.prisma.entity.update({
                where: { id: entityId },
                data: schemaUpdates,
            });

            const credentialObj = await this._fetchCredential(entity.credentialId);

            return this._mapEntity(entity, credentialObj);
        } catch (error) {
            if (error.code === 'P2025') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Delete an entity by ID
     * Replaces: Entity.deleteOne({ _id: entityId })
     *
     * @param {string} entityId - Entity ID to delete
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async deleteEntity(entityId) {
        try {
            await this.prisma.entity.delete({
                where: { id: entityId },
            });
            return true;
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return false;
            }
            throw error;
        }
    }

    /**
     * Convert Mongoose-style filter to Prisma where clause
     * @private
     * @param {Object} filter - Mongoose filter
     * @returns {Object} Prisma where clause
     */
    _convertFilterToWhere(filter) {
        const where = {};

        // Handle _id field (Mongoose uses _id, Prisma uses id)
        if (filter._id) {
            where.id = filter._id;
        }

        // Handle user field (Mongoose uses user, Prisma uses userId)
        if (filter.user) {
            where.userId = filter.user;
        }

        // Handle credential field (Mongoose uses credential, Prisma uses credentialId)
        if (filter.credential) {
            where.credentialId = filter.credential;
        }

        // Copy other fields directly
        if (filter.id) where.id = filter.id;
        if (filter.userId) where.userId = filter.userId;
        if (filter.credentialId) where.credentialId = filter.credentialId;
        if (filter.name) where.name = filter.name;
        if (filter.moduleName) where.moduleName = filter.moduleName;
        if (filter.externalId) where.externalId = this._toString(filter.externalId);

        // `null` means "no organization"; absent means "any".
        if (filter.organizationId !== undefined) {
            Object.assign(where, organizationWhere(filter.organizationId));
        }

        return where;
    }
}

module.exports = { ModuleRepositoryMongo };
