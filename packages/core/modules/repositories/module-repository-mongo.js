const { prisma } = require('../../database/prisma');
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

        const validIds = credentialIds.filter(
            (id) => id !== null && id !== undefined
        );

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

        return {
            id: entity.id,
            accountId: entity.accountId,
            credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
        };
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

        const credentialIds = entities
            .map((e) => e.credentialId)
            .filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => ({
            id: e.id,
            accountId: e.accountId,
            credential: credentialMap.get(e.credentialId) || null,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
        }));
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

        const credentialIds = entities
            .map((e) => e.credentialId)
            .filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => ({
            id: e.id,
            accountId: e.accountId,
            credential: credentialMap.get(e.credentialId) || null,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
        }));
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

        const credentialIds = entities
            .map((e) => e.credentialId)
            .filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e) => ({
            id: e.id,
            accountId: e.accountId,
            credential: credentialMap.get(e.credentialId) || null,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
        }));
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

        return {
            id: entity.id,
            accountId: entity.accountId,
            credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
            isGlobal: entity.isGlobal,
        };
    }

    /**
     * Find entities matching filter criteria
     * @param {Object} filter - Filter criteria (e.g., { isGlobal: true, moduleName: 'api-name' })
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesBy(filter) {
        const where = this._convertFilterToWhere(filter);
        const entities = await this.prisma.entity.findMany({
            where,
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id,
            accountId: e.accountId,
            credential: e.credential,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            type: e.subType,
            moduleName: e.moduleName,
            isGlobal: e.isGlobal,
        }));
    }

    /**
     * Create a new entity
     * Replaces: Entity.create(entityData)
     *
     * @param {Object} entityData - Entity data
     * @returns {Promise<Object>} Created entity object with string IDs
     */
    async createEntity(entityData) {
        const isGlobal = entityData.isGlobal || false;

        const data = {
            userId: isGlobal ? null : entityData.user || entityData.userId,
            credentialId: entityData.credential || entityData.credentialId,
            name: entityData.name,
            moduleName: entityData.moduleName,
            externalId: entityData.externalId,
            accountId: entityData.accountId,
            isGlobal,
        };

        const entity = await this.prisma.entity.create({
            data,
        });

        const credential = await this._fetchCredential(entity.credentialId);

        return {
            id: entity.id,
            accountId: entity.accountId,
            credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
            isGlobal: entity.isGlobal,
        };
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
        const data = {};
        if (updates.user !== undefined) data.userId = updates.user;
        if (updates.userId !== undefined) data.userId = updates.userId;
        if (updates.credential !== undefined)
            data.credentialId = updates.credential;
        if (updates.credentialId !== undefined)
            data.credentialId = updates.credentialId;
        if (updates.name !== undefined) data.name = updates.name;
        if (updates.moduleName !== undefined)
            data.moduleName = updates.moduleName;
        if (updates.externalId !== undefined)
            data.externalId = updates.externalId;
        if (updates.accountId !== undefined) data.accountId = updates.accountId;

        try {
            const entity = await this.prisma.entity.update({
                where: { id: entityId },
                data,
            });

            const credential = await this._fetchCredential(entity.credentialId);

            return {
                id: entity.id,
                accountId: entity.accountId,
                credential,
                userId: entity.userId,
                name: entity.name,
                externalId: entity.externalId,
                moduleName: entity.moduleName,
            };
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
        if (filter.externalId)
            where.externalId = this._toString(filter.externalId);
        if (filter.isGlobal !== undefined) where.isGlobal = filter.isGlobal;

        return where;
    }
}

module.exports = { ModuleRepositoryMongo };
