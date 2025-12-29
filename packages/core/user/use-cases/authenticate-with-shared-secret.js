const Boom = require('@hapi/boom');

/**
 * Use case for authenticating requests with shared secret API key.
 * This use case ONLY validates the authenticity of the request via API key.
 * It does NOT retrieve user data - that's handled by GetUserFromXFriggHeaders.
 *
 * Used for backend-to-backend communication where the secret proves
 * the request is legitimate, but user identification comes from x-frigg headers.
 *
 * @class AuthenticateWithSharedSecret
 */
class AuthenticateWithSharedSecret {
    /**
     * Creates a new AuthenticateWithSharedSecret instance.
     * @param {Object} params - Configuration parameters (none needed currently, but kept for consistency).
     */
    constructor() {
        // No dependencies needed - just validates against env var
    }

    /**
     * Validates the provided shared secret against FRIGG_API_KEY.
     * @async
     * @param {string} providedSecret - Secret from x-frigg-api-key header
     * @returns {Promise<boolean>} True if valid (or throws error if invalid)
     * @throws {Boom} 500 if FRIGG_API_KEY not configured
     * @throws {Boom} 401 if provided secret doesn't match
     */
    async execute(providedSecret) {
        // Validate secret
        const expectedSecret = process.env.FRIGG_API_KEY;
        if (!expectedSecret) {
            throw Boom.badImplementation(
                'FRIGG_API_KEY environment variable is not configured. ' +
                    'Set FRIGG_API_KEY to enable shared secret authentication.'
            );
        }

        if (!providedSecret || providedSecret !== expectedSecret) {
            throw Boom.unauthorized('Invalid API key');
        }

        return true;
    }
}

module.exports = { AuthenticateWithSharedSecret };
