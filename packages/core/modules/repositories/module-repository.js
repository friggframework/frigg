const { prisma } = require('../../database/prisma');
const { ModuleRepositoryInterface } = require('./module-repository-interface');

/**
 * Prisma-based Module Repository
 * Handles Entity model operations for external service entities
 *
 * Works identically for both MongoDB and PostgreSQL:
 * - MongoDB: String IDs with @db.ObjectId
 * - PostgreSQL: Integer IDs with auto-increment
 * - Both use same query patterns (no many-to-many differences)
 *
 * Migration from Mongoose:
 * - Constructor injection of Prisma client
 * - populate('credential') → include: { credential: true }
 * - Mongoose discriminator (__t) → moduleName field (module type: salesforce, hubspot, etc.)
 * - _id → id conversion automatic in Prisma
 */
class ModuleRepository extends ModuleRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Find entity by ID with credential
     * Replaces: Entity.findById(entityId).populate('credential')
     *
     * @param {string} entityId - Entity ID
     * @returns {Promise<Object>} Entity object
     * @throws {Error} If entity not found
     */
    async findEntityById(entityId) {
        const entity = await this.prisma.entity.findUnique({
            where: { id: entityId },
            include: { credential: true },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        return {
            id: entity.id,
            credential: entity.credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
            ...(entity.data || {}),
        };
    }

    /**
     * Find all entities for a user
     * Replaces: Entity.find({ user: userId }).populate('credential')
     *
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of entity objects
     */
    async findEntitiesByUserId(userId) {
        const entities = await this.prisma.entity.findMany({
            where: { userId },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id,
            credential: e.credential,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
            ...(e.data || {}),
        }));
    }

    /**
     * Find entities by array of IDs
     * Replaces: Entity.find({ _id: { $in: entitiesIds } }).populate('credential')
     *
     * @param {Array<string>} entitiesIds - Array of entity IDs
     * @returns {Promise<Array>} Array of entity objects
     */
    async findEntitiesByIds(entitiesIds) {
        const entities = await this.prisma.entity.findMany({
            where: { id: { in: entitiesIds } },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id,
            credential: e.credential,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
            ...(e.data || {}),
        }));
    }

    /**
     * Find entities by user ID and module name
     * Replaces: Entity.find({ user: userId, moduleName: moduleName }).populate('credential')
     *
     * @param {string} userId - User ID
     * @param {string} moduleName - Module name
     * @returns {Promise<Array>} Array of entity objects
     */
    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        const entities = await this.prisma.entity.findMany({
            where: {
                userId,
                moduleName,
            },
            include: { credential: true },
        });

        return entities.map((e) => ({
            id: e.id,
            credential: e.credential,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
            ...(e.data || {}),
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
     * @returns {Promise<Object|null>} Entity object or null
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
            id: entity.id,
            credential: entity.credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
            ...(entity.data || {}),
        };
    }

    /**
     * Find entities matching filter criteria
     * Replaces: Entity.find(filter).populate('credential')
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of entity objects
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
     * @returns {Promise<Object>} Created entity object
     */
    async createEntity(entityData) {
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
            data: dynamicData,
        };

        const entity = await this.prisma.entity.create({
            data,
            include: { credential: true },
        });

        return {
            id: entity.id,
            credential: entity.credential,
            userId: entity.userId,
            name: entity.name,
            externalId: entity.externalId,
            moduleName: entity.moduleName,
            ...(entity.data || {}),
        };
    }

    /**
     * Update an entity by ID
     * Replaces: Entity.findByIdAndUpdate(entityId, updates, { new: true })
     *
     * @param {string} entityId - Entity ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated entity object or null if not found
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
                include: { credential: true },
            });

            return {
                id: entity.id,
                credential: entity.credential,
                userId: entity.userId,
                name: entity.name,
                externalId: entity.externalId,
                moduleName: entity.moduleName,
                ...(entity.data || {}),
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
        if (filter.externalId) where.externalId = filter.externalId;
        if (filter.isGlobal !== undefined) where.isGlobal = filter.isGlobal;

        return where;
    }
}

module.exports = { ModuleRepository };
