const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
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
            redirect_uri: `${process.env.REDIRECT_URI}/microsoft-teams`,
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
            };
        }
        instance.api = new Api(teamsParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            const response = await this.api.graphApi.getChannels();
            await this.api.botFrameworkApi.getTeamMembers(response.value[0].id);
            validAuth = true;
        } catch (e) {
            debug(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements() {
        return {
            url: this.api.graphApi.authorizationUri,
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(data) {
        const code = get(data, 'code', null);
        const access_token = get(data, 'access_token', null);
        const refresh_token = get(data, 'refresh_token', null);
        // If code, getTokenFromCode for graphApi
        if (code) {
            // This will invoke receiveNotification and create the credential
            await this.api.graphApi.getTokenFromCode(code);
        } else if (access_token && refresh_token) {
            this.api.graphApi.access_token = access_token;
            this.api.graphApi.refresh_token = refresh_token;
        }
        // This will invoke receiveNotification and UPDATE the credential
        await this.api.botFrameworkApi.getTokenFromClientCredentials();
        const authCheck = await this.testAuth();
        if (!authCheck) throw new Error('Authentication failed');

        const orgDetails = await this.api.graphApi.getOrganization();
        const tenant_id = orgDetails.value[0].id;
        this.setTenant(tenant_id);
        const graph_access_token = this.api.graphApi.access_token;
        const bot_api_access_token = this.api.botFrameworkApi.access_token;
        const graph_refresh_token = this.api.graphApi.refresh_token;
        await this.findAndUpsertCredential({
            tenant_id,
            graph_access_token,
            graph_refresh_token,
            bot_api_access_token,
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
        // Just want to error if no tenant_id is provided
        const tenant_id = get(params, 'tenant_id');
        const graph_access_token = get(params, 'graph_access_token', null);
        const graph_refresh_token = get(params, 'graph_refresh_token', null);
        const bot_access_token = get(params, 'bot_access_token', null);
        const user = get(params, 'user', null);
        if (this.credential) {
            this.credential = await Credential.findOneAndUpdate(
                { _id: this.credential },
                { $set: params },
                { useFindAndModify: true, new: true, upsert: true }
            );
        } else {
            this.credential = await Credential.findOneAndUpdate(
                { tenant_id: tenant_id },
                { $set: params },
                { useFindAndModify: true, new: true, upsert: true }
            );
        }
    }
    setTenant(tenant_id) {
        this.tenant_id = tenant_id;
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
