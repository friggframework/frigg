const { Token } = require('../database/models/Token');
const { IndividualUser } = require('../database/models/IndividualUser');
const { OrganizationUser } = require('../database/models/OrganizationUser');
const { User } = require('./user');


//todo: the user class instantiation needs to happen in each use case and not here.
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
        const organizationUser = await this.OrganizationUser.findById(userId);

        if (!organizationUser) {
            throw Boom.unauthorized('Organization User Not Found');
        }

        return new User(null, organizationUser, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async findIndividualUserById(userId) {
        const individualUser = await this.IndividualUser.findById(userId);

        if (!individualUser) {
            throw Boom.unauthorized('Individual User Not Found');
        }

        return new User(individualUser, null, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
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
        const individualUser = await this.IndividualUser.create(params);
        return new User(individualUser, null, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async createOrganizationUser(params) {
        const organizationUser = await this.OrganizationUser.create(params);
        return new User(null, organizationUser, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async findIndividualUserByUsername(username) {
        const individualUser = await this.IndividualUser.findOne({ username });

        if (!individualUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(individualUser, null, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async findIndividualUserByAppUserId(appUserId) {
        const individualUser = await this.IndividualUser.getUserByAppUserId(appUserId);

        if (!individualUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(individualUser, null, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        const organizationUser = await this.OrganizationUser.getUserByAppOrgId(appOrgId);

        if (!organizationUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(null, organizationUser, this.userConfig.usePassword, this.userConfig.primary, this.userConfig.individualUserRequired, this.userConfig.organizationUserRequired);
    }
}

module.exports = { UserRepository }; 