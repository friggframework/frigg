const Boom = require('@hapi/boom');
const { User } = require('../user');

/**
 * Use case for retrieving or creating a user from x-frigg header identifiers.
 * Supports backend-to-backend API communication using application user IDs.
 *
 * @class GetUserFromXFriggHeaders
 */
class GetUserFromXFriggHeaders {
    /**
     * Creates a new GetUserFromXFriggHeaders instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({ userRepository, userConfig }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} [appUserId] - The app user ID from x-frigg-appUserId header.
     * @param {string} [appOrgId] - The app organization ID from x-frigg-appOrgId header.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 400 Bad Request if neither ID is provided or if both IDs are provided but belong to different users.
     */
    async execute(appUserId, appOrgId) {
        // At least one header must be provided
        if (!appUserId && !appOrgId) {
            throw Boom.badRequest(
                'At least one of x-frigg-appUserId or x-frigg-appOrgId headers is required for backend-to-backend authentication'
            );
        }

        // Find users by both IDs if both are provided
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
            // Check if individual user is linked to the org user
            const individualOrgId =
                individualUserData.organizationUser?.toString();
            const expectedOrgId = organizationUserData.id?.toString();

            if (individualOrgId !== expectedOrgId) {
                throw Boom.badRequest(
                    'User ID mismatch: x-frigg-appUserId and x-frigg-appOrgId refer to different users. ' +
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
                        username: `app-user-${appUserId}`,
                        email: `${appUserId}@app.local`,
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

module.exports = { GetUserFromXFriggHeaders };


