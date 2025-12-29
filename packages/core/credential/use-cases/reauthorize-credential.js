const Boom = require('@hapi/boom');

/**
 * Reauthorize Credential Use Case
 * Re-authorizes an existing credential with new authentication data
 * Supports both single-step and multi-step authorization flows
 *
 * Business Logic:
 * - Verify credential exists and belongs to user
 * - Load the appropriate module for the credential type
 * - Process authorization callback (OAuth code, API keys, etc.)
 * - Update credential with new tokens
 * - Return success or next step requirements
 */
class ReauthorizeCredential {
    constructor({ credentialRepository, moduleRepository }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
    }

    /**
     * Execute the use case
     * @param {string} credentialId - Credential ID to reauthorize
     * @param {string} userId - User ID (for ownership verification)
     * @param {Object} authData - Authorization data
     * @param {number} [step=1] - Current step in multi-step flow
     * @param {string} [sessionId] - Session ID for multi-step flows
     * @returns {Promise<Object>} Success response or next step requirements
     */
    async execute(credentialId, userId, authData, step = 1, sessionId = null) {
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
                'You do not have permission to reauthorize this credential'
            );
        }

        // Load the module for this credential type
        const module = await this.moduleRepository.findModuleById(
            credential.id
        );

        if (!module) {
            throw Boom.badRequest(
                `Module not found for credential type: ${
                    credential.type || 'unknown'
                }`
            );
        }

        // Process the authorization callback
        const result = await module.processAuthorizationCallback({
            credentialId,
            userId,
            data: authData,
            step,
            sessionId,
        });

        // Multi-step flow - return next step requirements
        if (result.step && result.step > 1) {
            return {
                step: result.step,
                totalSteps: result.totalSteps,
                sessionId: result.sessionId,
                requirements: result.requirements,
                message: result.message,
            };
        }

        // Single-step or final step - update credential and return success
        if (result.success) {
            // Fetch the updated credential to get the new authIsValid status
            const updatedCredential =
                await this.credentialRepository.findCredentialById(
                    credentialId
                );

            return {
                success: true,
                credential_id: credentialId,
                authIsValid: updatedCredential?.authIsValid || true,
                ...(result.message && { message: result.message }),
            };
        }

        // If we get here, something unexpected happened
        throw new Error(
            'Authorization callback did not return expected result format'
        );
    }
}

module.exports = { ReauthorizeCredential };
