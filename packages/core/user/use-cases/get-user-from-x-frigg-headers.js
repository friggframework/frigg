const Boom = require('@hapi/boom');
const {
    findAppUsers,
    createMissingAppUsers,
    buildUser,
} = require('../app-user-helpers');
const { getLogger } = require('../../logs');

const log = getLogger('frigg.user.x_frigg_headers');

/**
 * Use case for retrieving or creating a user from x-frigg header identifiers.
 * Supports backend-to-backend API communication using application user IDs.
 *
 * `x-frigg-appOrgId` names the request's active organization (ADR-056 §3.6).
 * A person the organization does not know yet is added to it as a member; the
 * person is never moved out of another organization, and
 * `IndividualUser.organizationId` is set only on a first link.
 *
 * With `user.strictMembership: true` the headers cannot make anyone a member of
 * an organization that already existed: a person who is not already a member
 * (a brand-new `appUserId` included) is refused with 400. The one thing strict
 * mode still allows is naming an organization this request creates, so a first
 * login can bootstrap its own organization. Apps that run strict add people to
 * existing organizations themselves, through the membership repository.
 *
 * `strictUserValidation` is a deprecated alias for `strictMembership`; its
 * meaning changed (it used to reject a mismatched individual/organization pair).
 *
 * @class GetUserFromXFriggHeaders
 */
class GetUserFromXFriggHeaders {
    /**
     * Creates a new GetUserFromXFriggHeaders instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository - Repository for user data operations.
     * @param {import('./ensure-organization-membership').EnsureOrganizationMembership} params.ensureOrganizationMembership
     * @param {Object} params.userConfig - The user config in the app definition.
     */
    constructor({ userRepository, ensureOrganizationMembership, userConfig }) {
        this.userRepository = userRepository;
        this.ensureOrganizationMembership = ensureOrganizationMembership;
        this.userConfig = userConfig;

        const { strictMembership, strictUserValidation } = userConfig ?? {};
        if (strictUserValidation !== undefined && strictMembership === undefined) {
            log.warn(
                'user.strictUserValidation is deprecated and now means strictMembership; rename it',
                { eventName: `${log.name}.strict_user_validation_deprecated` }
            );
        }
        this.strict = Boolean(strictMembership ?? strictUserValidation);
    }

    /**
     * Executes the use case.
     * @async
     * @param {string} [appUserId] - The app user ID from x-frigg-appUserId header.
     * @param {string} [appOrgId] - The app organization ID from x-frigg-appOrgId header.
     * @returns {Promise<import('../user').User>} The authenticated user object.
     * @throws {Boom} 400 Bad Request if neither ID is provided or, in strict mode, if the person is not already a member of the existing organization named.
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

        // Strict mode refuses to make anyone a member of an organization that
        // existed before this request. Only an organization created below is
        // exempt, since it has no members to disagree with.
        const refuseNewMembers = this.strict && Boolean(organizationUserData);

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
            requireExisting: refuseNewMembers,
        });
        if (refuseNewMembers && individualUserData && !ensured.membership) {
            throw Boom.badRequest(
                'Not a member: the user identified by x-frigg-appUserId is not a member of the ' +
                    'organization identified by x-frigg-appOrgId, and strict membership does not ' +
                    'allow these headers to add them.'
            );
        }
        individualUserData = ensured.individual;

        return buildUser(
            this.userConfig,
            individualUserData,
            organizationUserData
        );
    }
}

module.exports = { GetUserFromXFriggHeaders };
