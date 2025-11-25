const bcrypt = require('bcryptjs');

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

        this.config = {
            primary,
            individualUserRequired,
            organizationUserRequired,
        };
    }

    getPrimaryUser() {
        if (this.config.primary === 'organization') {
            return this.organizationUser;
        }
        return this.individualUser;
    }

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

module.exports = { User }; 