const Boom = require('@hapi/boom');
const {
    findAppUsers,
    createMissingAppUsers,
    buildUser,
} = require('../app-user-helpers');
const {
    EnsureOrganizationMembership,
} = require('./ensure-organization-membership');

/**
 * Use case for retrieving or creating a user from x-frigg header identifiers.
 * Supports backend-to-backend API communication using application user IDs.
 *
 * `x-frigg-appOrgId` names the request's active organization (ADR-056 §3.6).
 * A person the organization does not know yet is added to it as a member; the
 * person is never moved out of another organization, and
 * `IndividualUser.organizationId` is set only on a first link.
 * `user.strictMembership` (alias `strictUserValidation`) rejects an unknown
 * pairing with 400 instead of adding it, for apps that manage membership
 * themselves.
 *
 * @class GetUserFromXFriggHeaders
 */
class GetUserFromXFriggHeaders {
    /**
     * Creates a new GetUserFromXFriggHeaders instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {import('../repositories/organization-membership-repository-interface').OrganizationMembershipRepositoryInterface} params.organizationMembershipRepository
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({
        userRepository,
        organizationMembershipRepository,
        userConfig,
    }) {
        if (!organizationMembershipRepository) {
            throw new Error(
                'GetUserFromXFriggHeaders requires an organizationMembershipRepository'
            );
        }
        this.userRepository = userRepository;
        this.userConfig = userConfig;
        this.ensureOrganizationMembership = new EnsureOrganizationMembership({
            userRepository,
            organizationMembershipRepository,
        });
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} [appUserId] - The app user ID from x-frigg-appUserId header.
     * @param {string} [appOrgId] - The app organization ID from x-frigg-appOrgId header.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 400 Bad Request if neither ID is provided or, in strict mode, if the person is not a member of the named organization.
     */
    async execute(appUserId, appOrgId) {
        // At least one header must be provided
        if (!appUserId && !appOrgId) {
            throw Boom.badRequest(
                'At least one of x-frigg-appUserId or x-frigg-appOrgId headers is required for backend-to-backend authentication'
            );
        }

        // Find users by both IDs if both are provided
        let { individual: individualUserData, organization: organizationUserData } =
            await findAppUsers(this.userRepository, this.userConfig, {
                appUserId,
                appOrgId,
            });

        // Strict mode only judges a pairing that already exists on both sides:
        // an organization created by this request has no members to disagree.
        const strictPairing =
            this.isStrict() &&
            Boolean(individualUserData) &&
            Boolean(organizationUserData);

        // Auto-create users independently if they don't exist and are required
        const created = await createMissingAppUsers(
            this.userRepository,
            this.userConfig,
            {
                appUserId,
                appOrgId,
                individual: individualUserData,
                organization: organizationUserData,
            }
        );
        individualUserData = created.individual;
        organizationUserData = created.organization;

        // The organization named by the header is the active one: join it
        // rather than re-linking the person's single organizationId.
        const ensured = await this.ensureOrganizationMembership.execute({
            individual: individualUserData,
            organization: organizationUserData,
            requireExisting: strictPairing,
        });
        if (strictPairing && !ensured.membership) {
            throw Boom.badRequest(
                'Organization mismatch: the user identified by x-frigg-appUserId is not a member of the ' +
                    'organization identified by x-frigg-appOrgId. Add the membership or omit x-frigg-appOrgId.'
            );
        }
        individualUserData = ensured.individual;

        return buildUser(
            this.userConfig,
            individualUserData,
            organizationUserData
        );
    }

    isStrict() {
        const { strictMembership, strictUserValidation } = this.userConfig;
        return Boolean(strictMembership ?? strictUserValidation);
    }
}

module.exports = { GetUserFromXFriggHeaders };
