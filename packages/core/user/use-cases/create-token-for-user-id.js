/**
 * Use case for creating a token for a user ID.
 * @class CreateTokenForUserId
 */
class CreateTokenForUserId {
    /**
     * Creates a new CreateTokenForUserId instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../user-repository').UserRepository} params.userRepository - Repository for user data operations.
     */
    constructor({ userRepository }) {
        this.userRepository = userRepository;
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} userId - The ID of the user to create a token for.
     * @param {number} minutes - The number of minutes until the token expires.
     * @returns {Promise<string>} The user token.
     */
    async execute(userId, minutes) {
        return this.userRepository.createToken(userId, minutes);
    }
}

module.exports = { CreateTokenForUserId }; 