const {
    createUserRepository,
} = require('../../user/repositories/user-repository-factory');

const ERROR_CODE_MAP = {
    USER_NOT_FOUND: 404,
    USER_ALREADY_EXISTS: 409,
    INVALID_USER_DATA: 400,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

/**
 * Create user command factory
 *
 * NOTE: This is an internal API. Integration developers should use createFriggCommands() instead.
 *
 * @returns {Object} User command object with CRUD operations
 */
function createUserCommands() {
    const userRepository = createUserRepository({ userConfig: {} });

    return {
        /**
         * Create a new individual user
         * @param {Object} params
         * @param {string} params.username - Username (usually email)
         * @param {string} [params.email] - Email address
         * @param {string} [params.appUserId] - External application user ID
         * @param {string} [params.password] - Password (optional)
         * @returns {Promise<Object>} Created user object
         */
        async createUser({ username, email, appUserId, password } = {}) {
            try {
                if (!username) {
                    const error = new Error('username is required');
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const userData = { username };
                if (email) userData.email = email;
                if (appUserId) userData.appUserId = appUserId;
                if (password) userData.password = password;

                const user = await userRepository.createIndividualUser(
                    userData
                );

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                if (error.code === 11000) {
                    // Duplicate key error
                    const duplicateError = new Error(
                        `User with username '${username}' already exists`
                    );
                    duplicateError.code = 'USER_ALREADY_EXISTS';
                    return mapErrorToResponse(duplicateError);
                }
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find a user by their application user ID
         * @param {string} appUserId - External application user ID
         * @returns {Promise<Object|null>} User object or null if not found
         */
        async findUserByAppUserId(appUserId) {
            try {
                if (!appUserId) {
                    const error = new Error('appUserId is required');
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserByAppUserId(
                    appUserId
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find a user by their username
         * @param {string} username - Username to search for
         * @returns {Promise<Object|null>} User object or null if not found
         */
        async findUserByUsername(username) {
            try {
                if (!username) {
                    const error = new Error('username is required');
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserByUsername(
                    username
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find a user by their ID
         * @param {string} userId - User ID to search for
         * @returns {Promise<Object|null>} User object or null if not found
         */
        async findUserById(userId) {
            try {
                if (!userId) {
                    const error = new Error('userId is required');
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserById(
                    userId
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update a user by ID
         * @param {string} userId - User ID to update
         * @param {Object} updates - Fields to update
         * @returns {Promise<Object>} Updated user object
         */
        async updateUser(userId, updates) {
            try {
                if (!userId) {
                    const error = new Error('userId is required');
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.IndividualUser.update(
                    userId,
                    updates
                );

                if (!user) {
                    const error = new Error(`User ${userId} not found`);
                    error.code = 'USER_NOT_FOUND';
                    throw error;
                }

                return {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = {
    createUserCommands,
    ERROR_CODE_MAP,
};
