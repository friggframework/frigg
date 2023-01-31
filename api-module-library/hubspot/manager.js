const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./entity');
const { Credential } = require('./credential');

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
        const hubspotParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            hubspotParams.access_token = credential.accessToken;
            hubspotParams.refresh_token = credential.refreshToken;
        }
        instance.api = new Api(hubspotParams);

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
        await this.getAccessToken(code);
        const userDetails = await this.api.getUserDetails();

        await this.findOrCreateEntity({
            portalId: userDetails.portalId,
            domainName: userDetails.hub_domain,
        });
        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const portalId = get(params, 'portalId');
        const domainName = get(params, 'domainName');

        const search = await Entity.find({
            user: this.userId,
            externalId: portalId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name: domainName,
                externalId: portalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same portal ID:', portalId);
            this.throwException('');
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

    async getAccessToken(code) {
        return this.api.getTokenFromCode(code);
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
                    let credentialSearch = await Credential.list({
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
                                'Somebody else already created a credential with the same portal ID:',
                                portalId
                            );
                        }
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same portal ID:',
                            portalId
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
