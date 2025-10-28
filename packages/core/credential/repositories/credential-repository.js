const { prisma } = require('../../database/prisma');
const {
    CredentialRepositoryInterface,
} = require('./credential-repository-interface');

/**
 * Prisma-based Credential Repository
 * Handles OAuth credentials and API tokens persistence
 *
 * Works identically for both MongoDB and PostgreSQL:
 * - MongoDB: String IDs with @db.ObjectId
 * - PostgreSQL: Integer IDs with auto-increment
 * - Both use same query patterns (no many-to-many differences)
 *
 * Migration from Mongoose:
 * - Constructor injection of Prisma client
 * - Dynamic schema (strict: false) → JSON field (data)
 * - All OAuth tokens stored in data JSON field
 * - Mongoose field names → Prisma field names (user → userId)
 */
class CredentialRepository extends CredentialRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Find credential by ID
     * Replaces: Credential.findById(id)
     *
     * @param {string} id - Credential ID
     * @returns {Promise<Object|null>} Credential object or null
     */
    async findCredentialById(id) {
        const credential = await this.prisma.credential.findUnique({
            where: { id },
        });

        if (!credential) {
            return null;
        }

        // Extract data from JSON field
        const data = credential.data || {};

        return {
            _id: credential.id,
            id: credential.id,
            user: credential.userId,
            userId: credential.userId,
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            ...data, // Spread OAuth tokens from JSON field
        };
    }

    /**
     * Update authentication status
     * Replaces: Credential.updateOne({ _id: credentialId }, { $set: { authIsValid } })
     *
     * @param {string} credentialId - Credential ID
     * @param {boolean} authIsValid - Authentication validity status
     * @returns {Promise<Object>} Update result
     */
    async updateAuthenticationStatus(credentialId, authIsValid) {
        await this.prisma.credential.update({
            where: { id: credentialId },
            data: { authIsValid },
        });

        return { acknowledged: true, modifiedCount: 1 };
    }

    /**
     * Permanently remove a credential document
     * Replaces: Credential.deleteOne({ _id: credentialId })
     *
     * @param {string} credentialId - Credential ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteCredentialById(credentialId) {
        try {
            await this.prisma.credential.delete({
                where: { id: credentialId },
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
     * @returns {Promise<Object>} The persisted credential
     */
    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers)
            throw new Error('identifiers required to upsert credential');

        // Build where clause from identifiers
        const where = this._convertIdentifiersToWhere(identifiers);

        // Separate schema fields from dynamic OAuth data
        const {
            user,
            userId,
            externalId,
            authIsValid,
            
            ...oauthData
        } = details;

        // Find existing credential
        const existing = await this.prisma.credential.findFirst({ where });

        if (existing) {
            // Update existing - merge OAuth data into existing data JSON
            const mergedData = { ...(existing.data || {}), ...oauthData };

            const updated = await this.prisma.credential.update({
                where: { id: existing.id },
                data: {
                    userId: userId || user || existing.userId,
                    externalId:
                        externalId !== undefined
                            ? externalId
                            : existing.externalId,
                    authIsValid:
                        authIsValid !== undefined
                            ? authIsValid
                            : existing.authIsValid,
                    data: mergedData,
                },
            });

            return {
                id: updated.id,
                externalId: updated.externalId,
                userId: updated.userId,
                authIsValid: updated.authIsValid,
                ...(updated.data || {}),
            };
        }

        // Create new credential
        const created = await this.prisma.credential.create({
            data: {
                userId: userId || user,
                externalId,
                authIsValid: authIsValid,
                
                data: oauthData,
            },
        });

        return {
            id: created.id,
            externalId: created.externalId,
            userId: created.userId,
            authIsValid: created.authIsValid,
            ...(created.data || {}),
        };
    }

    /**
     * Find a credential by filter criteria
     * Replaces: Credential.findOne(query)
     *
     * @param {Object} filter
     * @param {string} [filter.userId] - User ID
     * @param {string} [filter.externalId] - External ID
     * @param {string} [filter.credentialId] - Credential ID
     * @returns {Promise<Object|null>} Credential object or null if not found
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
            id: credential.id,
            userId: credential.userId,
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
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
     * @param {string} credentialId - Credential ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated credential object or null if not found
     */
    async updateCredential(credentialId, updates) {
        // Get existing credential to merge OAuth data
        const existing = await this.prisma.credential.findUnique({
            where: { id: credentialId },
        });

        if (!existing) {
            return null;
        }

        // Separate schema fields from OAuth data
        const {
            user,
            userId,
            externalId,
            authIsValid,
            
            ...oauthData
        } = updates;

        // Merge OAuth data with existing
        const mergedData = { ...(existing.data || {}), ...oauthData };

        const updated = await this.prisma.credential.update({
            where: { id: credentialId },
            data: {
                userId: userId || user || existing.userId,
                externalId:
                    externalId !== undefined ? externalId : existing.externalId,
                authIsValid:
                    authIsValid !== undefined ? authIsValid : existing.authIsValid,
                data: mergedData,
            },
        });

        const data = updated.data || {};

        return {
            id: updated.id,
            userId: updated.userId,
            externalId: updated.externalId,
            authIsValid: updated.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            domain: data.domain,
            ...data,
        };
    }

    /**
     * Convert identifiers to Prisma where clause
     * @private
     * @param {Object} identifiers - Identifier fields
     * @returns {Object} Prisma where clause
     */
    _convertIdentifiersToWhere(identifiers) {
        const where = {};

        if (identifiers._id) where.id = identifiers._id;
        if (identifiers.id) where.id = identifiers.id;
        if (identifiers.user) where.userId = identifiers.user;
        if (identifiers.userId) where.userId = identifiers.userId;
        if (identifiers.externalId) where.externalId = identifiers.externalId;

        return where;
    }

    /**
     * Convert filter to Prisma where clause
     * @private
     * @param {Object} filter - Filter criteria
     * @returns {Object} Prisma where clause
     */
    _convertFilterToWhere(filter) {
        const where = {};

        if (filter.credentialId) where.id = filter.credentialId;
        if (filter.id) where.id = filter.id;
        if (filter.user) where.userId = filter.user;
        if (filter.userId) where.userId = filter.userId;
        if (filter.externalId) where.externalId = filter.externalId;

        return where;
    }
}

module.exports = { CredentialRepository };
