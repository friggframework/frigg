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
        const orgUserDoc = this.organizationUsers.get(userId);
        if (!orgUserDoc) {
            throw Boom.unauthorized('Organization User Not Found');
        }
        return new User(null, orgUserDoc, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async findIndividualUserById(userId) {
        const individualUserDoc = this.individualUsers.get(userId);
        if (!individualUserDoc) {
            throw Boom.unauthorized('Individual User Not Found');
        }
        return new User(individualUserDoc, null, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async createToken(userId, rawToken, minutes = 120) {
        const token = `token-for-${userId}-for-${minutes}-mins`;
        this.tokens.set(token, { user: userId, rawToken });
        return token;
    }

    async createIndividualUser(params) {
        const individualUserData = { id: `individual-${Date.now()}`, ...params };
        this.individualUsers.set(individualUserData.id, individualUserData);
        return new User(
            individualUserData,
            null,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }

    async createOrganizationUser(params) {
        const orgUserData = { ...params, id: `org-${Date.now()}` };
        this.organizationUsers.set(orgUserData.id, orgUserData);
        return new User(
            null,
            orgUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }

    async findIndividualUserByUsername(username) {
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.username === username) {
                return new User(
                    userDoc,
                    null,
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
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
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
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
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
                );
            }
        }
        throw Boom.unauthorized('user not found');
    }
}

module.exports = { TestUserRepository }; 