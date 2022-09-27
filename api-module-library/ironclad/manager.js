const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./entity');
const { Credential } = require('./credential');

const MANAGER_NAME = 'ironclad';

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return MANAGER_NAME;
    }

    static async getInstance(params) {
        let instance = new this(params);

        const managerParams = { delegate: instance };
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            managerParams.access_token = instance.credential.access_token;
            managerParams.refresh_token = instance.credential.refresh_token;
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            managerParams.access_token = instance.credential.access_token;
            managerParams.refresh_token = instance.credential.refresh_token;
        }
        instance.api = await new Api(managerParams);

        return instance;
    }

    // Change to whatever your api uses to return identifying information
    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getUserDetails()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        // For OAuth2, generate the token and store in this.credential and the DB
        await this.api.getTokenFromCode(code);
        // get entity identifying information from the api. You'll need to format this.
        const entityDetails = await this.api.getEntityDetails();
        await this.findOrCreateEntity(entityDetails);

        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async getEntityOptions() {
        // No entity options to get. Probably won't even hit this
        return [];
    }

    async findOrCreateEntity(data) {
        // TODO this should be a changed to your entity needs
        const identifier = get(params, 'identifier');
        const name = get(params, 'name');

        const search = await Entity.find({
            user: this.userId,
            externalId: identifier,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: identifier,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same external ID:',
                identifier
            );
            this.throwException('');
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

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                const userDetails = await this.api.getTokenIdentity();
                const updatedToken = {
                    user: this.userId.toString(),
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    auth_is_valid: true,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] == null && delete updatedToken[k]
                );

                if (!this.credential) {
                    // What are we identifying the credential by?
                    // TODO this needs to change for your API. This is how we do it for HubSpot ("Portal ID")
                    let credentialSearch = await Credential.list({
                        identifier: userDetails.identifier,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await Credential.create(updatedToken);
                    } else if (credentialSearch.length === 1) {
                        if (credentialSearch[0].user === this.userId) {
                            this.credential = await Credential.update(
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
                    this.credential = await Credential.update(
                        this.credential,
                        updatedToken
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                return this.markCredentialsInvalid();
            }
        }
    }

    async mark_credentials_invalid() {
        let credentials = await this.credentialMO.list({ user: this.userId });
        if (credentials.length === 1) {
            return await this.credentialMO.update(credentials[0]._id, {
                auth_is_valid: false,
            });
        } else if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        } else if (credentials.length === 0) {
            throw new Error(
                'How are we marking nonexistant credentials invalid???'
            );
        }
    }
}

module.exports = Manager;
