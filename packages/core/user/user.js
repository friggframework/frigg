class User {
    constructor(options = {}) {
        this.individualUser = null;
        this.organizationUser = null;

        this.config = {
            primary: options.primary || 'individual',
            individualUserRequired:
                options.individualUserRequired !== undefined
                    ? options.individualUserRequired
                    : true,
            organizationUserRequired:
                options.organizationUserRequired !== undefined
                    ? options.organizationUserRequired
                    : false,
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
}

module.exports = { User }; 