/**
 * Represents a user in the system. The User class is a domain entity,
 * @class User
 */
class User {
    /**
     * Creates a new User instance.
     * @param {Object} options - The options for the user.
     * @param {boolean} [options.usePassword=false] - Whether the user has a password.
     */
    constructor(options = {}) {
        this.individualUser = null;
        this.organizationUser = null;
        this.usePassword = options.usePassword || false;

        this.config = {
            primary: options.primary || 'individual',
            individualUserRequired: options.individualUserRequired ?? true,
            organizationUserRequired: options.organizationUserRequired ?? false,
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