const {
    createCredentialRepository,
} = require('../../credential/repositories/credential-repository-factory');

const ERROR_CODE_MAP = {
    CREDENTIAL_NOT_FOUND: 404,
    INVALID_CREDENTIAL_DATA: 400,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

/**
 * Create credential command factory
 *
 * NOTE: This is an internal API. Integration developers should use createFriggCommands() instead.
 *
 * @returns {Object} Credential command object with CRUD operations
 */
function createCredentialCommands() {
    const credRepo = createCredentialRepository();

    return {
        /**
         * Create a new credential
         * @param {Object} params
         * @param {string} params.userId - User ID who owns this credential
         * @param {string} params.externalId - External identifier from the API module
         * @param {string} params.access_token - OAuth access token
         * @param {string} [params.refresh_token] - OAuth refresh token
         * @param {string} [params.domain] - Domain for the credential
         * @param {boolean} [params.auth_is_valid=true] - Whether authentication is valid
         * @returns {Promise<Object>} Created credential object
         */
        async createCredential({
            userId,
            externalId,
            access_token,
            refresh_token,
            domain,
            auth_is_valid = true,
        } = {}) {
            try {
                if (!userId || !externalId || !access_token) {
                    const error = new Error(
                        'userId, externalId, and access_token are required'
                    );
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credentialData = {
                    identifiers: { user: userId, externalId },
                    details: {
                        access_token,
                        auth_is_valid,
                    },
                };

                if (refresh_token) {
                    credentialData.details.refresh_token = refresh_token;
                }
                if (domain) {
                    credentialData.details.domain = domain;
                }

                const credential = await credRepo.upsertCredential(
                    credentialData
                );

                return {
                    id: credential.id,
                    userId: credential.userId,
                    externalId: credential.externalId,
                    access_token: credential.access_token,
                    refresh_token: credential.refresh_token,
                    auth_is_valid: credential.auth_is_valid,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find a credential by filter criteria
         * @param {Object} filter
         * @param {string} [filter.userId] - User ID to search for
         * @param {string} [filter.externalId] - External ID to search for
         * @param {string} [filter.credentialId] - Credential ID to search for
         * @returns {Promise<Object|null>} Credential object or null if not found
         */
        async findCredential(filter = {}) {
            try {
                if (
                    !filter.userId &&
                    !filter.externalId &&
                    !filter.credentialId
                ) {
                    const error = new Error(
                        'At least one filter criterion is required'
                    );
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credential = await credRepo.findCredential(filter);

                if (!credential) {
                    return null;
                }

                return {
                    id: credential.id,
                    userId: credential.userId,
                    externalId: credential.externalId,
                    access_token: credential.access_token,
                    refresh_token: credential.refresh_token,
                    auth_is_valid: credential.auth_is_valid,
                    domain: credential.domain,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update a credential by ID
         * @param {string} credentialId - Credential ID to update
         * @param {Object} updates - Fields to update
         * @returns {Promise<Object>} Updated credential object
         */
        async updateCredential(credentialId, updates) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required');
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credential = await credRepo.updateCredential(
                    credentialId,
                    updates
                );

                if (!credential) {
                    const error = new Error(
                        `Credential ${credentialId} not found`
                    );
                    error.code = 'CREDENTIAL_NOT_FOUND';
                    throw error;
                }

                return {
                    id: credential.id,
                    userId: credential.userId,
                    externalId: credential.externalId,
                    access_token: credential.access_token,
                    refresh_token: credential.refresh_token,
                    auth_is_valid: credential.auth_is_valid,
                    domain: credential.domain,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update authentication status for a credential
         * @param {string} credentialId - Credential ID to update
         * @param {boolean} isValid - Whether authentication is valid
         * @returns {Promise<Object>} Result object with success flag
         */
        async updateAuthenticationStatus(credentialId, isValid) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required');
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                await credRepo.updateAuthenticationStatus(
                    credentialId,
                    isValid
                );

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Delete a credential by ID
         * @param {string} credentialId - Credential ID to delete
         * @returns {Promise<Object>} Result object with success flag
         */
        async deleteCredential(credentialId) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required');
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                await credRepo.deleteCredentialById(credentialId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = {
    createCredentialCommands,
    ERROR_CODE_MAP,
};
