const { get } = require('../../assertions');
const Boom = require('@hapi/boom');

/**
 * Use case for creating an individual user.
 * @class CreateIndividualUser
 */
class CreateIndividualUser {
    /**
     * Creates a new CreateIndividualUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository').UserRepository} params.userRepository - Repository for user data operations.
     * @param {import('../user-factory').UserFactory} params.userFactory - Factory for creating User instances
     */
    constructor({ userRepository, userFactory }) {
        this.userRepository = userRepository;
        this.userFactory = userFactory;
    }

    /**
     * Executes the use case.
     * @async
     * @param {Object} params - The parameters for creating the user.
     * @returns {Promise<import('../user').User>} The newly created user object.
     */
    async execute(params) {
        const user = this.userFactory.create();

        let hashword;
        if (user.config.usePassword) {
            hashword = get(params, 'password');
        }

        const email = get(params, 'email', null);
        const username = get(params, 'username', null);
        if (!email && !username) {
            throw Boom.badRequest('email or username is required');
        }

        const appUserId = get(params, 'appUserId', null);
        const organizationUserId = get(params, 'organizationUserId', null);

        user.individualUser = await this.userRepository.createIndividualUser({
            email,
            username,
            hashword,
            appUserId,
            organizationUser: organizationUserId,
        });
        return user;
    }
}

module.exports = { CreateIndividualUser };
