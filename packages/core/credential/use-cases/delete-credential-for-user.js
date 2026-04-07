const Boom = require('@hapi/boom');

/**
 * Delete Credential For User Use Case
 * Removes a credential after verifying ownership
 *
 * Business Logic:
 * - Verify credential exists
 * - Verify credential belongs to user (authorization)
 * - Delete the credential
 * - Return success status
 */
class DeleteCredentialForUser {
    constructor({ credentialRepository }) {
        this.credentialRepository = credentialRepository;
    }

    /**
     * Execute the use case
     * @param {string} credentialId - Credential ID
     * @param {string} userId - User ID (for ownership verification)
     * @returns {Promise<Object>} Deletion result { deletedCount: number }
     */
    async execute(credentialId, userId) {
        // Check if credential exists
        const credential = await this.credentialRepository.findCredentialById(
            credentialId
        );

        if (!credential) {
            throw Boom.notFound(`Credential ${credentialId} not found`);
        }

        // Verify ownership - compare as strings to handle both MongoDB and PostgreSQL
        if (credential.userId.toString() !== userId.toString()) {
            throw Boom.forbidden(
                'You do not have permission to delete this credential'
            );
        }

        // Delete the credential
        const result = await this.credentialRepository.deleteCredentialById(
            credentialId
        );

        return result;
    }
}

module.exports = { DeleteCredentialForUser };
