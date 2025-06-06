const crypto = require('crypto');
const { get } = require('../assertions');
const { Token } = require('../database/models/Token');
const { IndividualUser } = require('../database/models/IndividualUser');
const { OrganizationUser } = require('../database/models/OrganizationUser');
const Boom = require('@hapi/boom');

class UserRepository {
    /**
     * @param {Object} options - Configuration options
     * @param {import('./user-factory').UserFactory} options.userFactory - Factory for creating User instances
     */
    constructor({ userFactory }) {
        this.IndividualUser = IndividualUser;
        this.OrganizationUser = OrganizationUser;
        this.Token = Token;
        this.userFactory = userFactory;
    }

    async getUserFromToken(token) {
        const user = this.userFactory.create();

        if (token) {
            const jsonToken =
                this.Token.getJSONTokenFromBase64BufferToken(token);
            const sessionToken =
                await this.Token.validateAndGetTokenFromJSONToken(jsonToken);
            if (sessionToken) {
                if (user.config.primary === 'organization') {
                    user.organizationUser =
                        await this.OrganizationUser.findById(sessionToken.user);
                } else {
                    user.individualUser = await this.IndividualUser.findById(
                        sessionToken.user
                    );
                }
            }
        }
        return user;
    }

    async createToken(userId, minutes = 120) {
        const rawToken = crypto.randomBytes(20).toString('hex');
        const createdToken = await this.Token.createTokenWithExpire(
            userId,
            rawToken,
            minutes
        );
        return this.Token.createBase64BufferToken(createdToken, rawToken);
    }

    async createIndividualUser(params) {
        return this.IndividualUser.create(params);
    }

    async createOrganizationUser(params) {
        return this.OrganizationUser.create(params);
    }

    async findIndividualUserByUsername(username) {
        return this.IndividualUser.findOne({ username });
    }

    async findIndividualUserByAppUserId(appUserId) {
        return this.IndividualUser.getUserByAppUserId(appUserId);
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        return this.OrganizationUser.getUserByAppOrgId(appOrgId);
    }
}

module.exports = { UserRepository }; 