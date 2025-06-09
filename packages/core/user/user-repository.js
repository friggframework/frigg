const crypto = require('crypto');
const { Token } = require('../database/models/Token');
const { IndividualUser } = require('../database/models/IndividualUser');
const { OrganizationUser } = require('../database/models/OrganizationUser');
const { User } = require('./user');
class UserRepository {
    /**
     * @param {Object} userDefinition - The user options in the app definition.
     */
    constructor({ userDefinition }) {
        this.IndividualUser = IndividualUser;
        this.OrganizationUser = OrganizationUser;
        this.Token = Token;
        this.userDefinition = userDefinition;
    }

    // todo: move this to the GetUserFromBearerToken use case.
    async getUserFromToken(token) {

        if (token) {
            const jsonToken =
                this.Token.getJSONTokenFromBase64BufferToken(token);
            const sessionToken =
                await this.Token.validateAndGetTokenFromJSONToken(jsonToken);

            if (sessionToken) {
                if (this.userDefinition.primary === 'organization') {
                    const organizationUser =
                        await this.OrganizationUser.findById(sessionToken.user);

                    const user = new User(null, organizationUser, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
                    return user;
                }

                const individualUser =
                    await this.IndividualUser.findById(sessionToken.user);

                const user = new User(individualUser, null, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
                return user;
            }
        }

        return null;
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
        const individualUser = await this.IndividualUser.create(params);
        return new User(individualUser, null, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
    }

    async createOrganizationUser(params) {
        const organizationUser = await this.OrganizationUser.create(params);
        return new User(null, organizationUser, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
    }

    async findIndividualUserByUsername(username) {
        const individualUser = await this.IndividualUser.findOne({ username });

        if (!individualUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(individualUser, null, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
    }

    async findIndividualUserByAppUserId(appUserId) {
        const individualUser = await this.IndividualUser.getUserByAppUserId(appUserId);

        if (!individualUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(individualUser, null, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        const organizationUser = await this.OrganizationUser.getUserByAppOrgId(appOrgId);

        if (!organizationUser) {
            throw Boom.unauthorized('user not found');
        }

        return new User(null, organizationUser, this.userDefinition.usePassword, this.userDefinition.primary, this.userDefinition.individualUserRequired, this.userDefinition.organizationUserRequired);
    }
}

module.exports = { UserRepository }; 