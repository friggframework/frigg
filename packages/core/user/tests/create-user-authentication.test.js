const {
    buildUserAuthentication,
} = require('../create-user-authentication');
const { GetUserFromBearerToken } = require('../use-cases/get-user-from-bearer-token');
const { GetUserFromXFriggHeaders } = require('../use-cases/get-user-from-x-frigg-headers');
const { GetUserFromAdopterJwt } = require('../use-cases/get-user-from-adopter-jwt');
const { EnsureOrganizationMembership } = require('../use-cases/ensure-organization-membership');

describe('buildUserAuthentication', () => {
    const userRepository = {};
    const organizationMembershipRepository = {};
    const tokenVerifier = { verify: jest.fn(), claimNames: {} };
    const userConfig = { primary: 'organization' };

    const build = () =>
        buildUserAuthentication({
            userConfig,
            userRepository,
            organizationMembershipRepository,
            tokenVerifier,
        });

    it('returns the bearer, x-frigg and adopter use cases', () => {
        const built = build();

        expect(built.getUserFromBearerToken).toBeInstanceOf(GetUserFromBearerToken);
        expect(built.getUserFromXFriggHeaders).toBeInstanceOf(GetUserFromXFriggHeaders);
        expect(built.getUserFromAdopterJwt).toBeInstanceOf(GetUserFromAdopterJwt);
    });

    it('gives both header-style paths the same membership use case, built on the repositories it was given', () => {
        const { getUserFromXFriggHeaders, getUserFromAdopterJwt } = build();

        expect(getUserFromXFriggHeaders.ensureOrganizationMembership).toBeInstanceOf(
            EnsureOrganizationMembership
        );
        expect(getUserFromAdopterJwt.ensureOrganizationMembership).toBe(
            getUserFromXFriggHeaders.ensureOrganizationMembership
        );
        const ensure = getUserFromAdopterJwt.ensureOrganizationMembership;
        expect(ensure.userRepository).toBe(userRepository);
        expect(ensure.organizationMembershipRepository).toBe(
            organizationMembershipRepository
        );
    });

    it('passes the token verifier and config through', () => {
        const { getUserFromAdopterJwt, getUserFromXFriggHeaders } = build();

        expect(getUserFromAdopterJwt.tokenVerifier).toBe(tokenVerifier);
        expect(getUserFromAdopterJwt.userConfig).toBe(userConfig);
        expect(getUserFromXFriggHeaders.userConfig).toBe(userConfig);
    });
});
