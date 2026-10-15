const { getLogger } = require('../../logs');
const { isPresent } = require('../repositories/organization-membership-model');

const log = getLogger('frigg.user.membership');

/**
 * Makes sure a person is a member of the organization a request is acting in
 * (ADR-056 §3.6). Shared by the adopter-token and x-frigg header paths.
 *
 * - Already a member (a membership row, or the legacy `organizationId`
 *   pointer, which the repository reads as an implicit membership): nothing is
 *   written.
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
        this.membershipRepository = organizationMembershipRepository;
    }

    /**
     * @param {Object} params
     * @param {Object|null} params.individual Individual user as the repository returns it.
     * @param {Object|null} params.organization The active organization user.
     * @param {string|null} [params.role] Organization role to store with a new membership.
     * @param {boolean} [params.requireExisting=false] Refuse to add.
     * @returns {Promise<{individual: Object|null, membership: Object|null, added: boolean}>}
     *   `individual` may be the updated record (legacy pointer set).
     */
    async execute({
        individual,
        organization,
        role = null,
        requireExisting = false,
    }) {
        if (!individual || !organization) {
            return { individual, membership: null, added: false };
        }

        const existing = await this.membershipRepository.findMembership(
            individual.id,
            organization.id
        );
        if (existing) {
            return { individual, membership: existing, added: false };
        }
        if (requireExisting) {
            return { individual, membership: null, added: false };
        }

        const membership = await this.membershipRepository.addMembership(
            individual.id,
            organization.id,
            { role }
        );
        log.debug('Organization membership added', {
            eventName: `${log.name}.added`,
        });

        let updated = individual;
        if (!isPresent(individual.organizationId)) {
            updated = await this.userRepository.linkIndividualToOrganization(
                individual.id,
                organization.id
            );
        }
        return { individual: updated, membership, added: true };
    }
}

module.exports = { EnsureOrganizationMembership };
