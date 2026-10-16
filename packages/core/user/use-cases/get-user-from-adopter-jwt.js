const { getLogger } = require('../../logs');
const { fail } = require('../adopter-jwt-errors');
const {
    findAppUsers,
    createMissingAppUsers,
    buildUser,
} = require('../app-user-helpers');

const log = getLogger('frigg.user.adopter_jwt');

const idFromClaim = (value) => {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return null;
};

/**
 * Authenticates a request by a token issued by the adopter's own identity
 * system (ADR-056 §2): verifies it, then finds or creates the individual and
 * organization users it names.
 *
 * The organization the token names is the request's active organization
 * (ADR-056 §3.6). A person who is not yet a member of it becomes one; a person
 * can belong to several, and `IndividualUser.organizationId` is never moved
 * (see EnsureOrganizationMembership). Two first logins racing for the same new
 * person or organization both succeed: a create that loses to a unique
 * constraint finds the winner's row.
 *
 * @class GetUserFromAdopterJwt
 */
class GetUserFromAdopterJwt {
    /**
     * @param {Object} params
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository
     * @param {Object} params.userConfig - The user config in the app definition.
     * @param {import('./ensure-organization-membership').EnsureOrganizationMembership} params.ensureOrganizationMembership
     * @param {{verify: Function, claimNames: Object}} params.tokenVerifier -
     *   from `createAdopterTokenVerifier`.
     */
    constructor({
        userRepository,
        ensureOrganizationMembership,
        userConfig,
        tokenVerifier,
    }) {
        this.userRepository = userRepository;
        this.ensureOrganizationMembership = ensureOrganizationMembership;
        this.userConfig = userConfig;
        this.tokenVerifier = tokenVerifier;
    }

    /**
     * @async
     * @param {string} token - The JWT from the Authorization header.
     * @returns {Promise<import('../user').User>}
     * @throws {Boom} 401 with `data.reason` for a token the verifier refuses
     *   (including `token_missing_user_claim`).
     * @throws {Boom} 503 `jwks_unavailable`, 500 `jwt_config_invalid` (from the verifier).
     */
    async execute(token) {
        const claims = await this.tokenVerifier.verify(token);
        const { userIdClaim, orgIdClaim, roleClaim } =
            this.tokenVerifier.claimNames;

        const appUserId = idFromClaim(claims[userIdClaim]);
        if (!appUserId) throw fail('token_missing_user_claim');

        const rawOrgId = claims[orgIdClaim];
        const appOrgId = idFromClaim(rawOrgId);
        if (rawOrgId !== undefined && rawOrgId !== null && !appOrgId) {
            throw fail('token_malformed');
        }
        const role = claims[roleClaim];

        const orgRole = typeof role === 'string' && role !== '' ? role : null;
        const user = await this._findOrCreateUser(appUserId, appOrgId, orgRole);
        user.setOrgRole(orgRole);

        log.debug('Adopter token accepted', {
            eventName: `${log.name}.accepted`,
            hasOrganization: Boolean(user.getOrganizationUser()),
        });
        return user;
    }

    async _findOrCreateUser(appUserId, appOrgId, orgRole) {
        const cfg = this.userConfig;
        const found = await findAppUsers(this.userRepository, cfg, {
            appUserId,
            appOrgId,
        });
        const created = await createMissingAppUsers(this.userRepository, cfg, {
            appUserId,
            appOrgId,
            ...found,
        });

        // The token's organization is the active one whether or not this is
        // the person's first time in it.
        const { individual } = await this.ensureOrganizationMembership.execute({
            individual: created.individual,
            organization: created.organization,
            orgRole,
        });
        return buildUser(cfg, individual, created.organization);
    }
}

module.exports = { GetUserFromAdopterJwt };
