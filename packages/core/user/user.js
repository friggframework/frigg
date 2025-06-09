class User {
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

    isLoggedIn() {
        return Boolean(this.getId());
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