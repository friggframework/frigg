const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager, ModuleConstants} = require('@friggframework/module-plugin');
const { Api } = require('./api/api');
const { graphApi } = require('./api/graph');
const { botFrameworkApi } = require('./api/botFramework');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
        this.tenant_id = get(params, 'tenant_id', null);
        this.redirect_uri= get(params, 'redirect_uri', `${process.env.REDIRECT_URI}/microsoft-teams`)
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);
        // All async code here

        // initializes the Api
        let teamsParams = {
            client_id: process.env.TEAMS_CLIENT_ID,
            client_secret: process.env.TEAMS_CLIENT_SECRET,
            redirect_uri: instance.redirect_uri,
            scope: process.env.TEAMS_SCOPE,
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            teamsParams = {
                ...teamsParams,
                ...instance.credential.toObject(),
                tenant_id: instance.entity.externalId
            };
        }
        instance.api = new Api(teamsParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            const response = await this.api.graphApi.getOrganization();
            validAuth = true;
        } catch (e) {
            debug(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.graphApi.getAuthUri(),
            type: ModuleConstants.authType.oauth2,
            data: {},
        };
    }

    async processAuthorizationCallback(params) {
        if (params) {
            const code = get(params.data, 'code', null);
            try {
                await this.api.graphApi.getTokenFromCode(code);
            } catch (e) {
                flushDebugLog(e);
                throw new Error('Auth Error');
            }
            const authRes = await this.testAuth();
            if (!authRes) throw new Error('Auth Error');
        }
        else {
            await this.api.getTokenFromClientCredentials();
            const authCheck = await this.testAuth();
            if (!authCheck) throw new Error('Auth Error');
        }

        const orgDetails = await this.api.graphApi.getOrganization();
        this.tenant_id =  orgDetails.id;
        await this.findAndUpsertCredential({
            tenant_id: this.tenant_id,
            graph_access_token: this.api.graphApi.access_token,
            graph_refresh_token: this.api.botFrameworkApi.access_token,
            bot_api_access_token: this.api.graphApi.refresh_token,
        });

        await this.findOrCreateEntity({
            externalId: orgDetails.id,
            name: orgDetails.displayName,
        });
        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const externalId = get(params, 'externalId');
        const name = get(params, 'name');

        // TODO-new... this doesn't allow for multiple entities for a specific User.
        const search = await Entity.find({
            user: this.userId,
            externalId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same portal ID:', portalId);
            this.throwException('');
        }
    }
    async findAndUpsertCredential(params) {
        if (this.credential) {
            this.credential = await Credential.findOneAndUpdate(
                { _id: this.credential },
                { $set: params },
                { useFindAndModify: true, new: true, upsert: true }
            );
        } else {
            this.credential = await Credential.findOneAndUpdate(
                { tenant_id: this.tenant_id },
                { $set: params },
                { useFindAndModify: true, new: true, upsert: true }
            );
        }
    }

    //------------------------------------------------------------

    async receiveNotification(notifier, delegateString, object = null) {
        if (
            notifier instanceof Api ||
            notifier instanceof botFrameworkApi ||
            notifier instanceof graphApi
        ) {
            if (
                delegateString === this.api.graphApi.DLGT_TOKEN_UPDATE &&
                this.tenant_id
            ) {
                const updatedToken = {
                    user: this.userId?.toString(),
                    graph_access_token: this.api.graphApi.access_token,
                    graph_refresh_token: this.api.graphApi.refresh_token,
                    bot_api_access_token: this.api.botFrameworkApi.access_token,
                    tenant_id: this.tenant_id,
                };

                await this.findAndUpsertCredential(updatedToken);
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                return this.markCredentialsInvalid();
            }
        }
    }
    // TODO-new (globally) normalize "deauthorization"
    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.findByUserId(this.userId);
        if (entity.credential) {
            await Credential.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
        this.credential = undefined;
    }
}

module.exports = Manager;
