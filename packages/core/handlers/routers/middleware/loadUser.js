const catchAsyncError = require('express-async-handler');
const { GetUserFromBearerToken } = require('../../../user/use-cases/get-user-from-bearer-token');
const {
    createUserRepository,
} = require('../../../user/repositories/user-repository-factory');
const { loadAppDefinition } = require('../../app-definition-loader');

/**
 * Load user from bearer token middleware
 * Uses DDD pattern: Handler → Use Case → Repository
 */
module.exports = catchAsyncError(async (req, res, next) => {
    const authorizationHeader = req.headers.authorization;

    if (authorizationHeader) {
        // Initialize dependencies following DDD pattern
        const { userConfig } = loadAppDefinition();
        const userRepository = createUserRepository({ userConfig });
        const getUserFromBearerToken = new GetUserFromBearerToken({
            userRepository,
            userConfig,
        });

        try {
            // Execute use case to load user
            req.user = await getUserFromBearerToken.execute(authorizationHeader);
        } catch (error) {
            // Don't fail - just leave req.user undefined
            // Let requireLoggedInUser middleware handle auth failures
            console.debug('Failed to load user from token:', error.message);
        }
    }

    return next();
});
