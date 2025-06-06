const { get } = require('../../assertions');

// todo: this is not used anywhere, check if needed
/**
 * Use case for creating an organization user.
 * @class CreateOrganizationUser
 */
class CreateOrganizationUser {
    /**
     * Creates a new CreateOrganizationUser instance.
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
        const name = get(params, 'name');
        const appOrgId = get(params, 'appOrgId');
        const user = this.userFactory.create();
        user.organizationUser =
            await this.userRepository.createOrganizationUser({
                name,
                appOrgId,
            });
        return user;
    }
}

module.exports = { CreateOrganizationUser }; 