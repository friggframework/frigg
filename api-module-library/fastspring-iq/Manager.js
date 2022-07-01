const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
const Credential = require('./models/credential');
const Entity = require('./models/entity');
const Api = require('./Api');

// name used as the entity type
const MANAGER_NAME = 'fastspring-iq';

class Manager extends ModuleManager {
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
            instance.entity = await Entity.findByUserId(params.userId);
        }
        // create an entry in the database if it does not exist
        if (!params.entityId && !instance.entity) {
            instance.entity = await Entity.create({
                userId: params.userId,
            });
        }

        if (params.entityId) {
            instance.entity = await Entity.find(params.entityId);
        }

        // initializes the credentials and the Api

        if (instance.entity.credential) {
            instance.credential = await Credential.find(
                instance.entity.credential
            );
            instance.api = await new Api({
                access_token: instance.credential.accessToken,
                refresh_token: instance.credential.refreshToken,
            });
        } else {
            // Otherwise if no creds?
            instance.api = await new Api();
        }

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getOrganizationDetails()) validAuth = true;
        } catch (e) {
            console.log(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements() {
        return {
            url: this.api.getAuthorizationUri(),
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const data = get(params, 'data');
        const code = get(data, 'code');

        await this.getAccessToken(code);
        const entity = await Entity.findByUserId(this.userId);
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
        const entity = await Entity.findByUserId(this.userId);
        if (entity.credential) {
            await Credential.delete(entity.credential);
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
        try {
            // throw new Error("Whats the stack trace here?");
            if (notifier instanceof Api) {
                if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                    console.log(`should update the token: ${object}`);
                    const updatedToken = {
                        accessToken: this.api.access_token,
                        refreshToken: this.api.refresh_token,
                        accessTokenExpire: this.api.accessTokenExpire,
                    };

                    // We shouldn't ever get to this point vv but just in case
                    if (!this.entity) {
                        this.throwException(
                            'No entity found on the Manager during Token Update... something is wrong'
                        );
                    }
                    const { credentials } = this.entity;
                    const credentialObject = {};

                    // First check to see if there are any credentials stored on the Entity
                    if (!credentials) {
                        // If no credentials stored, then we create our first one and push it to the array
                        credentialObject.credential = await Credential.create(
                            updatedToken
                        );
                        credentialObject.type = this.type;
                        await Entity.model.updateOne(
                            { _id: this.entity.id },
                            { $push: { credentials: credentialObject } }
                        );
                    } else {
                        // If there ARE some credentials stored, then we need to figure out the one we have is the same type
                        const existingCred = credentials.find(
                            (credential) => credential.type === this.type
                        );
                        // If there are any existingCredentials of the same type, then we update that credential and call it a day
                        if (existingCred) {
                            const update = await Credential.update(
                                existingCred.credential,
                                updatedToken
                            );
                            console.log(update);
                        } else {
                            // If there are no existing credentials by that type, create and add to the array
                            credentialObject.credential =
                                await Credential.create(updatedToken);
                            credentialObject.type = this.type;
                            await Entity.model.findOneAndUpdate(
                                { _id: this.entity.id },
                                { $push: { credentials: credentialObject } }
                            );
                        }
                    }
                }
                if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                    await this.deauthorize();
                    console.log(this.checkUserAuthorized());
                }
            }
        } catch (e) {
            console.log('error yo');
        }
    }
}

module.exports = Manager;
