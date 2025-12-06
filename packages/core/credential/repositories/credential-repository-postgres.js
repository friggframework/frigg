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
    constructor() {
        super();
        this.prisma = prisma;
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

        const data = credential.data || {};

        return {
            id: credential.id.toString(),
            userId: credential.userId.toString(),
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            ...data, // Spread OAuth tokens from JSON field
        };
    }

    /**
     * Update authentication status
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
     *
     * @param {{identifiers: Object, details: Object}} credentialDetails
     * @returns {Promise<Object>} The persisted credential with string IDs
     */
    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers)
            throw new Error('identifiers required to upsert credential');

        // Support both userId (preferred) and user (legacy) for backward compatibility
        if (!identifiers.userId && !identifiers.user) {
            throw new Error('userId required in identifiers');
        }
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. ' +
                    'When multiple credentials exist for the same user, both userId and externalId ' +
                    'are needed to uniquely identify which credential to update.'
            );
        }

        const where = this._convertIdentifiersToWhere(identifiers);

        const { externalId } = identifiers;

        const { authIsValid, ...oauthData } = details;

        const existing = await this.prisma.credential.findFirst({ where });

        if (existing) {
            const mergedData = { ...(existing.data || {}), ...oauthData };

            const updated = await this.prisma.credential.update({
                where: { id: existing.id },
                data: {
                    userId: this._convertId(existing.userId),
                    externalId: existing.externalId,
                    authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                    data: mergedData,
                },
            });

            return {
                id: updated.id.toString(),
                externalId: updated.externalId,
                userId: updated.userId?.toString(),
                authIsValid: updated.authIsValid,
                ...(updated.data || {}),
            };
        }

        const created = await this.prisma.credential.create({
            data: {
                // Use userId from where clause (supports both userId and user fields)
                userId: where.userId,
                externalId,
                authIsValid: authIsValid,
                data: oauthData,
            },
        });

        return {
            id: created.id.toString(),
            externalId: created.externalId,
            userId: created.userId?.toString(),
            authIsValid: created.authIsValid,
            ...(created.data || {}),
        };
    }

    /**
     * Find credential(s) by filter criteria
     *
     * When filter includes only userId, returns an array of all credentials for that user
     * When filter includes credentialId or externalId, returns a single credential or null
     *
     * @param {Object} filter
     * @param {string} [filter.userId] - User ID (string from application layer)
     * @param {string} [filter.externalId] - External ID
     * @param {string} [filter.credentialId] - Credential ID (string from application layer)
     * @returns {Promise<Array|Object|null>} Credential array, single credential with string IDs, or null
     */
    async findCredential(filter) {
        const where = this._convertFilterToWhere(filter);

        // If filtering by userId only, return all credentials for that user
        const hasOnlyUserId = filter.userId && !filter.credentialId && !filter.externalId && !filter.id;

        if (hasOnlyUserId) {
            const credentials = await this.prisma.credential.findMany({
                where,
            });

            return credentials.map(credential => {
                const data = credential.data || {};
                return {
                    id: credential.id.toString(),
                    type: credential.type,
                    userId: credential.userId?.toString(),
                    externalId: credential.externalId,
                    authIsValid: credential.authIsValid,
                    entityCount: credential.entityCount,
                    createdAt: credential.createdAt,
                    updatedAt: credential.updatedAt,
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    ...data,
                };
            });
        }

        // Otherwise, find single credential
        const credential = await this.prisma.credential.findFirst({
            where,
        });

        if (!credential) {
            return null;
        }

        const data = credential.data || {};

        return {
            id: credential.id.toString(),
            type: credential.type,
            userId: credential.userId?.toString(),
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            entityCount: credential.entityCount,
            createdAt: credential.createdAt,
            updatedAt: credential.updatedAt,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            ...data,
        };
    }

    /**
     * Update a credential by ID
     *
     * @param {string} credentialId - Credential ID (string from application layer)
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated credential object with string IDs or null if not found
     */
    async updateCredential(credentialId, updates) {
        const intId = this._convertId(credentialId);
        const existing = await this.prisma.credential.findUnique({
            where: { id: intId },
        });

        if (!existing) {
            return null;
        }

        const { authIsValid, ...oauthData } = updates;

        const mergedData = { ...(existing.data || {}), ...oauthData };

        const updated = await this.prisma.credential.update({
            where: { id: intId },
            data: {
                userId: this._convertId(existing.userId),
                externalId: existing.externalId,
                authIsValid: authIsValid,
                data: mergedData,
            },
        });

        const data = updated.data || {};

        return {
            id: updated.id.toString(),
            userId: updated.userId?.toString(),
            externalId: updated.externalId,
            authIsValid: updated.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
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
        // Support both userId (preferred) and user (legacy) for backward compatibility
        if (identifiers.userId)
            where.userId = this._convertId(identifiers.userId);
        else if (identifiers.user)
            where.userId = this._convertId(identifiers.user);
        if (identifiers.externalId) where.externalId = identifiers.externalId;

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
        if (filter.userId) where.userId = this._convertId(filter.userId);
        if (filter.externalId) where.externalId = filter.externalId;

        return where;
    }
}

module.exports = { CredentialRepositoryPostgres };
