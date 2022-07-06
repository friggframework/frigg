const _ = require('lodash');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');
const ModuleConstants = require('../ModuleConstants');
const AuthFields = require('./authFields');
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

        let activeCampaignParams;

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            if (instance.entity.credential) {
                instance.credential = await instance.credentialMO.get(
                    instance.entity.credential
                );
                activeCampaignParams = {
                    apiKey: instance.credential.api_key,
                    apiUrl: instance.credential.api_url,
                };
            }
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            activeCampaignParams = {
                apiKey: instance.credential.api_key,
                apiUrl: instance.credential.api_url,
            };
        }
        if (activeCampaignParams) {
            instance.api = await new Api(activeCampaignParams);
        }

        return instance;
    }

    async getAuthorizationRequirements(params) {
        // see parent docs. only use these three top level keys
        return {
            url: null,
            type: ModuleConstants.authType.apiKey,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async processAuthorizationCallback(params) {
        const apiUrl = get(params.data, 'apiUrl');
        const apiKey = get(params.data, 'apiKey');
        this.api = new Api({ apiUrl, apiKey });
        const userDetails = await this.api.getUserDetails();

        const byUserId = { user: this.userId };
        const credentials = await this.credentialMO.list(byUserId);

        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        const credential = await this.credentialMO.upsert(byUserId, {
            user: this.userId,
            api_url: apiUrl,
            api_key: apiKey,
        });

        const byUserIdAndCredential = {
            ...byUserId,
            credential: credential.id,
        };
        const entity = await this.entityMO.upsert(byUserIdAndCredential, {
            user: this.userId,
            credential: credential.id,
            name: userDetails.user.username,
            externalId: userDetails.user.id,
        });

        return {
            entity_id: entity.id,
            credential_id: credential.id,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        await this.api.getUserDetails();
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
}

module.exports = Manager;
