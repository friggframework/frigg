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
const { flushDebugLog } = require('@friggframework/logs');
const { createHash } = require('crypto');

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
            if (instance.credential.subdomain)
                managerParams.subdomain = instance.credential.subdomain;
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
        const subType = get(params.data, 'subType', null);
        this.userId = this.userId || get(params, 'userId');
        this.api = new Api({ apiKey, subdomain });
        const authRes = await this.testAuth();
        if (!authRes) throw new Error('Auth Error');

        // Grab identifying information if available.
        // Currently not available in the Ironclad API

        await this.findOrCreateCredential({
            apiKey,
            subType,
            subdomain,
        });
        await this.findOrCreateEntity({
            apiKey,
            subType,
            subdomain,
        });
        const returnObj = {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
        // TODO this... kinda sucks (we don't want subType to be returned normally, however,
        //  there's probably a cleaner code pattern. But also, we're probably
        //  getting rid of Manager classes altogether
        if (subType) returnObj.subType = subType;

        return returnObj;
    }

    async findOrCreateCredential(params) {
        const apiKey = get(params, 'apiKey', null);
        const subdomain = get(params, 'subdomain', null);
        const subType = get(params, 'subType', null);

        const search = await Credential.find({
            user: this.userId,
            apiKey,
            subType,
            subdomain,
        });

        if (search.length === 0) {
            const createObj = {
                user: this.userId,
                apiKey,
                subType,
                subdomain,
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
        const apiKey = get(params, 'apiKey', null);
        const name = get(params, 'name', null);
        const subType = get(params, 'subType', null);
        const externalId = createHash('sha256').update(apiKey).digest('hex');

        const search = await Entity.find({
            user: this.userId,
            externalId,
            subType,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                subType,
                externalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same external ID:', apiKey);
            this.throwException('');
        }
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.listWebhooks()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
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
