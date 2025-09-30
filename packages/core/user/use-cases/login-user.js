const Boom = require('@hapi/boom');
const {
    RequiredPropertyError,
} = require('../../errors');
const { User } = require('../user');

/**
 * Use case for logging in a user.
 * @class LoginUser
 */
class LoginUser {
    /**
     * Creates a new LoginUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
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

                const individualUserData =
                    await this.userRepository.findIndividualUserByUsername(
                        username
                    );

                if (!individualUserData) {
                    throw Boom.unauthorized('user not found');
                }

                const individualUser = new User(
                    individualUserData,
                    null,
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
                );

                if (!individualUser.isPasswordValid(password)) {
                    throw Boom.unauthorized('Incorrect username or password');
                }

                return individualUser;
            } else {
                const individualUserData =
                    await this.userRepository.findIndividualUserByAppUserId(
                        appUserId
                    );

                if (!individualUserData) {
                    throw Boom.unauthorized('user not found');
                }

                const individualUser = new User(
                    individualUserData,
                    null,
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
                );

                return individualUser;
            }
        }


        if (this.userConfig.organizationUserRequired) {

            const organizationUserData =
                await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);

            if (!organizationUserData) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
            }

            const organizationUser = new User(
                null,
                organizationUserData,
                this.userConfig.usePassword,
                this.userConfig.primary,
                this.userConfig.individualUserRequired,
                this.userConfig.organizationUserRequired
            );

            return organizationUser;
        }

        return null;
    }
}

module.exports = { LoginUser }; 