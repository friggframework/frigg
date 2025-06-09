const Boom = require('@hapi/boom');
const { User } = require('../../user');

class TestUserRepository {
    constructor({ userDefinition }) {
        this.individualUsers = new Map();
        this.organizationUsers = new Map();
        this.tokens = new Map();
        this.userDefinition = userDefinition;
    }

    async getUserFromToken(token) {
        const userId = this.tokens.get(token);
        // This is a simplified lookup for testing purposes
        const individualUserDoc = this.individualUsers.get(userId);
        if (individualUserDoc) {
            return new User(
                individualUserDoc,
                null,
                this.userDefinition.usePassword,
                this.userDefinition.primary,
                this.userDefinition.individualUserRequired,
                this.userDefinition.organizationUserRequired
            );
        }
        const orgUserDoc = this.organizationUsers.get(userId);
        if (orgUserDoc) {
            return new User(
                null,
                orgUserDoc,
                this.userDefinition.usePassword,
                this.userDefinition.primary,
                this.userDefinition.individualUserRequired,
                this.userDefinition.organizationUserRequired
            );
        }
        return null;
    }

    async createToken(userId, minutes = 120) {
        // In a real scenario, the token would be more complex and unique
        const token = `token-for-${userId}-for-${minutes}-mins`;
        this.tokens.set(token, userId);
        return token;
    }

    async createIndividualUser(params) {
        const individualUserData = { id: `individual-${Date.now()}`, ...params };
        this.individualUsers.set(individualUserData.id, individualUserData);
        return new User(
            individualUserData,
            null,
            this.userDefinition.usePassword,
            this.userDefinition.primary,
            this.userDefinition.individualUserRequired,
            this.userDefinition.organizationUserRequired
        );
    }

    async createOrganizationUser(params) {
        const orgUserData = { ...params, id: `org-${Date.now()}` };
        this.organizationUsers.set(orgUserData.id, orgUserData);
        return new User(
            null,
            orgUserData,
            this.userDefinition.usePassword,
            this.userDefinition.primary,
            this.userDefinition.individualUserRequired,
            this.userDefinition.organizationUserRequired
        );
    }

    async findIndividualUserByUsername(username) {
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.username === username) {
                return new User(
                    userDoc,
                    null,
                    this.userDefinition.usePassword,
                    this.userDefinition.primary,
                    this.userDefinition.individualUserRequired,
                    this.userDefinition.organizationUserRequired
                );
            }
        }
        throw Boom.unauthorized('user not found');
    }

    async findIndividualUserByAppUserId(appUserId) {
        if (!appUserId) throw Boom.unauthorized('user not found');
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.appUserId === appUserId) {
                return new User(
                    userDoc,
                    null,
                    this.userDefinition.usePassword,
                    this.userDefinition.primary,
                    this.userDefinition.individualUserRequired,
                    this.userDefinition.organizationUserRequired
                );
            }
        }
        throw Boom.unauthorized('user not found');
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        if (!appOrgId) throw Boom.unauthorized('user not found');
        for (const userDoc of this.organizationUsers.values()) {
            if (userDoc.appOrgId === appOrgId) {
                return new User(
                    null,
                    userDoc,
                    this.userDefinition.usePassword,
                    this.userDefinition.primary,
                    this.userDefinition.individualUserRequired,
                    this.userDefinition.organizationUserRequired
                );
            }
        }
        throw Boom.unauthorized('user not found');
    }
}

module.exports = { TestUserRepository }; 