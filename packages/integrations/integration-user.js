const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { get } = require('@friggframework/assertions');
const { Token } = require('@friggframework/database/models/Token');
const { IndividualUser } = require('@friggframework/database/models/IndividualUser');
const { OrganizationUser } = require('@friggframework/database/models/OrganizationUser');
const Boom = require('@hapi/boom');

class User {
    static IndividualUser = IndividualUser;
    static OrganizationUser = OrganizationUser;
    static Token = Token;
    static usePassword = false
    static primary = User.IndividualUser;
    static individualUserRequired = true;
    static organizationUserRequired = false;

    constructor() {
        this.user = null;
        this.individualUser = null;
        this.organizationUser = null;
    }

    getPrimaryUser() {
        if (User.primary === User.OrganizationUser) {
            return this.organizationUser;
        }
        return this.individualUser;
    }

    getUserId() {
        return this.getPrimaryUser()?.id;
    }

    isLoggedIn() {
        return Boolean(this.getUserId());
    }

    async createUserToken(minutes) {
        const rawToken = crypto.randomBytes(20).toString('hex');
        const createdToken = await User.Token.createTokenWithExpire(
            this.getUserId(),
            rawToken,
            120
        );
        // Return Session
        const tokenBuf = User.Token.createBase64BufferToken(createdToken, rawToken);
        return tokenBuf;
    }

    static async newUser(params={}) {
        const user = new User();
        const token = get(params, 'token', null);
        if (token) {
            const jsonToken = this.Token.getJSONTokenFromBase64BufferToken(token);
            const sessionToken = await this.Token.validateAndGetTokenFromJSONToken(jsonToken);
            if (this.primary === User.OrganizationUser) {
                user.organizationUser = await this.OrganizationUser.findById(sessionToken.user);
            } else {
                user.individualUser = await this.IndividualUser.findById(sessionToken.user);
            }
        }
        return user;
    }

    static async createIndividualUser(params) {
        const user = await this.newUser(params);
        let hashword;
        if (this.usePassword) {
            hashword = get(params, 'password');
        }

        const email = get(params, 'email', null);
        const username = get(params, 'username', null);
        if (!email && !username) {
            throw Boom.badRequest('email or username is required');
        }

        const appUserId = get(params, 'appUserId', null);
        const organizationUserId = get(params, 'organizationUserId', null);

        user.individualUser = await this.IndividualUser.create({
            email,
            username,
            hashword,
            appUserId,
            organizationUser: organizationUserId,
        });
        return user;
    }

    static async createOrganizationUser(params) {
        const user = await this.newUser(params);
        const name = get(params, 'name');
        const appOrgId = get(params, 'appOrgId');
        user.organizationUser = await this.OrganizationUser.create({
            name,
            appOrgId,
        });
        return user;
    }

    // returns a User if the user credentials are correct otherwise throws an exception
    static async loginUser(params) {
        const user = await this.newUser(params);

        if (this.usePassword){
            const username = get(params, 'username');
            const password = get(params, 'password');

            const individualUser = await this.IndividualUser.findOne({username});

            if (!individualUser) {
                throw Boom.unauthorized('incorrect username or password');
            }

            const isValid = await bcrypt.compareSync(password, individualUser.hashword);
            if (!isValid) {
                throw Boom.unauthorized('incorrect username or password');
            }
            user.individualUser = individualUser;
        }
        else {
            const appUserId = get(params, 'appUserId', null);
            user.individualUser = await this.IndividualUser.getUserByAppUserId(
                appUserId
            );
        }

        const appOrgId = get(params, 'appOrgId', null);
        user.organizationUser = await this.OrganizationUser.getUserByAppOrgId(
            appOrgId
        );

        if (this.individualUserRequired) {
            if (!user.individualUser) {
                throw Boom.unauthorized('user not found');
            }
        }

        if (this.organizationUserRequired) {
            if (!user.organizationUser) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
            }
        }
        return user;
    }
}

module.exports = User;
