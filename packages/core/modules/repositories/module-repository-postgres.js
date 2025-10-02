const { prisma } = require('../../database/prisma');
const { ModuleRepositoryInterface } = require('./module-repository-interface');

/**
 * PostgreSQL Module Repository Adapter
 * Handles Entity model operations for external service entities with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class ModuleRepositoryPostgres extends ModuleRepositoryInterface {
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
     * Convert credential object IDs to strings
     * @private
     * @param {Object|null} credential - Credential object from database
     * @returns {Object|null} Credential with string IDs
     */
    _convertCredentialIds(credential) {
        if (!credential) return credential;
        return {
            ...credential,
            id: credential.id?.toString(),
            userId: credential.userId?.toString(),
        };
    }

    /**
     * Find entity by ID with credential
     * Replaces: Entity.findById(entityId).populate('credential')
     *
     * @param {string} entityId - Entity ID (string from application layer)
     * @returns {Promise<Object>} Entity object with string IDs
     * @throws {Error} If entity not found
     */
    async findEntityById(entityId) {
        const intId = this._convertId(entityId);
        const entity = await this.prisma.entity.findUnique({
            where: { id: intId },
            include: { credential: true },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        return {
            id: entity.id.toString(),
            accountId: entity.accountId,
            credential: this._convertCredentialIds(entity.credential),
            userId: entity.userId?.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.subType,
            moduleName: entity.moduleName,
        };
    }

    /**
     * Find all entities for a user
     * Replaces: Entity.find({ user: userId }).populate('credential')
     *
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByUserId(userId) {
        const intUserId = this._convertId(userId);
        const entities = await this.prisma.entity.findMany({
            where: { userId: intUserId },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id.toString(),
            accountId: e.accountId,
            credential: this._convertCredentialIds(e.credential),
            userId: e.userId?.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.subType,
            moduleName: e.moduleName,
        }));
    }

    /**
     * Find entities by array of IDs
     * Replaces: Entity.find({ _id: { $in: entitiesIds } }).populate('credential')
     *
     * @param {Array<string>} entitiesIds - Array of entity IDs (strings from application layer)
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByIds(entitiesIds) {
        const intIds = entitiesIds.map((id) => this._convertId(id));
        const entities = await this.prisma.entity.findMany({
            where: { id: { in: intIds } },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id.toString(),
            accountId: e.accountId,
            credential: this._convertCredentialIds(e.credential),
            userId: e.userId?.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.subType,
            moduleName: e.moduleName,
        }));
    }

    /**
     * Find entities by user ID and module name
     * Replaces: Entity.find({ user: userId, moduleName: moduleName }).populate('credential')
     *
     * @param {string} userId - User ID (string from application layer)
     * @param {string} moduleName - Module name
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        const intUserId = this._convertId(userId);
        const entities = await this.prisma.entity.findMany({
            where: {
                userId: intUserId,
                moduleName,
            },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id.toString(),
            accountId: e.accountId,
            credential: this._convertCredentialIds(e.credential),
            userId: e.userId?.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.subType,
            moduleName: e.moduleName,
        }));
    }

    /**
     * Remove credential reference from entity
     * Replaces: Entity.updateOne({ _id: entityId }, { $unset: { credential: "" } })
     *
     * @param {string} entityId - Entity ID (string from application layer)
     * @returns {Promise<boolean>} Success indicator
     */
    async unsetCredential(entityId) {
        const intId = this._convertId(entityId);
        await this.prisma.entity.update({
            where: { id: intId },
            data: { credentialId: null },
        });

        return true;
    }

    /**
     * Find entity by filter criteria
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} Entity object with string IDs or null
     */
    async findEntity(filter) {
        const where = this._convertFilterToWhere(filter);
        const entity = await this.prisma.entity.findFirst({
            where,
            include: { credential: true },
        });

        if (!entity) {
            return null;
        }

        return {
            id: entity.id.toString(),
            accountId: entity.accountId,
            credential: this._convertCredentialIds(entity.credential),
            userId: entity.userId?.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.subType,
            moduleName: entity.moduleName,
        };
    }

    /**
     * Find entities matching filter criteria
     * Replaces: Entity.find(filter).populate('credential')
     *
     * @param {Object} filter - Filter criteria (e.g., { isGlobal: true, type: 'someType', status: 'connected' })
     * @returns {Promise<Array>} Array of entity objects with string IDs
     */
    async findEntitiesBy(filter) {
        const where = this._convertFilterToWhere(filter);
        const entities = await this.prisma.entity.findMany({
            where,
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id.toString(),
            accountId: e.accountId,
            credential: this._convertCredentialIds(e.credential),
            userId: e.userId?.toString(),
            name: e.name,
            externalId: e.externalId,
            type: e.subType,
            moduleName: e.moduleName,
        }));
    }

    /**
     * Create a new entity
     * Replaces: Entity.create(entityData)
     *
     * @param {Object} entityData - Entity data (with string IDs from application layer)
     * @returns {Promise<Object>} Created entity object with string IDs
     */
    async createEntity(entityData) {
        // Convert Mongoose-style fields to Prisma with ID conversion
        const data = {
            userId: this._convertId(entityData.user || entityData.userId),
            credentialId: this._convertId(
                entityData.credential || entityData.credentialId
            ),
            subType: entityData.type || entityData.subType,
            name: entityData.name,
            moduleName: entityData.moduleName,
            externalId: entityData.externalId,
            accountId: entityData.accountId,
        };

        const entity = await this.prisma.entity.create({
            data,
            include: { credential: true },
        });

        return {
            id: entity.id.toString(),
            accountId: entity.accountId,
            credential: this._convertCredentialIds(entity.credential),
            userId: entity.userId?.toString(),
            name: entity.name,
            externalId: entity.externalId,
            type: entity.subType,
            moduleName: entity.moduleName,
        };
    }

    /**
     * Update an entity by ID
     * Replaces: Entity.findByIdAndUpdate(entityId, updates, { new: true })
     *
     * @param {string} entityId - Entity ID to update (string from application layer)
     * @param {Object} updates - Fields to update (with string IDs from application layer)
     * @returns {Promise<Object|null>} Updated entity object with string IDs or null if not found
     */
    async updateEntity(entityId, updates) {
        // Convert Mongoose-style fields to Prisma with ID conversion
        const data = {};
        if (updates.user !== undefined)
            data.userId = this._convertId(updates.user);
        if (updates.userId !== undefined)
            data.userId = this._convertId(updates.userId);
        if (updates.credential !== undefined)
            data.credentialId = this._convertId(updates.credential);
        if (updates.credentialId !== undefined)
            data.credentialId = this._convertId(updates.credentialId);
        if (updates.type !== undefined) data.subType = updates.type;
        if (updates.subType !== undefined) data.subType = updates.subType;
        if (updates.name !== undefined) data.name = updates.name;
        if (updates.moduleName !== undefined)
            data.moduleName = updates.moduleName;
        if (updates.externalId !== undefined)
            data.externalId = updates.externalId;
        if (updates.accountId !== undefined) data.accountId = updates.accountId;

        try {
            const intId = this._convertId(entityId);
            const entity = await this.prisma.entity.update({
                where: { id: intId },
                data,
                include: { credential: true },
            });

            return {
                id: entity.id.toString(),
                accountId: entity.accountId,
                credential: this._convertCredentialIds(entity.credential),
                userId: entity.userId?.toString(),
                name: entity.name,
                externalId: entity.externalId,
                type: entity.subType,
                moduleName: entity.moduleName,
            };
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return null;
            }
            throw error;
        }
    }

    /**
     * Delete an entity by ID
     * Replaces: Entity.deleteOne({ _id: entityId })
     *
     * @param {string} entityId - Entity ID to delete (string from application layer)
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async deleteEntity(entityId) {
        try {
            const intId = this._convertId(entityId);
            await this.prisma.entity.delete({
                where: { id: intId },
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
     * Convert Mongoose-style filter to Prisma where clause (converting IDs to Int)
     * @private
     * @param {Object} filter - Mongoose filter (with string IDs from application layer)
     * @returns {Object} Prisma where clause (with Int IDs for PostgreSQL)
     */
    _convertFilterToWhere(filter) {
        const where = {};

        // Handle _id field (Mongoose uses _id, Prisma uses id)
        if (filter._id) {
            where.id = this._convertId(filter._id);
        }

        // Handle user field (Mongoose uses user, Prisma uses userId)
        if (filter.user) {
            where.userId = this._convertId(filter.user);
        }

        // Handle credential field (Mongoose uses credential, Prisma uses credentialId)
        if (filter.credential) {
            where.credentialId = this._convertId(filter.credential);
        }

        // Copy other fields directly (converting IDs)
        if (filter.id) where.id = this._convertId(filter.id);
        if (filter.userId) where.userId = this._convertId(filter.userId);
        if (filter.credentialId)
            where.credentialId = this._convertId(filter.credentialId);
        if (filter.name) where.name = filter.name;
        if (filter.moduleName) where.moduleName = filter.moduleName;
        if (filter.externalId) where.externalId = this._toString(filter.externalId);
        if (filter.subType) where.subType = filter.subType;

        return where;
    }
}

module.exports = { ModuleRepositoryPostgres };
