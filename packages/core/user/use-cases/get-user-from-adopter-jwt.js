const Boom = require('@hapi/boom');

/**
 * STUB: Use case for retrieving a user from adopter-provided JWT token.
 *
 * This is a stub implementation for future JWT authentication support.
 * When implemented, this will allow adopters to use their own JWT tokens
 * for authentication instead of Frigg's native token system.
 *
 * FUTURE IMPLEMENTATION REQUIREMENTS:
 * - Validate JWT signature using jwtConfig.secret from app definition
 * - Support configurable signing algorithms (HS256, HS384, HS512, RS256, RS384, RS512)
 * - Extract user identifiers from JWT claims based on jwtConfig.userIdClaim and jwtConfig.orgIdClaim
 * - Find or create user based on extracted claim values
 * - Handle token expiration and validation errors
 * - Support refresh tokens (optional)
 * - Validate user ID conflicts if both individual and org IDs present in JWT
 *
 * RECOMMENDED IMPLEMENTATION:
 * - Use 'jsonwebtoken' package for JWT parsing and validation
 * - Cache JWT public keys for RS* algorithms
 * - Add comprehensive error handling for invalid tokens
 * - Log authentication attempts for security auditing
 *
 * @todo Implement JWT validation with jsonwebtoken package
 * @todo Add unit tests for JWT parsing and claim extraction
 * @todo Document adopter JWT integration guide in Frigg docs
 * @todo Add support for JWT refresh tokens
 * @todo Implement JWT public key caching for RS* algorithms
 *
 * @class GetUserFromAdopterJwt
 */
class GetUserFromAdopterJwt {
    /**
     * Creates a new GetUserFromAdopterJwt instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({ userRepository, userConfig }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} jwtToken - The JWT token from the Authorization header.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 501 Not Implemented - This feature is not yet available.
     */
    async execute(jwtToken) {
        throw Boom.notImplemented(
            'Adopter JWT authentication is not yet implemented. ' +
                'This feature is planned for a future Frigg release. ' +
                'Please use one of the supported authentication modes instead: ' +
                'friggToken (native bearer token) or xFriggHeaders (backend-to-backend with x-frigg-appUserId/appOrgId headers).'
        );

        /* FUTURE IMPLEMENTATION PSEUDOCODE:

        const jwt = require('jsonwebtoken');
        
        // Validate JWT configuration exists
        if (!this.userConfig.jwtConfig || !this.userConfig.jwtConfig.secret) {
            throw Boom.badImplementation('JWT configuration is required when adopterJwt auth mode is enabled');
        }
        
        try {
            // Verify and decode JWT
            const decoded = jwt.verify(jwtToken, this.userConfig.jwtConfig.secret, {
                algorithms: [this.userConfig.jwtConfig.algorithm || 'HS256']
            });
            
            // Extract user identifiers from claims
            const appUserId = decoded[this.userConfig.jwtConfig.userIdClaim || 'sub'];
            const appOrgId = decoded[this.userConfig.jwtConfig.orgIdClaim || 'org_id'];
            
            // At least one identifier required
            if (!appUserId && !appOrgId) {
                throw Boom.badRequest('JWT must contain user or organization identifier claims');
            }
            
            // Find existing users
            let individualUserData = null;
            let organizationUserData = null;
            
            if (appUserId) {
                individualUserData = await this.userRepository.findIndividualUserByAppUserId(appUserId);
            }
            
            if (appOrgId) {
                organizationUserData = await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);
            }
            
            // Validate no conflicts if both IDs present
            if (appUserId && appOrgId && individualUserData && organizationUserData) {
                const individualOrgId = individualUserData.organizationUser?.toString();
                const expectedOrgId = organizationUserData.id?.toString();
                
                if (individualOrgId !== expectedOrgId) {
                    throw Boom.badRequest(
                        'User ID mismatch: JWT claims refer to different users. ' +
                        'Individual and organization IDs must belong to the same user.'
                    );
                }
            }
            
            // Auto-create if not found
            if (!individualUserData && !organizationUserData) {
                if (appUserId) {
                    individualUserData = await this.userRepository.createIndividualUser({
                        appUserId,
                        username: `jwt-user-${appUserId}`,
                        email: decoded.email || `${appUserId}@jwt.local`,
                    });
                } else {
                    organizationUserData = await this.userRepository.createOrganizationUser({
                        appOrgId,
                    });
                }
            }
            
            return new User(
                individualUserData,
                organizationUserData,
                this.userConfig.usePassword,
                this.userConfig.primary,
                this.userConfig.individualUserRequired,
                this.userConfig.organizationUserRequired
            );
            
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw Boom.unauthorized('JWT token has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw Boom.unauthorized('Invalid JWT token');
            } else if (error.isBoom) {
                throw error;
            }
            throw Boom.unauthorized('JWT authentication failed');
        }
        */
    }
}

module.exports = { GetUserFromAdopterJwt };

