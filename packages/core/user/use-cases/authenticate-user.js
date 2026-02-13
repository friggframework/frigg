const Boom = require('@hapi/boom');

/**
 * Use case for authenticating a user using multiple authentication strategies.
 * 
 * Supports three authentication modes in priority order:
 * 1. Shared Secret (backend-to-backend with x-frigg-api-key + x-frigg headers)
 * 2. Adopter JWT (custom JWT authentication)
 * 3. Frigg Native Token (bearer token from /user/login)
 * 
 * x-frigg-appUserId and x-frigg-appOrgId headers are automatically supported
 * for user identification with any auth mode. When present with JWT or Frigg
 * tokens, they are validated to match the authenticated user.
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
     * @param {import('./authenticate-with-shared-secret').AuthenticateWithSharedSecret} params.authenticateWithSharedSecret - Use case for validating shared secret.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
        authenticateWithSharedSecret,
        userConfig,
    }) {
        this.getUserFromBearerToken = getUserFromBearerToken;
        this.getUserFromXFriggHeaders = getUserFromXFriggHeaders;
        this.getUserFromAdopterJwt = getUserFromAdopterJwt;
        this.authenticateWithSharedSecret = authenticateWithSharedSecret;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {Object} req - Express request object with headers.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} Unauthorized if no valid authentication provided.
     * @throws {Boom} Forbidden if x-frigg headers don't match authenticated user.
     */
    async execute(req) {
        const authModes = this.userConfig.authModes || { friggToken: true };
        const appUserId = req.headers['x-frigg-appuserid'];
        const appOrgId = req.headers['x-frigg-apporgid'];
        let user = null;

        // DEBUG: Log ALL request headers to catch misspellings
        const allHeaders = Object.entries(req.headers).reduce((acc, [key, value]) => {
            if (key === 'x-frigg-api-key' || key === 'authorization') {
                acc[key] = `${String(value).substring(0, 6)}...(redacted)`;
            } else {
                acc[key] = value;
            }
            return acc;
        }, {});
        console.log(`[Frigg][DEBUG] ${req.method} ${req.path} - ALL headers:`, JSON.stringify(allHeaders));
        console.log(`[Frigg][DEBUG] Parsed auth values:`, JSON.stringify({
            appUserId: appUserId ?? '(undefined)',
            appOrgId: appOrgId ?? '(undefined)',
            enabledAuthModes: authModes,
        }));

        // Priority 1: Shared Secret (backend-to-backend with API key)
        if (authModes.sharedSecret !== false) {
            const apiKey = req.headers['x-frigg-api-key'];
            if (apiKey) {
                console.log(`[Frigg][DEBUG] Taking shared secret auth path`);
                // Validate the API key (authentication)
                await this.authenticateWithSharedSecret.execute(apiKey);
                // Get user from x-frigg headers (authorization)
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
                user = await this.getUserFromAdopterJwt.execute(token);
                // Validate x-frigg headers match JWT claims if present
                if (appUserId || appOrgId) {
                    this.validateUserMatch(user, appUserId, appOrgId);
                }
                return user;
            }
        }

        // Priority 3: Frigg native token (default)
        if (authModes.friggToken !== false && req.headers.authorization) {
            user = await this.getUserFromBearerToken.execute(
                req.headers.authorization
            );
            // Validate x-frigg headers match token user if present
            if (appUserId || appOrgId) {
                this.validateUserMatch(user, appUserId, appOrgId);
            }
            return user;
        }

        throw Boom.unauthorized('No valid authentication provided');
    }

    /**
     * Validates that x-frigg headers match authenticated user if provided.
     * This ensures that when both authentication (via token/JWT) and
     * x-frigg headers are present, they refer to the same user.
     *
     * @param {import('../user').User} user - The authenticated user
     * @param {string} [appUserId] - The x-frigg-appuserid header value
     * @param {string} [appOrgId] - The x-frigg-apporgid header value
     * @throws {Boom} 403 Forbidden if headers don't match user
     */
    validateUserMatch(user, appUserId, appOrgId) {
        if (appUserId && user.getAppUserId() !== appUserId) {
            throw Boom.forbidden(
                'x-frigg-appuserid header does not match authenticated user'
            );
        }
        if (appOrgId && user.getAppOrgId() !== appOrgId) {
            throw Boom.forbidden(
                'x-frigg-apporgid header does not match authenticated user'
            );
        }
    }
}

module.exports = { AuthenticateUser };


