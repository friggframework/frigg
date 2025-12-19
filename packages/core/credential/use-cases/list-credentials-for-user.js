/**
 * List Credentials For User Use Case
 * Retrieves all credentials belonging to a specific user
 *
 * Business Logic:
 * - Fetches credentials for the authenticated user
 * - Returns list of credentials (sensitive data filtered by handler)
 * - Repository returns an array when filtering by userId only
 */
class ListCredentialsForUser {
    constructor({ credentialRepository }) {
        this.credentialRepository = credentialRepository;
    }

    /**
     * Execute the use case
     * @param {string} userId - User ID
     * @returns {Promise<Array>} List of credentials (empty array if none found)
     */
    async execute(userId) {
        const credentials = await this.credentialRepository.findCredential({
            userId,
        });

        // Repository returns array for userId-only queries
        // Ensure we always return an array (defensive programming)
        return Array.isArray(credentials) ? credentials : [];
    }
}

module.exports = { ListCredentialsForUser };
