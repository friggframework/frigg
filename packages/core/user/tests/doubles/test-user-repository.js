const { MockUser } = require('./mock-user');

class TestUserRepository {
    constructor() {
        this.usersByToken = new Map();
        this.individualUsers = new Map();
        this.organizationUsers = new Map();
        this.tokens = new Map();
    }

    async getUserFromToken(token) {
        const userId = this.tokens.get(token);
        // This is a simplified lookup for testing purposes
        return this.individualUsers.get(userId) || this.organizationUsers.get(userId) || null;
    }

    async createToken(userId, minutes = 120) {
        // In a real scenario, the token would be more complex and unique
        const token = `token-for-${userId}-for-${minutes}-mins`;
        this.tokens.set(token, userId);
        return token;
    }

    async createIndividualUser(params) {
        const user = new MockUser();
        user.individualUser = { ...params, id: `individual-${Date.now()}` };
        this.individualUsers.set(user.getId(), user);
        return user.individualUser;
    }

    async createOrganizationUser(params) {
        const user = new MockUser();
        user.organizationUser = { ...params, id: `org-${Date.now()}` };
        this.organizationUsers.set(user.getId(), user);
        return user.organizationUser;
    }

    async findIndividualUserByUsername(username) {
        for (const user of this.individualUsers.values()) {
            if (user.individualUser.username === username) {
                // Return the sub-document to mimic Mongoose behavior
                return user.individualUser;
            }
        }
        return null;
    }

    async findIndividualUserByAppUserId(appUserId) {
        if (!appUserId) return null;
        for (const user of this.individualUsers.values()) {
            if (user.individualUser.appUserId === appUserId) {
                return user.individualUser;
            }
        }
        return null;
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        if (!appOrgId) return null;
        for (const user of this.organizationUsers.values()) {
            if (user.organizationUser.appOrgId === appOrgId) {
                return user.organizationUser;
            }
        }
        return null;
    }
}

module.exports = { TestUserRepository }; 