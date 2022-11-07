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
            managerParams.accessToken = instance.credential.accessToken;
        } else if (params.credentialId) {
            instance.credential = await Credential.findById(
                params.credentialId
            );
            managerParams.accessToken = instance.credential.accessToken;
        }
        instance.api = await new Api(managerParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: null,
            type: ModuleConstants.authType.accessToken,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async processAuthorizationCallback(params) {
        const apiKey = get(params.data, 'accessToken', null);
        this.api = new Api({ apiKey });

        await this.findOrCreateCredential({
            accessToken,
        });
        await this.findOrCreateEntity({
            accessToken,
        });
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateCredential(params) {
        const accessToken = get(params.data, 'accessToken', null);

        const search = await Entity.find({
            user: this.userId,
            accessToken,
        });

        if (search.length === 0) {
            const createObj = {
                user: this.userId,
                accessToken,
            };
            this.credential = await Credential.create(createObj);
        } else if (search.length === 1) {
            this.credential = search[0];
        } else {
            debug(
                'Multiple credentials found with the same Client ID:',
                accessToken
            );
        }
    }

    async findOrCreateEntity(params) {
        const accessToken = get(params.data, 'accessToken', null);
        const name = get(params, 'name', null);

        const search = await Entity.find({
            user: this.userId,
            externalId: accessToken,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: accessToken,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same external ID:',
                accessToken
            );
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
