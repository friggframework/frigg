const Boom = require('@hapi/boom');
const { User } = require('../../user');

class TestUserRepository {
    constructor({ userConfig }) {
        this.individualUsers = new Map();
        this.organizationUsers = new Map();
        this.tokens = new Map();
        this.userConfig = userConfig;
    }

    async getSessionToken(token) {
        return this.tokens.get(token);
    }

    async findOrganizationUserById(userId) {
        return this.organizationUsers.get(userId);
    }

    async findIndividualUserById(userId) {
        return this.individualUsers.get(userId);
    }

    async createToken(userId, rawToken, minutes = 120) {
        const token = `token-for-${userId}-for-${minutes}-mins`;
        this.tokens.set(token, { user: userId, rawToken });
        return token;
    }

    async createIndividualUser(params) {
        const individualUserData = { id: `individual-${Date.now()}`, ...params };
        this.individualUsers.set(individualUserData.id, individualUserData);
        return individualUserData;
    }

    async createOrganizationUser(params) {
        const orgUserData = { ...params, id: `org-${Date.now()}` };
        this.organizationUsers.set(orgUserData.id, orgUserData);
        return orgUserData;
    }

    async findIndividualUserByUsername(username) {
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.username === username) {
                return userDoc;
            }
        }
        return null;
    }

    async findIndividualUserByAppUserId(appUserId) {
        if (!appUserId) return null;
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.appUserId === appUserId) {
                return userDoc;
            }
        }
        return null;
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        if (!appOrgId) return null;
        for (const userDoc of this.organizationUsers.values()) {
            if (userDoc.appOrgId === appOrgId) {
                return userDoc;
            }
        }
        return null;
    }
}

module.exports = { TestUserRepository }; 