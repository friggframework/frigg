const { Api } = require('./api.js');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/core');
const Config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);
        // initializes the Api
        const apiParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            apiParams.accessToken = credential.accessToken;
            apiParams.refreshToken = credential.refreshToken;
            apiParams.accessTokenExpire = credential.accessTokenExpire;
            apiParams.refreshTokenExpire = credential.refreshTokenExpire;
            apiParams.realmId = credential.realmId;
        }
        instance.api = await new Api(apiParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.getAuthorizationUri(),
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const userId = get(params, 'userId');
        const data = get(params, 'data');
        const code = get(data, 'code');
        const realmId = get(data, 'realmId');

        await this.getAccessToken(code, realmId);
        const entity = await this.entityMO.getByUserId(this.userId);
        return {
            id: entity.id,
            type: Manager.getName(),
        };
    }

    //------------------------------------------------------------

    checkUserAuthorized() {
        return this.api.isAuthenticated();
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

    getOrCreateClient() {}

    async getAccessToken(code, realmId) {
        await this.api.getAccessToken(code, realmId);
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                // todo update the database
                const updatedToken = {
                    accessToken: this.api.accessToken,
                    refreshToken: this.api.refreshToken,
                    accessTokenExpire: this.api.accessTokenExpire,
                    refreshTokenExpire: this.api.refreshTokenExpire,
                    realmId: this.api.realmId,
                };
                let entity = await this.entityMO.getByUserId(this.userId);

                if (!entity) {
                    entity = await this.entityMO.create({
                        user: this.userId,
                    });
                }
                let { credential } = entity;
                if (!credential) {
                    credential = await this.credentialMO.create(updatedToken);
                } else {
                    credential = await this.credentialMO.update(
                        credential,
                        updatedToken
                    );
                }
                await this.entityMO.update(entity.id, { credential });
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
        }
    }
}

module.exports = Manager;
