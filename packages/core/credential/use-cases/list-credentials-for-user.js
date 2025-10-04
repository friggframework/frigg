const Boom = require('@hapi/boom');

/**
 * List Credentials for User Use Case
 * Application layer orchestration for listing user's credentials with filters
 *
 * Follows API v2 spec: GET /api/credentials?status=orphaned&moduleType=slack
 *
 * @example
 * const useCase = new ListCredentialsForUser({ credentialRepository, moduleRepository });
 * const credentials = await useCase.execute(userId, { status: 'orphaned' });
 */
class ListCredentialsForUser {
    /**
     * @param {Object} params
     * @param {import('../repositories/credential-repository-interface').CredentialRepositoryInterface} params.credentialRepository
     * @param {import('../../modules/repositories/module-repository-factory').ModuleRepositoryInterface} params.moduleRepository
     */
    constructor({ credentialRepository, moduleRepository }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
    }

    /**
     * List credentials for a user with optional filters
     *
     * @param {string} userId - User ID
     * @param {Object} filters - Filter options
     * @param {string} [filters.status] - Filter by status: 'orphaned', 'active', 'invalid'
     * @param {string} [filters.moduleType] - Filter by module type
     * @returns {Promise<Array<Object>>} Array of credential metadata (NO SECRETS)
     */
    async execute(userId, filters = {}) {
        if (!userId) {
            throw Boom.badRequest('User ID is required');
        }

        // Get all credentials for user
        const credentials = await this.credentialRepository.findCredentialsByUserId(userId);

        let filtered = credentials;

        // Apply moduleType filter if provided
        if (filters.moduleType) {
            // Get entities to determine module type for each credential
            const entities = await this.moduleRepository.findEntities({ user: userId });
            const credentialModuleMap = new Map();

            entities.forEach(entity => {
                credentialModuleMap.set(entity.credential.toString(), entity.moduleName);
            });

            filtered = filtered.filter(cred => {
                const moduleType = credentialModuleMap.get(cred.id);
                return moduleType === filters.moduleType;
            });
        }

        // Apply status filter if provided
        if (filters.status) {
            const entities = await this.moduleRepository.findEntities({ user: userId });
            const credentialEntityCount = new Map();

            entities.forEach(entity => {
                const credId = entity.credential.toString();
                credentialEntityCount.set(credId, (credentialEntityCount.get(credId) || 0) + 1);
            });

            filtered = filtered.filter(cred => {
                const entityCount = credentialEntityCount.get(cred.id) || 0;
                const isOrphaned = entityCount === 0;
                const isActive = entityCount > 0;
                const isInvalid = cred.auth_is_valid === false;

                if (filters.status === 'orphaned') return isOrphaned;
                if (filters.status === 'active') return isActive;
                if (filters.status === 'invalid') return isInvalid;

                return true;
            });
        }

        // Return sanitized credential metadata (NO SECRETS)
        return filtered.map(cred => this._sanitizeCredential(cred));
    }

    /**
     * Sanitize credential - remove all secrets
     * @private
     */
    _sanitizeCredential(credential) {
        return {
            id: credential.id,
            userId: credential.userId,
            externalId: credential.externalId,
            authIsValid: credential.auth_is_valid,
            subType: credential.subType,
            createdAt: credential.createdAt,
            updatedAt: credential.updatedAt
            // NOTE: NO access_token, refresh_token, or other secrets
        };
    }
}

module.exports = { ListCredentialsForUser };
