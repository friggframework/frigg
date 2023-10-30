const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const { ConfigFields } = require('./authFields');
const Config = require('./defaultConfig.json');
const { IntegrationMapping } = require('./models/integrationMapping');
const moment = require("moment/moment");

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;
    static IntegrationMapping = IntegrationMapping;

    constructor(params) {
        super(params);
        this.redirect_uri = get(params, 'redirect_uri', null);
    }

    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        let instance = new this(params);

        const apiParams = { delegate: instance };
        if (this.redirect_uri) apiParams.redirect_uri = this.redirect_uri;
        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            apiParams.access_token = instance.credential.access_token;
            apiParams.refresh_token = instance.credential.refresh_token;
        }
        instance.api = await new Api(apiParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.getAuthUri(),
            type: ModuleConstants.authType.oauth2,
            data: {},
        };
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.authTest()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }
    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code', null);

        // For OAuth2, generate the token and store in this.credential and the DB
        let authInfo;
        try {
            authInfo = await this.api.getTokenFromCode(code);
        } catch (e) {
            flushDebugLog(e);
            throw new Error('Auth Error');
        }
        const authRes = await this.testAuth();
        if (!authRes) throw new Error('Auth Error');

        const isUserScopeAuthorized = authInfo.authed_user && authInfo.authed_user.access_token;
        const teamId = authInfo.team.id;
        // get entity identifying information from the api. If we have the user access token,
        // it means we should store it along with their id
        const externalId = isUserScopeAuthorized ?
            authInfo.authed_user.id : teamId;

        await this.findOrCreateUserEntity({
            externalId: externalId,
            name: authInfo.team.name,
        });

        const returnObj = {
            type: Manager.getName(),
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            team_entity_id: null,
            auth_info: authInfo,
        };

        if (isUserScopeAuthorized) {
            const teamEntity = await this.createAndReturnTeamEntity({
                authInfo,
                teamId,
            });

            returnObj.team_entity_id = teamEntity.id;
        }

        return returnObj;
    }

    async createAndReturnTeamEntity({
        authInfo,
        teamId,
    }) {
        let teamEntity = await Entity.findOne({
            externalId: teamId
        });
        if (!teamEntity) {
            const credential = await Credential.create({
                access_token: authInfo.access_token,
                refresh_token: authInfo.refresh_token || null,
                externalId: teamId,
                auth_is_valid: true,
            });

            // create team entity
            const createObj = {
                credential: credential.id,
                user: null,
                name: authInfo.team.name,
                externalId: teamId,
            };
            teamEntity = await Entity.create(createObj);
        }
        return teamEntity;
    }

    async getEntityOptions() {
        // No entity options to get. Probably won't even hit this
        return [];
    }

    async findOrCreateUserEntity(params) {
        const externalId = get(params, 'externalId', null);
        const name = get(params, 'name', null);

        const search = await Entity.find({
            externalId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this?.userId,
                name,
                externalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same external ID:',
                externalId
            );
            throw new Error(
                'Multiple entities found with the same external ID'
            );
        }
    }

    async deauthorize() {
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.find({ user: this.userId });
        if (entity.credential) {
            await Credential.deleteOne({ _id: entity.credential });
            entity.credential = undefined;
            await entity.save();
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (!(notifier instanceof Api)) {
            // no-op
        } else if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
            await this.updateOrCreateCredential();
        } else if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        } else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid();
        }
    }

    async updateOrCreateCredential() {
        const workspaceInfo = await this.api.authTest();
        const isTeamUser = workspaceInfo['bot_user_id'];
        const externalId = isTeamUser ? get(workspaceInfo, 'team_id') : get(workspaceInfo, 'user_id');
        const updatedToken = {
            access_token: this.api.access_token,
            refresh_token: this.api.refresh_token,
            externalId,
            auth_is_valid: true,
        };

        // search for a credential for this externalId
        // skip if we already have a credential
        if (!this.credential) {
            const credentialSearch = await Credential.find({ externalId });
            if (credentialSearch.length > 1) {
                debug(
                    `Multiple credentials found with same externalId: ${externalId}`
                );
            } else if (credentialSearch.length === 1) {
                // found exactly one credential with this externalId
                this.credential = credentialSearch[0];
            } else {
                // found no credential with this externalId (match none for insert)
                this.credential = { $exists: false };
            }
        }
        // update credential or create if none was found
        // NOTE: upsert skips validation
        this.credential = await Credential.findOneAndUpdate(
            { _id: this.credential },
            { $set: updatedToken },
            { useFindAndModify: true, new: true, upsert: true }
        );
    }
}

module.exports = Manager;
