const { prisma } = require('../../database/prisma');
const {
    createTokenRepository,
} = require('../../token/repositories/token-repository-factory');
const { UserRepositoryInterface } = require('./user-repository-interface');

/**
 * MongoDB User Repository Adapter
 * Handles user operations with discriminator pattern support
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (ObjectId)
 * - No ID conversion needed (IDs are already strings)
 * - IndividualUser/OrganizationUser discriminators → User model with type field
 */
class UserRepositoryMongo extends UserRepositoryInterface {
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
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findOrganizationUserById(userId) {
        return await this.prisma.user.findFirst({
            where: {
                id: userId,
                type: 'ORGANIZATION',
            },
        });
    }

    /**
     * Find individual user by ID
     * Replaces: IndividualUser.findById(userId)
     *
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserById(userId) {
        return await this.prisma.user.findFirst({
            where: {
                id: userId,
                type: 'INDIVIDUAL',
            },
        });
    }

    /**
     * Create token with expiration
     * Delegates to TokenRepository
     *
     * @param {string} userId - User ID
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
     * @param {Object} params - User creation parameters
     * @returns {Promise<Object>} Created user object with string IDs
     */
    async createIndividualUser(params) {
        return await this.prisma.user.create({
            data: {
                type: 'INDIVIDUAL',
                email: params.email,
                username: params.username,
                hashword: params.hashword,
                appUserId: params.appUserId,
                organizationId: params.organization || params.organizationId,
            },
        });
    }

    /**
     * Create organization user
     * Replaces: OrganizationUser.create(params)
     *
     * @param {Object} params - Organization creation parameters
     * @returns {Promise<Object>} Created organization object with string IDs
     */
    async createOrganizationUser(params) {
        return await this.prisma.user.create({
            data: {
                type: 'ORGANIZATION',
                appOrgId: params.appOrgId,
                name: params.name,
            },
        });
    }

    /**
     * Find individual user by username
     * Replaces: IndividualUser.findOne({ username })
     *
     * @param {string} username - Username to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByUsername(username) {
        return await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                username,
            },
        });
    }

    /**
     * Find individual user by app user ID
     * Replaces: IndividualUser.getUserByAppUserId(appUserId)
     *
     * @param {string} appUserId - App user ID to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByAppUserId(appUserId) {
        return await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                appUserId,
            },
        });
    }

    /**
     * Find organization user by app org ID
     * Replaces: OrganizationUser.getUserByAppOrgId(appOrgId)
     *
     * @param {string} appOrgId - App organization ID to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findOrganizationUserByAppOrgId(appOrgId) {
        return await this.prisma.user.findFirst({
            where: {
                type: 'ORGANIZATION',
                appOrgId,
            },
        });
    }

    /**
     * Find user by ID (any type)
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findUserById(userId) {
        return await this.prisma.user.findUnique({
            where: { id: userId },
        });
    }

    /**
     * Find individual user by email
     * @param {string} email - Email to search for
     * @returns {Promise<Object|null>} User object with string IDs or null
     */
    async findIndividualUserByEmail(email) {
        return await this.prisma.user.findFirst({
            where: {
                type: 'INDIVIDUAL',
                email,
            },
        });
    }

    /**
     * Update individual user
     * @param {string} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateIndividualUser(userId, updates) {
        return await this.prisma.user.update({
            where: { id: userId },
            data: updates,
        });
    }

    /**
     * Update organization user
     * @param {string} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateOrganizationUser(userId, updates) {
        return await this.prisma.user.update({
            where: { id: userId },
            data: updates,
        });
    }

    /**
     * Delete user by ID
     * @param {string} userId - User ID to delete
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async deleteUser(userId) {
        try {
            await this.prisma.user.delete({
                where: { id: userId },
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

        return await this.prisma.user.findMany({
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

        return await this.prisma.user.findMany({
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

module.exports = { UserRepositoryMongo };
