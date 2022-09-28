const _ = require('lodash');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
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

        let ironcladParams;

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            if (instance.entity.credential) {
                instance.credential = await instance.credentialMO.get(
                    instance.entity.credential
                );
                ironcladParams = {
                    apiKey: instance.credential.apiKey,
                };
            }
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            ironcladParams = {
                apiKey: instance.credential.apiKey,
            };
        }
        if (ironcladParams) {
            instance.api = await new Api(ironcladParams);
        }

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: null,
            type: ModuleConstants.authType.apiKey,
        };
    }

    async processAuthorizationCallback(params) {
        const apiKey = get(params.data, 'apiKey');
        this.api = new Api({ apiKey });

        const credentials = await this.credentialMO.list({ user: this.userId });

        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        const credential = await this.credentialMO.upsert({ user: this.userId }, {
            user: this.userId,
            api_key: apiKey,
        })

        const entity = await this.entityMO.getByUserId(this.userId);

        return {
            credential_id: credential.id,
            entity_id: entity.id,
            type: Manager.getName(),
        };
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
}

module.exports = Manager;
