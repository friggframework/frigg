const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
const { Api } = require('./api/api');
const { appDeveloperApi } = require('./api/appDeveloperApi');
const { Entity } = require('./entity');
const { Credential } = require('./credential');

const Config = require('./defaultConfig.json');
const AuthFields = require('./authFields');

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);

        let apiParams = {
            client_id: process.env.YOTPO_CLIENT_ID,
            client_secret: process.env.YOTPO_CLIENT_SECRET,
            redirect_uri: `${process.env.REDIRECT_URI}/yotpo`,
            delegate: instance,
        };
        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            apiParams = {
                ...apiParams,
                ...instance.credential.toObject(),
            };
            apiParams.API_KEY_VALUE = apiParams.coreApiAccessToken;
        }
        instance.api = await new Api(apiParams);

        return instance;
    }

    // Change to whatever your api uses to return identifying information
    async testAuth() {
        let validAuth = false;
        try {
            if (
                (await this.api.coreApi.listOrders()) &&
                (await this.api.appDeveloperApi.listOrders())
            )
                validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.appDeveloperApi.authorizationUri,
            type: ModuleConstants.authType.oauth2,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async processAuthorizationCallback(params) {
        const store_id = get(params.data, 'store_id', null);
        const secret = get(params.data, 'secret', null);
        const code = get(params.data, 'code', null);
        const appKey = get(params.data, 'app_key', null);
        this.api.coreApi.store_id = store_id;
        this.api.coreApi.apiKeySecret = secret;
        this.api.appDeveloperApi.appKey = appKey;
        await this.api.coreApi.getToken();
        await this.api.appDeveloperApi.getTokenFromCode(code);
        const authRes = await this.testAuth();
        if (!authRes) throw new Error('Authentication failed');

        await this.findOrCreateEntity({
            store_id,
            secret,
        });
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    // Maybe need this if we want to offer JUST Core API
    async findOrCreateCredential(params) {
        const store_id = get(params.data, 'store_id', null);
        const secret = get(params.data, 'secret', null);

        const search = await Credential.find({
            user: this.userId,
            store_id,
            secret,
        });

        if (search.length === 0) {
            const createObj = {
                user: this.userId,
                store_id,
                secret,
            };
            this.credential = await Credential.create(createObj);
        } else if (search.length === 1) {
            this.credential = search[0];
        } else {
            debug(
                'Multiple credentials found with the same Client ID',
                store_id,
                secret
            );
        }
    }

    async findOrCreateEntity(params) {
        const store_id = get(params.data, 'store_id', null);
        const name = get(params, 'name', null);

        const search = await Entity.find({
            user: this.userId,
            externalId: store_id,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: store_id,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same external ID:',
                store_id
            );
            this.throwException('');
        }
    }
    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString === this.api.appDeveloperApi.DLGT_TOKEN_UPDATE) {
            const updatedToken = {
                user: this.userId.toString(),
                access_token: this.api.appDeveloperApi.access_token,
                refresh_token: this.api.appDeveloperApi.refresh_token,
                auth_is_valid: true,
                store_id: this.api.coreApi.store_id,
                secret: this.api.coreApi.secret,
                coreApiAccessToken: this.api.coreApi.API_KEY_VALUE,
                appKey: this.api.appDeveloperApi.appKey,
            };

            Object.keys(updatedToken).forEach(
                (k) => updatedToken[k] == null && delete updatedToken[k]
            );
            // TODO-new globally... multiple credentials should be allowed, this is 1:1
            if (!this.credential) {
                let credentialSearch = await Credential.find({
                    user: this.userId.toString(),
                });
                if (credentialSearch.length === 0) {
                    this.credential = await Credential.create(updatedToken);
                } else if (credentialSearch.length === 1) {
                    this.credential = await Credential.update(
                        credentialSearch[0],
                        updatedToken
                    );
                } else {
                    // Handling multiple credentials found with an error for the time being
                    debug(
                        'Multiple credentials found with the same client ID:'
                    );
                }
            } else {
                this.credential = await Credential.update(
                    this.credential,
                    updatedToken
                );
            }
        }
        if (
            delegateString === this.api.appDeveloperApi.DLGT_TOKEN_DEAUTHORIZED
        ) {
            await this.deauthorize();
        }
        if (delegateString === this.api.appDeveloperApi.DLGT_INVALID_AUTH) {
            return this.markCredentialsInvalid();
        }
    }

    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
    }
}
module.exports = Manager;
