const bcrypt = require('bcryptjs');
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
     * @param {import('../user-factory').UserFactory} params.userFactory - Factory for creating User instances.
     */
    constructor({ userRepository, userFactory }) {
        this.userRepository = userRepository;
        this.userFactory = userFactory;
    }

    /**
     * Executes the use case.
     * @async
     * @param {Object} userCredentials - The user's credentials for authentication.
     * @param {string} [userCredentials.username] - The username for authentication.
     * @param {string} [userCredentials.password] - The password for authentication.
     * @param {string} [userCredentials.appUserId] - The app user id for authentication.
     * @param {string} [userCredentials.appOrgId] - The app organization id for authentication.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     */
    async execute(userCredentials) {
        const { username, password, appUserId, appOrgId } = userCredentials;
        const user = this.userFactory.create();

        if (user.isIndividualUserRequired()) {
            if (user.isPasswordRequired()) {
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

                if (!individualUser) {
                    throw Boom.unauthorized('incorrect username or password');
                }

                const isValid = bcrypt.compareSync(
                    password,
                    individualUser.hashword
                );

                if (!isValid) {
                    throw Boom.unauthorized('incorrect username or password');
                }

                user.setIndividualUser(individualUser);
            } else {
                const individualUser =
                    await this.userRepository.findIndividualUserByAppUserId(
                        appUserId
                    );

                user.setIndividualUser(individualUser);
            }

            if (!user.getIndividualUser()) {
                throw Boom.unauthorized('user not found');
            }
        }


        if (user.isOrganizationUserRequired()) {

            const organizationUser =
                await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);

            if (!organizationUser) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
            }

            user.setOrganizationUser(organizationUser);
        }

        return user;
    }
}

module.exports = { LoginUser }; 