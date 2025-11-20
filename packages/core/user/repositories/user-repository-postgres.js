const bcrypt = require('bcryptjs');
const { prisma } = require('../../database/prisma');
const {
    createTokenRepository,
} = require('../../token/repositories/token-repository-factory');
const { UserRepositoryInterface } = require('./user-repository-interface');
const { ClientSafeError } = require('../../errors');

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
    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
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
     * @param {string} [params.hashword] - Plain text password (will be bcrypt hashed automatically)
     * @returns {Promise<Object>} Created user object with string IDs
     */
    async createIndividualUser(params) {
        const data = {
            type: 'INDIVIDUAL',
            email: params.email,
            username: params.username,
            appUserId: params.appUserId,
            organizationId: this._convertId(
                params.organization || params.organizationId
            ),
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

        const user = await this.prisma.user.create({ data });
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
     * @param {string} [updates.hashword] - Plain text password (will be bcrypt hashed automatically)
     * @returns {Promise<Object>} Updated user object with string IDs
     */
    async updateIndividualUser(userId, updates) {
        const intId = this._convertId(userId);

        const data = { ...updates };

        if (data.organizationId !== undefined) {
            data.organizationId = this._convertId(data.organizationId);
        }
        if (data.organization !== undefined) {
            data.organizationId = this._convertId(data.organization);
            delete data.organization;
        }

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
     * Link an individual user to an organization user
     * @param {string} individualUserId - Individual user ID (string from application layer)
     * @param {string} organizationUserId - Organization user ID (string from application layer)
     * @returns {Promise<Object>} Updated individual user with string IDs
     */
    async linkIndividualToOrganization(individualUserId, organizationUserId) {
        const intIndividualId = this._convertId(individualUserId);
        const intOrganizationId = this._convertId(organizationUserId);

        const user = await this.prisma.user.update({
            where: {
                id: intIndividualId,
                type: 'INDIVIDUAL',
            },
            data: {
                organizationId: intOrganizationId,
            },
        });
        return this._convertUserIds(user);
    }
}

module.exports = { UserRepositoryPostgres };
