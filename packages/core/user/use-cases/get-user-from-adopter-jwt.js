const { getLogger } = require('../../logs');
const { fail } = require('../adopter-jwt-errors');
const {
    findAppUsers,
    createMissingAppUsers,
    buildUser,
    wantsOrganization,
} = require('../app-user-helpers');

const log = getLogger('frigg.user.adopter_jwt');

const idFromClaim = (value) => {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return null;
};

const hasOrganization = (individual) => {
    const id = individual?.organizationId;
    return id !== undefined && id !== null && id !== '';
};

/**
 * Interim rule until the membership table (ADR-056 §3.6): a person belongs to
 * one organization. Callers run this before creating anything, so a refused
 * request leaves no new organization behind.
 *
 * @param {Object|null} individual The individual user as the repository returns it.
 * @param {Object|null} organization The organization the token names, or null
 *   when it does not exist yet.
 * @throws {Boom} 403 `multi_org_unsupported`
 */
function assertSingleOrganization(individual, organization) {
    if (!hasOrganization(individual)) return;
    if (
        organization &&
        String(individual.organizationId) === String(organization.id)
    ) {
        return;
    }
    log.debug('Adopter token names a second organization', {
        eventName: `${log.name}.multi_org_refused`,
    });
    throw fail('multi_org_unsupported');
}

/**
 * Authenticates a request by a token issued by the adopter's own identity
 * system (ADR-056 §2): verifies it, then finds or creates the individual and
 * organization users it names.
 *
 * Two limits, both replaced by the membership package (F4): the first request
 * for a new person can race another and create the user twice (no upsert), and
 * the individual-to-organization link is one-way and set once.
 *
 * @class GetUserFromAdopterJwt
 */
class GetUserFromAdopterJwt {
    /**
     * @param {Object} params
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository
     * @param {Object} params.userConfig - The user config in the app definition.
     * @param {{verify: Function, claimNames: Object}} params.tokenVerifier -
     *   from `createAdopterTokenVerifier`.
     */
    constructor({ userRepository, userConfig, tokenVerifier }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
        this.tokenVerifier = tokenVerifier;
    }

    /**
     * @async
     * @param {string} token - The JWT from the Authorization header.
     * @returns {Promise<import('../user').User>}
     * @throws {Boom} 401 with `data.reason` for a token the verifier refuses
     *   (including `token_missing_user_claim`).
     * @throws {Boom} 403 `multi_org_unsupported`.
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

        const user = await this._findOrCreateUser(appUserId, appOrgId);
        user.setOrgRole(typeof role === 'string' && role !== '' ? role : null);

        log.debug('Adopter token accepted', {
            eventName: `${log.name}.accepted`,
            hasOrganization: Boolean(user.getOrganizationUser()),
        });
        return user;
    }

    async _findOrCreateUser(appUserId, appOrgId) {
        const cfg = this.userConfig;
        const found = await findAppUsers(this.userRepository, cfg, {
            appUserId,
            appOrgId,
        });

        if (wantsOrganization(cfg, appOrgId)) {
            assertSingleOrganization(found.individual, found.organization);
        }

        const { individual: createdIndividual, organization } =
            await createMissingAppUsers(this.userRepository, cfg, {
                appUserId,
                appOrgId,
                ...found,
            });
        let individual = createdIndividual;

        if (individual && organization && !hasOrganization(individual)) {
            individual = await this.userRepository.linkIndividualToOrganization(
                individual.id,
                organization.id
            );
        }
        return buildUser(cfg, individual, organization);
    }
}

module.exports = { GetUserFromAdopterJwt, assertSingleOrganization };
