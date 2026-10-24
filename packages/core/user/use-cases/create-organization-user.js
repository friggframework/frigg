const { get } = require('../../assertions');
const { User } = require('../user');

/**
 * Use case for creating an organization user.
 * @class CreateOrganizationUser
 */
class CreateOrganizationUser {
    /**
     * Creates a new CreateOrganizationUser instance.
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
        const name = get(params, 'name');
        const appOrgId = get(params, 'appOrgId');

        const organizationUserData =
            await this.userRepository.createOrganizationUser({
                name,
                appOrgId,
            });

        return new User(
            null,
            organizationUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}

module.exports = { CreateOrganizationUser }; 