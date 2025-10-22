const Boom = require('@hapi/boom');
const { User } = require('../user');

/**
 * Use case for authenticating requests with shared secret API key.
 * Used for backend-to-backend communication where the secret proves
 * authenticity, and x-frigg headers identify the user/org.
 *
 * This separates authentication (proving legitimacy via API key) from
 * authorization (identifying user/org via x-frigg headers).
 *
 * @class GetUserFromSharedSecret
 */
class GetUserFromSharedSecret {
    /**
     * Creates a new GetUserFromSharedSecret instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({ userRepository, userConfig }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    /**
     * Validates shared secret and extracts user from x-frigg headers.
     * @async
     * @param {string} providedSecret - Secret from x-frigg-api-key header
     * @param {string} [appUserId] - From x-frigg-appuserid header
     * @param {string} [appOrgId] - From x-frigg-apporgid header
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 500 if FRIGG_API_KEY not configured
     * @throws {Boom} 401 if provided secret doesn't match
     * @throws {Boom} 400 if no user identifiers provided or if they refer to different users
     */
    async execute(providedSecret, appUserId, appOrgId) {
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

        // Require at least one user identifier
        if (!appUserId && !appOrgId) {
            throw Boom.badRequest(
                'At least one of x-frigg-appuserid or x-frigg-apporgid headers is required with shared secret authentication'
            );
        }

        // Find or create users (reuse logic from GetUserFromXFriggHeaders)
        let individualUserData = null;
        let organizationUserData = null;

        if (appUserId && this.userConfig.individualUserRequired !== false) {
            individualUserData =
                await this.userRepository.findIndividualUserByAppUserId(
                    appUserId
                );
        }

        if (appOrgId && this.userConfig.organizationUserRequired) {
            organizationUserData =
                await this.userRepository.findOrganizationUserByAppOrgId(
                    appOrgId
                );
        }

        // VALIDATION: If both IDs provided and both users exist, verify they match
        if (
            appUserId &&
            appOrgId &&
            individualUserData &&
            organizationUserData
        ) {
            const individualOrgId =
                individualUserData.organizationUser?.toString();
            const expectedOrgId = organizationUserData.id?.toString();

            if (individualOrgId !== expectedOrgId) {
                throw Boom.badRequest(
                    'User ID mismatch: x-frigg-appuserid and x-frigg-apporgid refer to different users. ' +
                        'Provide only one identifier or ensure they belong to the same user.'
                );
            }
        }

        // Auto-create user if not found
        if (!individualUserData && !organizationUserData) {
            if (appUserId) {
                individualUserData =
                    await this.userRepository.createIndividualUser({
                        appUserId,
                        username: `api-user-${appUserId}`,
                        email: `${appUserId}@api.local`,
                    });
            } else {
                organizationUserData =
                    await this.userRepository.createOrganizationUser({
                        appOrgId,
                    });
            }
        }

        return new User(
            individualUserData,
            organizationUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}

module.exports = { GetUserFromSharedSecret };

