const { prisma } = require('../../database/prisma');
const {
    CredentialRepositoryInterface,
} = require('./credential-repository-interface');

/**
 * PostgreSQL Credential Repository Adapter
 * Handles OAuth credentials and API tokens persistence with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class CredentialRepositoryPostgres extends CredentialRepositoryInterface {
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
     * Find credential by ID
     * Replaces: Credential.findById(id)
     *
     * @param {string} id - Credential ID (string from application layer)
     * @returns {Promise<Object|null>} Credential object with string IDs or null
     */
    async findCredentialById(id) {
        const intId = this._convertId(id);
        const credential = await this.prisma.credential.findUnique({
            where: { id: intId },
        });

        if (!credential) {
            return null;
        }

        // Extract data from JSON field
        const data = credential.data || {};

        return {
            _id: credential.id.toString(),
            id: credential.id.toString(),
            user: credential.userId?.toString(),
            userId: credential.userId?.toString(),
            externalId: credential.externalId,
            auth_is_valid: credential.authIsValid,
            subType: credential.subType,
            ...data, // Spread OAuth tokens from JSON field
        };
    }

    /**
     * Update authentication status
     * Replaces: Credential.updateOne({ _id: credentialId }, { $set: { auth_is_valid: authIsValid } })
     *
     * @param {string} credentialId - Credential ID (string from application layer)
     * @param {boolean} authIsValid - Authentication validity status
     * @returns {Promise<Object>} Update result
     */
    async updateAuthenticationStatus(credentialId, authIsValid) {
        const intId = this._convertId(credentialId);
        await this.prisma.credential.update({
            where: { id: intId },
            data: { authIsValid },
        });

        return { acknowledged: true, modifiedCount: 1 };
    }

    /**
     * Permanently remove a credential document
     * Replaces: Credential.deleteOne({ _id: credentialId })
     *
     * @param {string} credentialId - Credential ID (string from application layer)
     * @returns {Promise<Object>} Deletion result
     */
    async deleteCredentialById(credentialId) {
        try {
            const intId = this._convertId(credentialId);
            await this.prisma.credential.delete({
                where: { id: intId },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    /**
     * Create or update credential matching identifiers
     * Replaces: Credential.findOneAndUpdate(query, update, { upsert: true })
     *
     * @param {{identifiers: Object, details: Object}} credentialDetails
     * @returns {Promise<Object>} The persisted credential with string IDs
     */
    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers)
            throw new Error('identifiers required to upsert credential');

        const where = this._convertIdentifiersToWhere(identifiers);

        const { user, externalId } = identifiers;

        // Separate schema fields from dynamic OAuth data
        const { auth_is_valid, authIsValid, subType, ...oauthData } = details;

        const existing = await this.prisma.credential.findFirst({ where });

        if (existing) {
            const mergedData = { ...(existing.data || {}), ...oauthData };

            const updated = await this.prisma.credential.update({
                where: { id: existing.id },
                data: {
                    userId: this._convertId(user || existing.userId),
                    externalId:
                        externalId !== undefined
                            ? externalId
                            : existing.externalId,
                    authIsValid:
                        authIsValid !== undefined
                            ? authIsValid
                            : auth_is_valid !== undefined
                            ? auth_is_valid
                            : existing.authIsValid,
                    subType: subType !== undefined ? subType : existing.subType,
                    data: mergedData,
                },
            });

            return {
                id: updated.id.toString(),
                externalId: updated.externalId,
                userId: updated.userId?.toString(),
                auth_is_valid: updated.authIsValid,
                ...(updated.data || {}),
            };
        }

        const created = await this.prisma.credential.create({
            data: {
                userId: this._convertId(user),
                externalId,
                authIsValid:
                    authIsValid !== undefined ? authIsValid : auth_is_valid,
                subType,
                data: oauthData,
            },
        });

        return {
            id: created.id.toString(),
            externalId: created.externalId,
            userId: created.userId?.toString(),
            auth_is_valid: created.authIsValid,
            ...(created.data || {}),
        };
    }

    /**
     * Find a credential by filter criteria
     * Replaces: Credential.findOne(query)
     *
     * @param {Object} filter
     * @param {string} [filter.userId] - User ID (string from application layer)
     * @param {string} [filter.externalId] - External ID
     * @param {string} [filter.credentialId] - Credential ID (string from application layer)
     * @returns {Promise<Object|null>} Credential object with string IDs or null if not found
     */
    async findCredential(filter) {
        const where = this._convertFilterToWhere(filter);

        const credential = await this.prisma.credential.findFirst({
            where,
        });

        if (!credential) {
            return null;
        }

        const data = credential.data || {};

        return {
            id: credential.id.toString(),
            userId: credential.userId?.toString(),
            externalId: credential.externalId,
            auth_is_valid: credential.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            domain: data.domain,
            ...data,
        };
    }

    /**
     * Update a credential by ID
     * Replaces: Credential.findByIdAndUpdate(credentialId, { $set: updates })
     *
     * @param {string} credentialId - Credential ID (string from application layer)
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated credential object with string IDs or null if not found
     */
    async updateCredential(credentialId, updates) {
        // Get existing credential to merge OAuth data
        const intId = this._convertId(credentialId);
        const existing = await this.prisma.credential.findUnique({
            where: { id: intId },
        });

        if (!existing) {
            return null;
        }

        // Separate schema fields from OAuth data
        const { user, auth_is_valid, authIsValid, subType, ...oauthData } =
            updates;

        // Merge OAuth data with existing
        const mergedData = { ...(existing.data || {}), ...oauthData };

        const updated = await this.prisma.credential.update({
            where: { id: intId },
            data: {
                userId: this._convertId(userId || user || existing.userId),
                externalId:
                    externalId !== undefined ? externalId : existing.externalId,
                authIsValid:
                    authIsValid !== undefined
                        ? authIsValid
                        : auth_is_valid !== undefined
                        ? auth_is_valid
                        : existing.authIsValid,
                subType: subType !== undefined ? subType : existing.subType,
                data: mergedData,
            },
        });

        const data = updated.data || {};

        return {
            id: updated.id.toString(),
            userId: updated.userId?.toString(),
            externalId: updated.externalId,
            auth_is_valid: updated.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            domain: data.domain,
            ...data,
        };
    }

    /**
     * Convert identifiers to Prisma where clause (converting IDs to Int)
     * @private
     * @param {Object} identifiers - Identifier fields
     * @returns {Object} Prisma where clause with Int IDs
     */
    _convertIdentifiersToWhere(identifiers) {
        const where = {};

        if (identifiers.id) where.id = this._convertId(identifiers.id);
        if (identifiers.user) where.userId = this._convertId(identifiers.user);
        if (identifiers.userId)
            where.userId = this._convertId(identifiers.userId);
        if (identifiers.externalId) where.externalId = identifiers.externalId;
        if (identifiers.subType) where.subType = identifiers.subType;

        return where;
    }

    /**
     * Convert filter to Prisma where clause (converting IDs to Int)
     * @private
     * @param {Object} filter - Filter criteria
     * @returns {Object} Prisma where clause with Int IDs
     */
    _convertFilterToWhere(filter) {
        const where = {};

        if (filter.credentialId)
            where.id = this._convertId(filter.credentialId);
        if (filter.id) where.id = this._convertId(filter.id);
        if (filter.user) where.userId = this._convertId(filter.user);
        if (filter.userId) where.userId = this._convertId(filter.userId);
        if (filter.externalId) where.externalId = filter.externalId;
        if (filter.subType) where.subType = filter.subType;

        return where;
    }
}

module.exports = { CredentialRepositoryPostgres };
