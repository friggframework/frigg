const {
    createUserRepository,
} = require('./repositories/user-repository-factory');
const {
    createOrganizationMembershipRepository,
} = require('./repositories/organization-membership-repository-factory');
const { createAdopterTokenVerifier } = require('./adopter-token-verifier');
const { GetUserFromBearerToken } = require('./use-cases/get-user-from-bearer-token');
const {
    GetUserFromXFriggHeaders,
} = require('./use-cases/get-user-from-x-frigg-headers');
const { GetUserFromAdopterJwt } = require('./use-cases/get-user-from-adopter-jwt');
const {
    EnsureOrganizationMembership,
} = require('./use-cases/ensure-organization-membership');

/**
 * Composition root for the three "who is this request" use cases, so the
 * Lambda integration router and the Management API v2 wire them identically.
 *
 * @param {Object} params
 * @param {Object} params.userConfig The `user` block of the app definition.
 * @param {Object} [params.userRepository] Defaults to the configured database's.
 * @param {Object} [params.organizationMembershipRepository] Defaults to the configured database's.
 * @param {{verify: Function, claimNames: Object}} [params.tokenVerifier]
 *   Defaults to a verifier for `userConfig.jwtConfig`.
 * @returns {{
 *   getUserFromBearerToken: GetUserFromBearerToken,
 *   getUserFromXFriggHeaders: GetUserFromXFriggHeaders,
 *   getUserFromAdopterJwt: GetUserFromAdopterJwt,
 * }}
 */
function buildUserAuthentication({
    userConfig,
    userRepository = createUserRepository(),
    organizationMembershipRepository = createOrganizationMembershipRepository(),
    tokenVerifier = createAdopterTokenVerifier({
        jwtConfig: userConfig?.jwtConfig,
    }),
}) {
    const ensureOrganizationMembership = new EnsureOrganizationMembership({
        userRepository,
        organizationMembershipRepository,
    });
    return {
        getUserFromBearerToken: new GetUserFromBearerToken({
            userRepository,
            userConfig,
        }),
        getUserFromXFriggHeaders: new GetUserFromXFriggHeaders({
            userRepository,
            ensureOrganizationMembership,
            userConfig,
        }),
        getUserFromAdopterJwt: new GetUserFromAdopterJwt({
            userRepository,
            ensureOrganizationMembership,
            userConfig,
            tokenVerifier,
        }),
    };
}

module.exports = { buildUserAuthentication };
