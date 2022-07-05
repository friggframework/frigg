const _ = require('lodash');
const { Api } = require('./api.js');
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

    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);

        const slParams = { delegate: instance };
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            const credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            slParams.access_token = credential.access_token;
            slParams.refresh_token = credential.refresh_token;
        } else if (params.credentialId) {
            const credential = await instance.credentialMO.get(
                params.credentialId
            );
            slParams.access_token = credential.access_token;
            slParams.refresh_token = credential.refresh_token;
        }
        instance.api = await new Api(slParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async testAuth() {
        await this.api.getTeam();
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);

        const credentials = await this.credentialMO.list({ user: this.userId });
        const entitySearch = await this.entityMO.list({ user: this.userId });
        let entity;

        await this.testAuth();

        const teamDetails = await this.api.getTeam();

        if (entitySearch.length === 0) {
            const createObj = {
                credential: credentials[0]._id,
                user: this.userId,
                name: teamDetails.data.name,
                externalId: teamDetails.data.id,
            };
            entity = await this.entityMO.create(createObj);
        } else {
            entity = entitySearch[0];
        }

        if (credentials.length === 0) {
            throw new Error('Credentials failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        return {
            credential_id: credentials[0].id,
            entity_id: entity.id,
            type: Manager.getName(),
        };
    }

    async deauthorize() {
        this.api = new Api();

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
                const updatedToken = {
                    user: this.userId,
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    expires_at: this.api.accessTokenExpire,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] === null && delete updatedToken[k]
                );
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
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
        }
    }

    async mark_credentials_invalid() {
        const credentials = await this.credentialMO.list({ user: this.userId });
        if (credentials.length === 1) {
            return await this.credentialMO.update(credential[0]._id, {
                auth_is_valid: false,
            });
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        } else if (credentials.lenth === 0) {
            throw new Error(
                'How are we marking noexistant credentials invalid???'
            );
        }
    }
}

module.exports = Manager;
