const { Token } = require('../database/models/Token');
const { IndividualUser } = require('../database/models/IndividualUser');
const { OrganizationUser } = require('../database/models/OrganizationUser');

class UserRepository {
    /**
     * @param {Object} userConfig - The user config in the app definition.
     */
    constructor({ userConfig }) {
        this.IndividualUser = IndividualUser;
        this.OrganizationUser = OrganizationUser;
        this.Token = Token;
        this.userConfig = userConfig;
    }

    async getSessionToken(token) {
        const jsonToken =
            this.Token.getJSONTokenFromBase64BufferToken(token);
        const sessionToken =
            await this.Token.validateAndGetTokenFromJSONToken(jsonToken);
        return sessionToken;
    }

    async findOrganizationUserById(userId) {
        return this.OrganizationUser.findById(userId);
    }

    async findIndividualUserById(userId) {
        return this.IndividualUser.findById(userId);
    }

    async createToken(userId, rawToken, minutes = 120) {
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