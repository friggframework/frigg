const Boom = require('@hapi/boom');
const { User } = require('../user');

/**
 * Use case for retrieving a user from a bearer token.
 * @class GetUserFromBearerToken
 */
class GetUserFromBearerToken {
    /**
     * Creates a new GetUserFromBearerToken instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({ userRepository, userConfig }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} bearerToken - The bearer token from the authorization header.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 401 Unauthorized if the token is missing, malformed, or invalid.
     */
    async execute(bearerToken) {
        if (!bearerToken) {
            throw Boom.unauthorized('Missing Authorization Header');
        }

        const token = bearerToken.split(' ')[1]?.trim();
        if (!token) {
            throw Boom.unauthorized('Invalid Token Format');
        }

        const sessionToken = await this.userRepository.getSessionToken(token);

        if (!sessionToken) {
            throw Boom.unauthorized('Session Token Not Found');
        }

        if (this.userConfig.primary === 'organization') {
            const organizationUserData = await this.userRepository.findOrganizationUserById(sessionToken.user);

            if (!organizationUserData) {
                throw Boom.unauthorized('Organization User Not Found');
            }

            return new User(
                null,
                organizationUserData,
                this.userConfig.usePassword,
                this.userConfig.primary,
                this.userConfig.individualUserRequired,
                this.userConfig.organizationUserRequired
            );
        }

        const individualUserData = await this.userRepository.findIndividualUserById(sessionToken.user);

        if (!individualUserData) {
            throw Boom.unauthorized('Individual User Not Found');
        }

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

module.exports = { GetUserFromBearerToken }; 