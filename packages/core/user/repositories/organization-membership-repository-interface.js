/**
 * Organization Membership Repository Interface (ADR-056 §3.6).
 *
 * Atomic persistence of "this person belongs to that organization": a row or
 * nothing. No policy and no reading of `IndividualUser.organizationId`: the
 * legacy pointer counts as an implicit membership, and that rule lives in the
 * domain (`user/membership.js`), applied by the use cases.
 *
 * Every method returns String ids whatever the database stores.
 *
 * @abstract
 */
class OrganizationMembershipRepositoryInterface {
    /**
     * @param {string|number} individualUserId
     * @param {string|number} organizationUserId
     * @returns {Promise<Object|null>} The stored membership, or null.
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
     * @param {string|null} [options.orgRole] Stored only when the row is
     *   created; defaults to `MEMBER`.
     * @returns {Promise<Object>} The stored membership.
     * @abstract
     */
    async addMembership(individualUserId, organizationUserId, options) {
        throw new Error('Method addMembership must be implemented by subclass');
    }

    /**
     * Stored memberships of an organization, oldest first. Rows only: people
     * who are in the organization through the legacy pointer alone are not
     * here.
     *
     * @param {string|number} organizationUserId
     * @returns {Promise<Object[]>}
     * @abstract
     */
    async listMembershipsForOrganization(organizationUserId) {
        throw new Error(
            'Method listMembershipsForOrganization must be implemented by subclass'
        );
    }
}

module.exports = { OrganizationMembershipRepositoryInterface };
