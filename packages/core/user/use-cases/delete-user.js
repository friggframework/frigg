const { get } = require('../../assertions');
const Boom = require('@hapi/boom');

/**
 * Use case for deleting a user.
 * @class DeleteUser
 */
class DeleteUser {
    /**
     * Creates a new DeleteUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     */
    constructor({ userRepository }) {
        this.userRepository = userRepository;
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} userId - The ID of the user to delete.
     * @returns {Promise<boolean>} True if user was deleted successfully.
     * @throws {Boom} If userId is not provided or user not found.
     */
    async execute(userId) {
        if (!userId) {
            throw Boom.badRequest('userId is required');
        }

        // First check if user exists
        const user = await this.userRepository.findUserById(userId);
        if (!user) {
            throw Boom.notFound(`User with id ${userId} not found`);
        }

        // Delete the user
        const deleted = await this.userRepository.deleteUser(userId);

        if (!deleted) {
            throw Boom.internal(`Failed to delete user with id ${userId}`);
        }

        return true;
    }
}

module.exports = { DeleteUser };
