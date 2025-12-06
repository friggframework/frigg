const Boom = require('@hapi/boom');

/**
 * Get Credential For User Use Case
 * Retrieves a single credential after verifying ownership
 *
 * Business Logic:
 * - Verify credential exists
 * - Verify credential belongs to user (authorization)
 * - Return credential
 */
class GetCredentialForUser {
    constructor({ credentialRepository }) {
        this.credentialRepository = credentialRepository;
    }

    /**
     * Execute the use case
     * @param {string} credentialId - Credential ID
     * @param {string} userId - User ID (for ownership verification)
     * @returns {Promise<Object>} Credential object
     */
    async execute(credentialId, userId) {
        const credential = await this.credentialRepository.findCredentialById(
            credentialId
        );

        if (!credential) {
            throw Boom.notFound(`Credential ${credentialId} not found`);
        }

        // Verify ownership - compare as strings to handle both MongoDB and PostgreSQL
        if (credential.userId.toString() !== userId.toString()) {
            throw Boom.forbidden('You do not have permission to access this credential');
        }

        return credential;
    }
}

module.exports = { GetCredentialForUser };
