const Api = require('./Api');
const { Credential, Entity } = require('@friggframework/models');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');
const ModuleConstants = require('../ModuleConstants');
const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');

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
            instance.entity = await instance.entityMO.get(params.entityId);
            const credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            instance.credential = credential;
            hubspotParams.access_token = credential.accessToken;
            hubspotParams.refresh_token = credential.refreshToken;
        }
        instance.api = await new Api(hubspotParams);

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
            type: ModuleConstants.authType.oauth2,
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

        const search = await this.entityMO.list({
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
            this.entity = await this.entityMO.create(createObj);
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
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
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
                    let credentialSearch = await this.credentialMO.list({
                        portalId: userDetails.portalId,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await this.credentialMO.create(
                            updatedToken
                        );
                    } else if (credentialSearch.length === 1) {
                        if (credentialSearch[0].user === this.userId) {
                            this.credential = await this.credentialMO.update(
                                credentialSearch[0],
                                updatedToken
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
                    this.credential = await this.credentialMO.update(
                        this.credential,
                        updatedToken
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
