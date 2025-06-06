const bcrypt = require('bcryptjs');
const Boom = require('@hapi/boom');
const { get } = require('../../assertions');

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
     * @param {Object} params - The parameters for logging in the user.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     */
    async execute(params) {
        const user = this.userFactory.create();

        if (user.config.usePassword) {
            const username = get(params, 'username');
            const password = get(params, 'password');

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
            user.individualUser = individualUser;
        } else {
            const appUserId = get(params, 'appUserId', null);
            user.individualUser =
                await this.userRepository.findIndividualUserByAppUserId(
                    appUserId
                );
        }

        const appOrgId = get(params, 'appOrgId', null);
        user.organizationUser =
            await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);

        if (user.config.individualUserRequired) {
            if (!user.individualUser) {
                throw Boom.unauthorized('user not found');
            }
        }

        if (user.config.organizationUserRequired) {
            if (!user.organizationUser) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
            }
        }
        return user;
    }
}

module.exports = { LoginUser }; 