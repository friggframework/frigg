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

    isPasswordValid(password) {
        if (!this.isPasswordRequired()) {
            return true;
        }

        return bcrypt.compareSync(password, this.getPrimaryUser().hashword);
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
}

module.exports = { User }; 