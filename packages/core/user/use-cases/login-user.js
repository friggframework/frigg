const Boom = require('@hapi/boom');
const {
    RequiredPropertyError,
} = require('../../errors');

/**
 * Use case for logging in a user.
 * @class LoginUser
 */
class LoginUser {
    /**
     * Creates a new LoginUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository').UserRepository} params.userRepository - Repository for user data operations.
     * @param {Object} params.userConfig - The user properties inside of the app definition.
     */
    constructor({ userRepository, userConfig }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {Object} userCredentials - The user's credentials for authentication.
     * @param {string} [userCredentials.username] - The username for authentication.
     * @param {string} [userCredentials.password] - The password for authentication.
     * @param {string} [userCredentials.appUserId] - The app user id for authentication if no username and password are provided.
     * @param {string} [userCredentials.appOrgId] - The app organization id for authentication if no username and password are provided.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     */
    async execute(userCredentials) {
        const { username, password, appUserId, appOrgId } = userCredentials;
        if (this.userConfig.individualUserRequired) {
            if (this.userConfig.usePassword) {
                if (!username) {
                    throw new RequiredPropertyError({
                        parent: this,
                        key: 'username',
                    });
                }
                if (!password) {
                    throw new RequiredPropertyError({
                        parent: this,
                        key: 'password',
                    });
                }

                const individualUser =
                    await this.userRepository.findIndividualUserByUsername(
                        username
                    );

                if (!individualUser.isPasswordValid(password)) {
                    throw Boom.unauthorized('Incorrect username or password');
                }

                return individualUser;
            } else {
                const individualUser =
                    await this.userRepository.findIndividualUserByAppUserId(
                        appUserId
                    );

                return individualUser;
            }
        }


        if (this.userConfig.organizationUserRequired) {

            const organizationUser =
                await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);

            if (!organizationUser) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
            }

            return organizationUser;
        }

        // todo: check if organizationUserRequired and individualUserRequired can be used at the same time.
        return null;
    }
}

module.exports = { LoginUser }; 