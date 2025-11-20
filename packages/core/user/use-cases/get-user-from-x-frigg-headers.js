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
        console.log('🔍 [GetUserFromXFriggHeaders] Input:', {
            appUserId: appUserId || 'undefined',
            appOrgId: appOrgId || 'undefined',
            'userConfig.primary': this.userConfig.primary,
            'userConfig.individualUserRequired': this.userConfig.individualUserRequired,
            'userConfig.organizationUserRequired': this.userConfig.organizationUserRequired,
        });

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
            console.log('🔍 [GetUserFromXFriggHeaders] Looking up individual user by appUserId:', appUserId);
            individualUserData =
                await this.userRepository.findIndividualUserByAppUserId(
                    appUserId
                );
            console.log('🔍 [GetUserFromXFriggHeaders] Individual user found:', individualUserData ? 'Yes ✓' : 'No ✗');
        }

        if (appOrgId && this.userConfig.organizationUserRequired) {
            console.log('🔍 [GetUserFromXFriggHeaders] Looking up organization user by appOrgId:', appOrgId);
            organizationUserData =
                await this.userRepository.findOrganizationUserByAppOrgId(
                    appOrgId
                );
            console.log('🔍 [GetUserFromXFriggHeaders] Organization user found:', organizationUserData ? 'Yes ✓' : 'No ✗');
        } else {
            console.log('🔍 [GetUserFromXFriggHeaders] Skipping organization user lookup:', {
                appOrgId: appOrgId || 'undefined',
                organizationUserRequired: this.userConfig.organizationUserRequired,
            });
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

        // Auto-create users independently if they don't exist and are required
        if (
            !individualUserData &&
            appUserId &&
            this.userConfig.individualUserRequired !== false
        ) {
            console.log('🔍 [GetUserFromXFriggHeaders] Creating individual user with appUserId:', appUserId);
            individualUserData =
                await this.userRepository.createIndividualUser({
                    appUserId,
                    username: `app-user-${appUserId}`,
                    email: `${appUserId}@app.local`,
                });
        }

        if (
            !organizationUserData &&
            appOrgId &&
            this.userConfig.organizationUserRequired
        ) {
            console.log('🔍 [GetUserFromXFriggHeaders] Creating organization user with appOrgId:', appOrgId);
            organizationUserData =
                await this.userRepository.createOrganizationUser({
                    appOrgId,
                });
        }

        console.log('🔍 [GetUserFromXFriggHeaders] Creating User object:', {
            hasIndividualUser: !!individualUserData,
            hasOrganizationUser: !!organizationUserData,
            individualUserId: individualUserData?.id?.toString(),
            organizationUserId: organizationUserData?.id?.toString(),
            primary: this.userConfig.primary,
        });

        const user = new User(
            individualUserData,
            organizationUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );

        console.log('🔍 [GetUserFromXFriggHeaders] User.getId() will return:', user.getId());
        return user;
    }
}

module.exports = { GetUserFromXFriggHeaders };


