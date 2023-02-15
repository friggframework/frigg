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
const { flushDebugLog, debug } = require('@friggframework/logs');
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
        // Some credentials will not have proper access/permissions
        let connectionInfo;
        try {
            connectionInfo = await this.api.getConnectionInformation();
        } catch (e) {
            debug('No permission to get connection information');
        }

        await this.upsertCredential({
            apiKey,
            subType,
            subdomain,
        });
        await this.upsertEntity({
            externalId:
                connectionInfo?.companyId ||
                createHash('sha256').update(apiKey).digest('hex'),
            subType,
            subdomain,
            name: connectionInfo?.companyName || null,
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

    async upsertCredential(params) {
        const apiKey = get(params, 'apiKey', null);
        const subdomain = get(params, 'subdomain', null);
        const subType = get(params, 'subType', null);

        this.credential = await Credential.findOneAndUpdate(
            {
                user: this.userId,
                apiKey,
                subType,
                subdomain,
            },
            { $set: { user: this.userId, apiKey, subType, subdomain } },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
    }

    async upsertEntity(params) {
        const name = get(params, 'name', null);
        const subType = get(params, 'subType', null);
        const externalId = get(params, 'externalId', null);

        this.entity = await Entity.findOneAndUpdate(
            {
                user: this.userId,
                externalId,
                subType,
            },
            {
                $set: {
                    credential: this.credential.id,
                    user: this.userId,
                    name,
                    subType,
                    externalId,
                },
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
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
