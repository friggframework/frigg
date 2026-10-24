const bcrypt = require('bcryptjs');

/**
 * How the request that produced a `User` proved who it is. Set by
 * AuthenticateUser, never inferred from a missing value. Organization roles
 * (ADR-056 §3, §3.6) depend on it: a shared-secret caller is the app's own
 * backend and is trusted to manage; a Frigg bearer token keeps its pre-roles
 * behaviour unless the app opts in (`user.orgAdminGateBearerTokens`); an
 * adopter token has the role it carries, else the stored membership role,
 * else `MEMBER`.
 */
const AUTH_SOURCES = Object.freeze({
    SHARED_SECRET: 'shared-secret',
    ADOPTER_JWT: 'adopter-jwt',
    BEARER_TOKEN: 'bearer-token',
});

/**
 * Represents a user in the system. The User class is a domain entity,
 * @class User
 */
class User {
    /**
     * Creates a new User instance.
     * @param {import('../database/models/IndividualUser').IndividualUser} [individualUser=null] - The individual user for the user.
     * @param {import('../database/models/OrganizationUser').OrganizationUser} [organizationUser=null] - The organization user for the user.
     * @param {boolean} [usePassword=false] - Whether the user has a password.
     * @param {string} [primary='individual'] - The primary user type.
     * @param {boolean} [individualUserRequired=true] - Whether the user is required to have an individual user.
     * @param {boolean} [organizationUserRequired=false] - Whether the user is required to have an organization user.
     */
    constructor(individualUser = null, organizationUser = null, usePassword = false, primary = 'individual', individualUserRequired = true, organizationUserRequired = false) {
        this.individualUser = individualUser;
        this.organizationUser = organizationUser;
        this.usePassword = usePassword;
        // Organization role from an adopter token claim (ADR-056 §2), per
        // request. When present it wins over the stored membership role.
        this.orgRole = null;
        // The role stored on the person's membership of the active organization
        // (OrganizationMembership.orgRole); used when the token carries none.
        this.membershipRole = null;
        // How this request authenticated (one of AUTH_SOURCES); null until AuthenticateUser says.
        this.authSource = null;

        this.config = {
            primary,
            individualUserRequired,
            organizationUserRequired,
        };
    }

    /**
     * The organization this request acts in (ADR-056 §3.6): the one the token or
     * `x-frigg-appOrgId` named, not the person's legacy `organizationId`
     * pointer. Null when the request has no organization.
     * @returns {string|null}
     */
    getActiveOrganizationId() {
        const id = this.organizationUser?.id;
        return id === undefined || id === null || id === '' ? null : String(id);
    }

    getPrimaryUser() {
        if (this.config.primary === 'organization') {
            return this.organizationUser;
        }
        return this.individualUser;
    }

    /**
     * The id of the primary user. With `primary: 'organization'` this is the
     * active organization (the one the request named), never the organization
     * the person was first linked to.
     */
    getId() {
        return this.getPrimaryUser()?.id;
    }

    isPasswordRequired() {
        return this.usePassword;
    }

    async isPasswordValid(password) {
        if (!this.isPasswordRequired()) {
            return true;
        }

        return await bcrypt.compare(password, this.getPrimaryUser().hashword);
    }

    setIndividualUser(individualUser) {
        this.individualUser = individualUser;
    }

    setOrganizationUser(organizationUser) {
        this.organizationUser = organizationUser;
    }

    isOrganizationUserRequired() {
        return this.config.organizationUserRequired;
    }

    isIndividualUserRequired() {
        return this.config.individualUserRequired;
    }

    getAuthSource() {
        return this.authSource;
    }

    setAuthSource(authSource) {
        this.authSource = authSource ?? null;
    }

    getOrgRole() {
        return this.orgRole;
    }

    setOrgRole(orgRole) {
        this.orgRole = orgRole ?? null;
    }

    getMembershipRole() {
        return this.membershipRole;
    }

    setMembershipRole(membershipRole) {
        this.membershipRole = membershipRole ?? null;
    }

    getIndividualUser() {
        return this.individualUser;
    }

    getOrganizationUser() {
        return this.organizationUser;
    }

    /**
     * Gets the appUserId from the individual user if present.
     * @returns {string|null} The app user ID or null
     */
    getAppUserId() {
        return this.individualUser?.appUserId || null;
    }

    /**
     * Gets the appOrgId from the organization user if present.
     * @returns {string|null} The app organization ID or null
     */
    getAppOrgId() {
        return this.organizationUser?.appOrgId || null;
    }

    /**
     * Checks if a given userId belongs to this user (either primary or linked).
     * When primary is 'organization', entities owned by the linked individual user
     * should still be accessible to the organization.
     *
     * @param {string|number} userId - The userId to check
     * @returns {boolean} True if the userId belongs to this user or their linked user
     */
    ownsUserId(userId) {
        const userIdStr = userId?.toString();
        const primaryId = this.getPrimaryUser()?.id?.toString();
        const individualId = this.individualUser?.id?.toString();
        const organizationId = this.organizationUser?.id?.toString();

        // Check if userId matches primary user
        if (userIdStr === primaryId) {
            return true;
        }

        // When primary is 'organization', also check linked individual user
        if (this.config.primary === 'organization' && userIdStr === individualId) {
            return true;
        }

        // When primary is 'individual', also check linked organization user if required
        if (this.config.primary === 'individual' && this.config.organizationUserRequired && userIdStr === organizationId) {
            return true;
        }

        return false;
    }
}

module.exports = { User, AUTH_SOURCES }; 