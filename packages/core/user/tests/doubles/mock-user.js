class MockUser {
    constructor() {
        this.individualUser = null;
        this.organizationUser = null;
        this.config = {
            primary: 'individual',
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
}

module.exports = { MockUser }; 