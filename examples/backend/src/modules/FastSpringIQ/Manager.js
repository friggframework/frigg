const Api = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');

// name used as the entity type
const MANAGER_NAME = 'fastspringiq';

class Manager extends LHModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return MANAGER_NAME;
    }

    static async getInstance(params) {
        const instance = new this(params);

        if (params.userId && !params.entityId) {
            instance.entity = await instance.entityMO.getByUserId(
                params.userId
            );
        }
        // create an entry in the database if it does not exist
        if (!params.entityId && !instance.entity) {
            instance.entity = await instance.entityMO.create({
                userId: params.userId,
            });
        }

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
        }

        // initializes the credentials and the Api

        const OAuthDetails = {
            delegate: instance, // This needs to be passed in to EVERY OAuth App
        };
        if (instance.entity.credential) {
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            instance.api = await new Api(instance.credential);
        } else {
            // Otherwise if no creds?
            instance.api = await new Api();
        }

        return instance;
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

        await this.getAccessToken(code);
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

    async getAccessToken(code) {
        await this.api.getTokenFromCode(code);
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async receiveNotification(notifier, delegateString, object = null) {
        // throw new Error("Whats the stack trace here?");
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                // todo update the database
                const updatedToken = {
                    accessToken: this.api.accessToken,
                    refreshToken: this.api.refreshToken,
                    accessTokenExpire: this.api.accessTokenExpire,
                };
                let entity = await this.entityMO.getByUserId(this.userId);

                // We shouldn't ever get to this point vv but just in case
                if (!entity) {
                    entity = await this.entityMO.create({
                        user: this.userId,
                    });
                }
                const { credentials } = entity;
                const credentialObject = {};

                // First check to see if there are any credentials stored on the Entity
                if (!credentials) {
                    // If no credentials stored, then we create our first one and push it to the array
                    credentialObject.credential =
                        await this.credentialMO.create(updatedToken);
                    credentialObject.type = this.type;
                    await this.entityMO.model.update(
                        { _id: entity.id },
                        { $push: { credentials: credentialObject } }
                    );
                } else {
                    // If there ARE some credentials stored, then we need to figure out the one we have is the same type
                    const existingCred = credentials.find(
                        (credential) => credential.type === this.type
                    );
                    // If there are any existingCredentials of the same type, then we update that credential and call it a day
                    if (existingCred) {
                        await this.credentialMO.update(
                            existingCred[0],
                            updatedToken
                        );
                    } else {
                        // If there are no existing credentials by that type, create and add to the array
                        credentialObject.credential =
                            await this.credentialMO.create(updatedToken);
                        credentialObject.type = this.type;
                        await this.entityMO.model.update(
                            { _id: entity.id },
                            { $push: { credentials: credentialObject } }
                        );
                    }
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
        }
    }
}

module.exports = Manager;
