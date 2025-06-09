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
     */
    constructor({ userRepository }) {
        this.userRepository = userRepository;
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

        const user = await this.userRepository.getUserFromToken(token);
        if (!user) {
            throw Boom.unauthorized('Invalid Token');
        }
        return user;
    }
}

module.exports = { GetUserFromBearerToken }; 