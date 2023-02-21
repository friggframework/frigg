const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');

// the name used for the entity type, generally
const MANAGER_NAME = 'hubspot';

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
        // All async code here

        // initializes the Api
        const apiParams = {
            client_id: process.env.HUBSPOT_CLIENT_ID,
            client_secret: process.env.HUBSPOT_CLIENT_SECRET,
            scope: process.env.HUBSPOT_SCOPE,
            redirect_uri: `${process.env.REDIRECT_URI}/hubspot`,
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            apiParams.access_token = credential.accessToken;
            apiParams.refresh_token = credential.refreshToken;
        }
        instance.api = new Api(apiParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getUserDetails()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements() {
        return {
            url: await this.api.getAuthUri(),
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        await this.api.getTokenFromCode(code);
        const authRes = await this.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }
        const userDetails = await this.api.getUserDetails();

        await this.findOrCreateEntity({
            externalId: userDetails.portalId,
            name: userDetails.hub_domain,
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
            debug(
                'Multiple entities found with the same portal ID:',
                externalId
            );
            flushDebugLog('Flushing logs');
        }
    }

    //------------------------------------------------------------

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

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                debug(`should update the token: ${object}`);
                const userDetails = await this.api.getUserDetails();
                const updatedToken = {
                    user: this.userId,
                    accessToken: this.api.access_token,
                    refreshToken: this.api.refresh_token,
                    accessTokenExpire: this.api.accessTokenExpire,
                    portalId: userDetails.portalId,
                    auth_is_valid: true,
                };

                if (!this.credential) {
                    let credentialSearch = await Credential.find({
                        portalId: userDetails.portalId,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await Credential.create(updatedToken);
                    } else if (credentialSearch.length === 1) {
                        if (credentialSearch[0].user === this.userId) {
                            this.credential = await Credential.findOneAndUpdate(
                                { _id: credentialSearch[0] },
                                { $set: updatedToken },
                                { useFindAndModify: true, new: true }
                            );
                        } else {
                            debug(
                                'Somebody else already created a credential with the same portal ID'
                            );
                        }
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same portal ID'
                        );
                    }
                } else {
                    this.credential = await Credential.findOneAndUpdate(
                        { _id: this.credential },
                        { $set: updatedToken },
                        { useFindAndModify: true, new: true }
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                await this.markCredentialsInvalid();
            }
        }
    }
}

module.exports = Manager;
