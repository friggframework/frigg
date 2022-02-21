const Api = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');

// name used as the entity type
const MANAGER_NAME = 'qbo';

class Manager extends LHModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super({ ...params, entityClass: Entity, credentialClass: Credential });

        // asynchronous initialization
        return (async () => {
            // All async code here

            const entity = await this.entityMO.getByUserId(this.userId);
            //
            // // create an entry in the database if it does not exist
            // if(!entity){
            //     entity = await  this.entityMO.create({userId:this.userIsd});
            // }

            // initializes the Api
            const qboParams = { delegate: this };
            if (entity && entity.credential) {
                try {
                    const qboToken = await this.credentialMO.get(
                        entity.credential
                    );
                    qboParams.accessToken = qboToken.accessToken;
                    qboParams.refreshToken = qboToken.refreshToken;
                    qboParams.accessTokenExpire = qboToken.accessTokenExpire;
                    qboParams.refreshTokenExpire = qboToken.refreshTokenExpire;
                    qboParams.realmId = qboToken.realmId;
                } finally {
                    entity.credential = undefined;
                    await entity.save();
                }
            }
            this.api = await new Api(qboParams);

            return this;
        })();
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return MANAGER_NAME;
    }

    static async getInstance(params) {
        return new Manager(params);
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.getAuthorizationUri(),
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const userId = this.getParam(params, 'userId');
        const data = this.getParam(params, 'data');
        const code = this.getParam(data, 'code');
        const realmId = this.getParam(data, 'realmId');

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
