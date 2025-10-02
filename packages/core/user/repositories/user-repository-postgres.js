const { prisma } = require('../../database/prisma');
const {
    createTokenRepository,
} = require('../../token/repositories/token-repository-factory');
const { UserRepositoryInterface } = require('./user-repository-interface');

/**
 * PostgreSQL User Repository Adapter
 * Handles user operations with discriminator pattern support
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class UserRepositoryPostgres extends UserRepositoryInterface {
    /**
     * @param {Object} config - Configuration object
     * @param {Object} config.userConfig - The user config in the app definition
     * @param {Object} [config.prismaClient] - Optional Prisma client for testing
     * @param {Object} [config.tokenRepository] - Optional token repository for testing
     */
    constructor({ userConfig, prismaClient = prisma, tokenRepository = null }) {
        super();
        this.prisma = prismaClient;
        this.tokenRepository =
            tokenRepository || createTokenRepository(prismaClient);
        this.userConfig = userConfig;
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
     * Convert user object IDs to strings
     * @private
     * @param {Object|null} user - User object from database
     * @returns {Object|null} User with string IDs
     */
    _convertUserIds(user) {
        if (!user) return user;
        return {
            ...user,
            id: user.id?.toString(),
            organizationId: user.organizationId?.toString(),
        };
    }

    /**
     * Get session token from base64 buffer token
     * Delegates to TokenRepository
     *
     * @param {string} token - Base64 buffer token
     * @returns {Promise<Object>} Session token object with string IDs
     */
    async getSessionToken(token) {
        const jsonToken =
            this.tokenRepository.getJSONTokenFromBase64BufferToken(token);
        const sessionToken = await this.tokenRepository.validateAndGetToken(
            jsonToken
        );
        return sessionToken;
    }

    /**
     * Find organization user by ID
     * Replaces: OrganizationUser.findById(userId)
     *
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findOrganizationUserById(userId) {
        const intId = this._convertId(userId);
        const user = await this.prisma.user.findFirst({
            where: {
                id: intId,
                type: 'ORGANIZATION',
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find individual user by ID
     * Replaces: IndividualUser.findById(userId)
     *
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserById(userId) {
        const intId = this._convertId(userId);
        const user = await this.prisma.user.findFirst({
            where: {
                id: intId,
                type: 'INDIVIDUAL',
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Create token with expiration
     * Delegates to TokenRepository
     *
     * @param {string} userId - User ID (string from application layer)
     * @param {string} rawToken - Raw unhashed token
     * @param {number} minutes - Minutes until expiration (default 120)
     * @returns {Promise<string>} Base64 buffer token
     */
    async createToken(userId, rawToken, minutes = 120) {
        const createdToken = await this.tokenRepository.createTokenWithExpire(
            userId,
            rawToken,
            minutes
        );
        return this.tokenRepository.createBase64BufferToken(
            createdToken,
            rawToken
        );
    }

    /**
     * Create individual user
     * Replaces: IndividualUser.create(params)
     *
     * @param {Object} params - User creation parameters (with string IDs from application layer)
     * @returns {Promise<Object>} Created user object with string IDs
     */
    async createIndividualUser(params) {
        const user = await this.prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                email: params.email,
                username: params.username,
                hashword: params.hashword,
                appUserId: params.appUserId,
                organizationId: this._convertId(
                    params.organization || params.organizationId
                ),
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Create organization user
     * Replaces: OrganizationUser.create(params)
     *
     * @param {Object} params - Organization creation parameters
     * @returns {Promise<Object>} Created organization object with string IDs
     */
    async createOrganizationUser(params) {
        const user = await this.prisma.user.create({
            data: {
                type: 'ORGANIZATION',
                appOrgId: params.appOrgId,
                name: params.name,
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find individual user by username
     * Replaces: IndividualUser.findOne({ username })
     *
     * @param {string} username - Username to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByUsername(username) {
        const user = await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                username,
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find individual user by app user ID
     * Replaces: IndividualUser.getUserByAppUserId(appUserId)
     *
     * @param {string} appUserId - App user ID to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByAppUserId(appUserId) {
        const user = await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                appUserId,
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find organization user by app org ID
     * Replaces: OrganizationUser.getUserByAppOrgId(appOrgId)
     *
     * @param {string} appOrgId - App organization ID to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findOrganizationUserByAppOrgId(appOrgId) {
        const user = await this.prisma.user.findFirst({
            where: {
                type: 'ORGANIZATION',
                appOrgId,
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find user by ID (any type)
     * @param {string} userId - User ID (string from application layer)
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findUserById(userId) {
        const intId = this._convertId(userId);
        const user = await this.prisma.user.findUnique({
            where: { id: intId },
        });
        return this._convertUserIds(user);
    }

    /**
     * Find individual user by email
     * @param {string} email - Email to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByEmail(email) {
        const user = await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                email,
            },
        });
        return this._convertUserIds(user);
    }

    /**
     * Update individual user
     * @param {string} userId - User ID (string from application layer)
     * @param {Object} updates - Fields to update (with string IDs from application layer)
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateIndividualUser(userId, updates) {
        const intId = this._convertId(userId);

        // Convert organizationId if present in updates
        const data = { ...updates };
        if (data.organizationId !== undefined) {
            data.organizationId = this._convertId(data.organizationId);
        }
        if (data.organization !== undefined) {
            data.organizationId = this._convertId(data.organization);
            delete data.organization;
        }

        const user = await this.prisma.user.update({
            where: { id: intId },
            data,
        });
        return this._convertUserIds(user);
    }

    /**
     * Update organization user
     * @param {string} userId - User ID (string from application layer)
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateOrganizationUser(userId, updates) {
        const intId = this._convertId(userId);
        const user = await this.prisma.user.update({
            where: { id: intId },
            data: updates,
        });
        return this._convertUserIds(user);
    }

    /**
     * Delete user by ID
     * @param {string} userId - User ID to delete (string from application layer)
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async deleteUser(userId) {
        try {
            const intId = this._convertId(userId);
            await this.prisma.user.delete({
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
     * Find all users with pagination
     * @param {Object} options - Query options
     * @param {number} [options.skip] - Number of records to skip
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {Object} [options.sort] - Sort criteria (e.g., { createdAt: -1 })
     * @param {Array<string>} [options.excludeFields] - Fields to exclude (not used in Prisma, kept for interface compatibility)
     * @returns {Promise<Array<Object>>} Array of user objects with string IDs
     */
    async findAllUsers(options = {}) {
        const { skip = 0, limit = 50, sort = { createdAt: -1 } } = options;

        // Convert MongoDB-style sort to Prisma orderBy format
        const orderBy = Object.entries(sort).map(([field, direction]) => ({
            [field]: direction === -1 ? 'desc' : 'asc',
        }));

        const users = await this.prisma.user.findMany({
            skip,
            take: limit,
            orderBy,
            select: {
                id: true,
                type: true,
                email: true,
                username: true,
                appUserId: true,
                appOrgId: true,
                name: true,
                organizationId: true,
                createdAt: true,
                updatedAt: true,
                // Exclude hashword
            },
        });

        // Convert integer IDs to strings for each user
        return users.map((user) => this._convertUserIds(user));
    }

    /**
     * Get total user count
     * @returns {Promise<number>} Total number of users
     */
    async countUsers() {
        return await this.prisma.user.count();
    }

    /**
     * Search users by username or email
     * @param {Object} options - Search options
     * @param {string} options.query - Search query string
     * @param {number} [options.skip] - Number of records to skip
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {Object} [options.sort] - Sort criteria (e.g., { createdAt: -1 })
     * @param {Array<string>} [options.excludeFields] - Fields to exclude (not used in Prisma, kept for interface compatibility)
     * @returns {Promise<Array<Object>>} Array of matching user objects with string IDs
     */
    async searchUsers(options = {}) {
        const { query, skip = 0, limit = 50, sort = { createdAt: -1 } } = options;

        // Convert MongoDB-style sort to Prisma orderBy format
        const orderBy = Object.entries(sort).map(([field, direction]) => ({
            [field]: direction === -1 ? 'desc' : 'asc',
        }));

        const users = await this.prisma.user.findMany({
            where: {
                OR: [
                    { username: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            },
            skip,
            take: limit,
            orderBy,
            select: {
                id: true,
                type: true,
                email: true,
                username: true,
                appUserId: true,
                appOrgId: true,
                name: true,
                organizationId: true,
                createdAt: true,
                updatedAt: true,
                // Exclude hashword
            },
        });

        // Convert integer IDs to strings for each user
        return users.map((user) => this._convertUserIds(user));
    }

    /**
     * Count users matching search query
     * @param {string} query - Search query string
     * @returns {Promise<number>} Number of matching users
     */
    async countUsersBySearchQuery(query) {
        return await this.prisma.user.count({
            where: {
                OR: [
                    { username: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            },
        });
    }
}

module.exports = { UserRepositoryPostgres };
