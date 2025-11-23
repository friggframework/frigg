const bcrypt = require('bcryptjs');
const { prisma } = require('../../database/prisma');
const {
    createTokenRepository,
} = require('../../token/repositories/token-repository-factory');
const { UserRepositoryInterface } = require('./user-repository-interface');
const { ClientSafeError } = require('../../errors');

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
    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
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
     * @param {string} [params.hashword] - Plain text password (will be bcrypt hashed automatically)
     * @returns {Promise<Object>} Created user object with string IDs
     */
    async createIndividualUser(params) {
        const data = {
            type: 'INDIVIDUAL',
            email: params.email,
            username: params.username,
            appUserId: params.appUserId,
            organizationId: params.organization || params.organizationId,
        };

        if (
            params.hashword !== undefined &&
            params.hashword !== null &&
            params.hashword !== ''
        ) {
            if (typeof params.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }

            // Prevent double-hashing: bcrypt hashes start with $2a$ or $2b$
            if (params.hashword.startsWith('$2')) {
                throw new Error(
                    'Password appears to be already hashed. Pass plain text password only.'
                );
            }

            data.hashword = await bcrypt.hash(params.hashword, 10);
        }

        return await this.prisma.user.create({ data });
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
     * @param {string} [updates.hashword] - Plain text password (will be bcrypt hashed automatically)
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateIndividualUser(userId, updates) {
        const data = { ...updates };

        if (
            data.hashword !== undefined &&
            data.hashword !== null &&
            data.hashword !== ''
        ) {
            if (typeof data.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }

            // Prevent double-hashing: bcrypt hashes start with $2a$ or $2b$
            if (data.hashword.startsWith('$2')) {
                throw new Error(
                    'Password appears to be already hashed. Pass plain text password only.'
                );
            }

            data.hashword = await bcrypt.hash(data.hashword, 10);
        }

        return await this.prisma.user.update({
            where: { id: userId },
            data,
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
     * Link an individual user to an organization user
     * @param {string} individualUserId - Individual user ID (MongoDB ObjectId string)
     * @param {string} organizationUserId - Organization user ID (MongoDB ObjectId string)
     * @returns {Promise<Object>} Updated individual user object
     */
    async linkIndividualToOrganization(individualUserId, organizationUserId) {
        return await this.prisma.user.update({
            where: {
                id: individualUserId,
                type: 'INDIVIDUAL',
            },
            data: {
                organizationId: organizationUserId,
            },
        });
    }
}

module.exports = { UserRepositoryMongo };
