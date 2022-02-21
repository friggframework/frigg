const Api = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential.js');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');

// the name used for the entity type, generally
const MANAGER_NAME = 'monday';

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
        let instance = new this(params);

        // initializes the Api
        const mondayParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            if (instance.entity.credential) {
                instance.credential = await instance.credentialMO.get(
                    instance.entity.credential
                );
                mondayParams.access_token = instance.credential.access_token;
                mondayParams.refresh_token = instance.credential.refresh_token;
            }
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            mondayParams.access_token = instance.credential.access_token;
            mondayParams.refresh_token = instance.credential.refresh_token;
        }
        instance.api = await new Api(mondayParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const code = this.getParam(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);

        // Gotta search for credential since it's not returned by the functions
        let credentials = await this.credentialMO.list({ user: this.userId });

        // TODO schema?
        if (credentials.length === 0) {
            throw new Error('Credentials failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        const accountDetails = await this.api.getAccount();

        const { id: accountId, name: accountName } =
            accountDetails.data.account;
        const entity = await this.findOrCreateEntity({
            accountName,
            accountId,
            credentialId: credentials[0].id,
        });

        this.credential = credentials[0];
        this.entity = entity;

        return {
            // id: entity.id,
            credential_id: credentials[0].id,
            entity_id: entity.id,
            type: Manager.getName(),
        };
    }
    async testAuth() {
        await this.api.getAccount();
    }

    async getEntityOptions() {
        let options = [];
        return options;
    }

    async findOrCreateEntity(params) {
        const accountId = this.getParam(params, 'accountId');
        const accountName = this.getParam(params, 'accountName');
        const credentialId = this.getParam(params, 'credentialId');

        let search = await this.entityMO.list({
            user: this.userId,
            externalId: accountId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            let createObj = {
                credential: credentialId,
                user: this.userId,
                name: accountName,
                externalId: accountId,
            };
            return this.entityMO.create(createObj);
        } else if (search.length === 1) {
            return search[0];
        } else {
            throw new Error(
                `Multiple entities found with the same organization ID: ${data.organization_id}`
            );
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
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                const updatedToken = {
                    user: this.userId,
                    access_token: this.api.access_token,
                };

                let credentials = await this.credentialMO.list({
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
        }
    }
}

module.exports = Manager;
