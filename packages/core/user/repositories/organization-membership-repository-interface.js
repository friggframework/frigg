/**
 * Organization Membership Repository Interface (ADR-056 §3.6).
 *
 * Atomic persistence of "this person belongs to that organization". No policy:
 * deciding whether a person may join, or which organization is active, belongs
 * to the use cases.
 *
 * Backfill: `IndividualUser.organizationId` (the legacy single-org pointer) is
 * not copied into this table. Every adapter reads it as an implicit membership
 * (`implicit: true`) so a person linked before memberships existed stays a
 * member of that organization without a data migration.
 *
 * @abstract
 */
class OrganizationMembershipRepositoryInterface {
    /**
     * @param {string|number} individualUserId
     * @param {string|number} organizationUserId
     * @returns {Promise<Object|null>} The membership, or a synthesised one
     *   (`implicit: true`) when only the legacy pointer names the organization,
     *   or null.
     * @abstract
     */
    async findMembership(individualUserId, organizationUserId) {
        throw new Error('Method findMembership must be implemented by subclass');
    }

    /**
     * Adds a membership if there is none; never changes an existing one.
     * Idempotent, and safe against a concurrent identical call: both resolve
     * to the same row.
     *
     * @param {string|number} individualUserId
     * @param {string|number} organizationUserId
     * @param {Object} [options]
     * @param {string|null} [options.role] Stored only when the row is created.
     * @returns {Promise<Object>} The (explicit) membership.
     * @abstract
     */
    async addMembership(individualUserId, organizationUserId, options) {
        throw new Error('Method addMembership must be implemented by subclass');
    }

    /**
     * Every organization the person belongs to: membership rows, plus the
     * legacy pointer's organization (`implicit: true`) when no row names it.
     *
     * @param {string|number} individualUserId
     * @returns {Promise<Object[]>}
     * @abstract
     */
    async listMembershipsForIndividual(individualUserId) {
        throw new Error(
            'Method listMembershipsForIndividual must be implemented by subclass'
        );
    }
}

module.exports = { OrganizationMembershipRepositoryInterface };
