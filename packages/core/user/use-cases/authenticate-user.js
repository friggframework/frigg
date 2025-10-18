const Boom = require('@hapi/boom');

/**
 * Use case for authenticating a user using multiple authentication strategies.
 * Supports Frigg native tokens, x-frigg headers, and adopter JWT (when implemented).
 * Tries authentication methods in priority order based on userConfig.authModes.
 *
 * @class AuthenticateUser
 */
class AuthenticateUser {
    /**
     * Creates a new AuthenticateUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('./get-user-from-bearer-token').GetUserFromBearerToken} params.getUserFromBearerToken - Use case for bearer token auth.
     * @param {import('./get-user-from-x-frigg-headers').GetUserFromXFriggHeaders} params.getUserFromXFriggHeaders - Use case for x-frigg header auth.
     * @param {import('./get-user-from-adopter-jwt').GetUserFromAdopterJwt} params.getUserFromAdopterJwt - Use case for adopter JWT auth.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
        userConfig,
    }) {
        this.getUserFromBearerToken = getUserFromBearerToken;
        this.getUserFromXFriggHeaders = getUserFromXFriggHeaders;
        this.getUserFromAdopterJwt = getUserFromAdopterJwt;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {Object} req - Express request object with headers.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} Unauthorized if no valid authentication provided.
     */
    async execute(req) {
        const authModes = this.userConfig.authModes || { friggToken: true };

        // Priority 1: x-frigg headers (backend-to-backend)
        if (authModes.xFriggHeaders !== false) {
            const appUserId = req.headers['x-frigg-appuserid'];
            const appOrgId = req.headers['x-frigg-apporgid'];

            if (appUserId || appOrgId) {
                return await this.getUserFromXFriggHeaders.execute(
                    appUserId,
                    appOrgId
                );
            }
        }

        // Priority 2: Adopter JWT (if enabled)
        if (
            authModes.adopterJwt === true &&
            req.headers.authorization?.startsWith('Bearer ')
        ) {
            const token = req.headers.authorization.split(' ')[1];
            // Detect JWT format (3 parts separated by dots)
            if (token && token.split('.').length === 3) {
                return await this.getUserFromAdopterJwt.execute(token);
            }
        }

        // Priority 3: Frigg native token (default)
        if (authModes.friggToken !== false) {
            return await this.getUserFromBearerToken.execute(
                req.headers.authorization
            );
        }

        throw Boom.unauthorized('No valid authentication provided');
    }
}

module.exports = { AuthenticateUser };

