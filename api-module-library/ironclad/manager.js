const _ = require('lodash');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const { get } = require('@friggframework/assertions');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
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

        let managerParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            managerParams.apiKey = instance.credential.apiKey;
        } else if (params.credentialId) {
            instance.credential = await Credential.findById(
                params.credentialId
            );
            managerParams.apiKey = instance.credential.apiKey;
        }
        instance.api = await new Api(managerParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
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
        const apiKey = get(params.data, 'apiKey', null);
        const subdomain = get(params.data, 'subdomain', null);
        this.api = new Api({ apiKey, subdomain });

        await this.findOrCreateCredential({
            apiKey,
        });
        await this.findOrCreateEntity({
            apiKey,
        });
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateCredential(params) {
        const apiKey = get(params.data, 'apiKey', null);

        const search = await Entity.find({
            user: this.userId,
            apiKey,
        });

        if (search.length === 0) {
            const createObj = {
                user: this.userId,
                apiKey,
            };
            this.credential = await Credential.create(createObj);
        } else if (search.length === 1) {
            this.credential = search[0];
        } else {
            debug(
                'Multiple credentials found with the same Client ID:',
                apiKey
            );
        }
    }

    async findOrCreateEntity(params) {
        const apiKey = get(params.data, 'apiKey', null);
        const name = get(params, 'name', null);

        const search = await Entity.find({
            user: this.userId,
            externalId: apiKey,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: apiKey,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same external ID:', apiKey);
            this.throwException('');
        }
    }

    async deauthorize() {
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.find({ user: this.userId });
        if (entity.credential) {
            await Credential.deleteOne({ _id: entity.credential });
            entity.credential = undefined;
            await entity.save();
        }
    }
}

module.exports = Manager;
