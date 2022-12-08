const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager, ModuleConstants } = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./entity');
const { Credential } = require('./credential');

const Config = require('./defaultConfig.json');
const AuthFields = require('./authFields');

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
            instance.credential = await await Credential.findById(
                instance.entity.credential
            );
            managerParams.store_id = instance.credential.store_id;
            managerParams.secret = instance.credential.secret;
        } else if (params.credentialId) {
            instance.credential = await Credential.findById(
                params.credentialId
            );
            managerParams.store_id = instance.credential.store_id;
            managerParams.secret = instance.credential.secret;
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
            url: null,
            type: ModuleConstants.authType.apiKey,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            }
        };
    }

    async processAuthorizationCallback(params) {
        const store_id = get(params.data, 'store_id', null);
        const secret = get(params.data, 'secret', null);
        this.api = new Api({ store_id, secret });

        await this.findOrCreateCredential({
            store_id,
            secret
        });

        await this.findOrCreateEntity({
            store_id,
            secret
        });
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateCredential(params){
        const store_id = get(params.data, 'store_id', null);
        const secret = get(params.data, 'secret', null);

        const search = await Entity.find({
            user: this.userId,
            store_id,
            secret,
        })

        if (search.length === 0){
            const createObj = {
                user: this.userId,
                store_id,
                secret,
            };
            this.credential = await Credential.create(createObj);
        } else if (search.length === 1) {
            this.credential = search[0];
        }else {
            debug(
                'Multiple credentials found with the same Client ID',
                store_id,
                secret
            )
        }
    }

    async findOrCreateEntity(params) {
        const store_id = get(params.data, 'store_id', null);
        const secret = get(params.data, 'secret', null);
        const name = get(params, 'name', null);

        const search = await Entity.find({
            user: this.userId,
            externalId: store_id,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: store_id,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same external ID:', store_id);
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
}
module.exports = Manager;
