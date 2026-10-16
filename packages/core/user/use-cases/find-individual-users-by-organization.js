const { sameId } = require('../membership');

/**
 * The individual users who belong to an organization (ADR-056 §3.6): the
 * people with a stored membership, plus those the legacy
 * `IndividualUser.organizationId` pointer places there, each once.
 *
 * Both repositories stay atomic; the union is composed here. Reading only the
 * legacy pointer would list a person in the first organization they ever
 * joined and in no other.
 *
 * @class FindIndividualUsersByOrganization
 */
class FindIndividualUsersByOrganization {
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
     * @param {string|number} organizationUserId
     * @returns {Promise<Object[]>} Individual users, legacy-pointer people first.
     */
    async execute(organizationUserId) {
        const [legacy, memberships] = await Promise.all([
            this.userRepository.findIndividualUsersByOrganizationId(
                organizationUserId
            ),
            this.organizationMembershipRepository.listMembershipsForOrganization(
                organizationUserId
            ),
        ]);

        const users = [...(legacy || [])];
        for (const { individualUserId } of memberships) {
            if (users.some((u) => sameId(u.id ?? u._id, individualUserId))) {
                continue;
            }
            const individual = await this.userRepository.findIndividualUserById(
                individualUserId
            );
            // A membership whose person was deleted is skipped, not an error.
            if (individual) users.push(individual);
        }
        return users;
    }
}

module.exports = { FindIndividualUsersByOrganization };
