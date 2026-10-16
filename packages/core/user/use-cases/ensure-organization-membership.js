const { getLogger } = require('../../logs');
const { isPresent, implicitMembership } = require('../membership');

const log = getLogger('frigg.user.membership');

/**
 * Makes sure a person is a member of the organization a request is acting in
 * (ADR-056 §3.6). Shared by the adopter-token and x-frigg header paths.
 *
 * - Already a member (a stored row, or the legacy `organizationId` pointer
 *   read as an implicit membership): nothing is written.
 * - Not a member: a membership is added, unless the caller asks for existing
 *   memberships only (`requireExisting`), in which case nothing is written and
 *   `membership` is null so the caller can refuse.
 * - The legacy `organizationId` is set when the person has none (their first
 *   link) and never changed afterwards. It is a pointer for old readers, not
 *   the active organization: that is whichever organization the request names.
 *
 * Adding is an idempotent upsert, so two first logins racing for different
 * organizations both succeed.
 *
 * @class EnsureOrganizationMembership
 */
class EnsureOrganizationMembership {
    /**
     * @param {Object} params
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository
     * @param {import('../repositories/organization-membership-repository-interface').OrganizationMembershipRepositoryInterface} params.organizationMembershipRepository
     */
    constructor({ userRepository, organizationMembershipRepository }) {
        this.userRepository = userRepository;
        this.organizationMembershipRepository = organizationMembershipRepository;
    }

    /**
     * @param {Object} params
     * @param {Object|null} params.individual Individual user as the repository returns it.
     * @param {Object|null} params.organization The active organization user.
     * @param {string|null} [params.orgRole] Role to store with a new membership.
     * @param {boolean} [params.requireExisting=false] Refuse to add.
     * @returns {Promise<{individual: Object|null, membership: Object|null}>}
     *   `individual` may be the updated record (legacy pointer set).
     */
    async execute({
        individual,
        organization,
        orgRole = null,
        requireExisting = false,
    }) {
        // A request that names no organization, or no person (organization-only
        // auth), has no membership to check or add.
        if (!individual || !organization) {
            return { individual, membership: null };
        }

        const existing =
            (await this.organizationMembershipRepository.findMembership(
                individual.id,
                organization.id
            )) ?? implicitMembership(individual, organization.id);
        if (existing) {
            return { individual, membership: existing };
        }
        if (requireExisting) {
            return { individual, membership: null };
        }

        const membership =
            await this.organizationMembershipRepository.addMembership(
                individual.id,
                organization.id,
                { orgRole }
            );
        log.debug('Organization membership added', {
            eventName: `${log.name}.added`,
        });

        // The database repeats this condition in the update itself, so a
        // concurrent first link by another request cannot be overwritten.
        let updated = individual;
        if (!isPresent(individual.organizationId)) {
            updated =
                (await this.userRepository.linkIndividualToOrganizationIfUnset(
                    individual.id,
                    organization.id
                )) ?? individual;
        }
        return { individual: updated, membership };
    }
}

module.exports = { EnsureOrganizationMembership };
