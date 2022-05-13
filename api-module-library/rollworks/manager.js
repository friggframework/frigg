const Api = require('./api');
const Entity = require('./models/entity');
const Credential = require('./models/credential');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');
const ModuleConstants = require('../ModuleConstants');
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
        const rollworksParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            if (instance.entity.credential) {
                instance.credential = await instance.credentialMO.get(
                    instance.entity.credential
                );
                rollworksParams.access_token = instance.credential.access_token;
                rollworksParams.refresh_token =
                    instance.credential.refresh_token;
            }
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            rollworksParams.access_token = instance.credential.access_token;
            rollworksParams.refresh_token = instance.credential.refresh_token;
        }

        instance.api = await new Api(rollworksParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);

        // Gotta search for credential since it's not returned by the functions
        const credentials = await this.credentialMO.list({ user: this.userId });

        if (credentials.length === 0) {
            throw new Error('Credentials failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        const accountDetails = await this.api.getOrganization();
        const { eid, name } = accountDetails.results;
        const entity = await this.findOrCreateEntity({
            accountName: name,
            accountId: eid,
            credentialId: credentials[0]._id,
        });

        this.credential = credentials[0];
        this.entity = entity;

        return {
            // id: entity.id,
            credential_id: credentials[0]._id,
            entity_id: entity.id,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        await this.api.getOrganization();
    }

    async getEntityOptions() {
        const options = [];
        return options;
    }

    async findOrCreateEntity(params) {
        const accountId = get(params, 'accountId');
        const accountName = get(params, 'accountName');
        const credentialId = get(params, 'credentialId');

        const search = await this.entityMO.list({
            externalId: accountId,
            user: this.userId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: credentialId,
                user: this.userId,
                name: accountName,
                externalId: accountId,
            };
            return this.entityMO.create(createObj);
        }
        if (search.length === 1) {
            return search[0];
        }

        throw new Error(
            `Multiple entities found with the same organization ID: ${data.organization_id}`
        );
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
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                // todo update the database
                const updatedToken = {
                    user: this.userId,
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    expires_at: this.api.accessTokenExpire,
                    // refreshTokenExpire: this.api.refreshTokenExpire,
                };
                // let entity = await this.entityMO.getByUserId(this.userId);

                // if (!entity) {
                //     entity = await this.entityMO.create({ user: this.userId });
                // }
                // let { credential } = entity;
                const credentials = await this.credentialMO.list({
                    user: this.userId,
                });
                let credential;
                if (credentials.length === 1) {
                    credential = credentials[0];
                } else if (credentials.length > 1) {
                    throw new Error('User has multiple credentials???');
                }
                if (!credential) {
                    credential = await this.credentialMO.create(updatedToken);
                } else {
                    credential = await this.credentialMO.update(
                        credential._id,
                        updatedToken
                    );
                }
                // await this.entityMO.update(entity.id, { credential });
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }

            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                const credentials = await this.credentialMO.list({
                    user: this.userId,
                });
                if (credentials.length === 1) {
                    return this.credentialMO.update(credentials[0]._id, {
                        auth_is_valid: false,
                    });
                }
                if (credentials.length > 1) {
                    throw new Error('User has multiple credentials???');
                } else if (credentials.length === 0) {
                    throw new Error(
                        'How are we marking nonexistant credentials invalid???'
                    );
                }
            }
        }
    }
}

module.exports = Manager;
