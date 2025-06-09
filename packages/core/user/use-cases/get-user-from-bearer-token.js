const Boom = require('@hapi/boom');

/**
 * Use case for retrieving a user from a bearer token.
 * @class GetUserFromBearerToken
 */
class GetUserFromBearerToken {
    /**
     * Creates a new GetUserFromBearerToken instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository').UserRepository} params.userRepository - Repository for user data operations.
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
            return this.userRepository.findOrganizationUserById(sessionToken.user);
        }

        return this.userRepository.findIndividualUserById(sessionToken.user);
    }
}

module.exports = { GetUserFromBearerToken }; 