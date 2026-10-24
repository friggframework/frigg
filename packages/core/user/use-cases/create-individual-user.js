const { get } = require('../../assertions');
const Boom = require('@hapi/boom');
const { User } = require('../user');

/**
 * Use case for creating an individual user.
 * @class CreateIndividualUser
 */
class CreateIndividualUser {
    /**
     * Creates a new CreateIndividualUser instance.
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
     * @param {Object} params - The parameters for creating the user.
     * @returns {Promise<import('../user').User>} The newly created user object.
     */
    async execute(params) {
        let hashword;
        if (this.userConfig.usePassword) {
            hashword = get(params, 'password');
        }

        const email = get(params, 'email', null);
        const username = get(params, 'username', null);
        if (!email && !username) {
            throw Boom.badRequest('email or username is required');
        }

        const appUserId = get(params, 'appUserId', null);
        const organizationUserId = get(params, 'organizationUserId', null);

        const individualUserData = await this.userRepository.createIndividualUser({
            email,
            username,
            hashword,
            appUserId,
            organizationUser: organizationUserId,
        });

        return new User(
            individualUserData,
            null,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}

module.exports = { CreateIndividualUser };
