const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');
const { debug, flushDebugLog } = require('@friggframework/logs');
const AuthFields = require('./authFields');
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

        let managerParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            managerParams.clientKey = instance.credential.clientKey;
            managerParams.secret = instance.credential.secret;
        } else if (params.credentialId) {
            instance.credential = await Credential.findById(
                params.credentialId
            );
            managerParams.clientKey = instance.credential.clientKey;
            managerParams.secret = instance.credential.secret;
        }
        instance.api = await new Api(managerParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.listProducts()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: null,
            type: ModuleConstants.authType.basic,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async processAuthorizationCallback(params) {
        const clientKey = get(params.data, 'clientKey');
        const secret = get(params.data, 'secret');
        this.api.setClientKey(clientKey);
        this.api.setSecret(secret);
        await this.testAuth();

        await this.findOrCreateCredential({
            clientKey,
            secret,
        });

        await this.findOrCreateEntity({
            clientKey,
        });

        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateCredential(params) {
        const clientKey = get(params, 'clientKey');
        const secret = get(params, 'secret');

        const search = await Entity.find({
            user: this.userId,
            clientKey,
        });

        if (search.length === 0) {
            const createObj = {
                user: this.userId,
                clientKey,
                secret,
            };
            this.credential = await Credential.create(createObj);
        } else if (search.length === 1) {
            this.credential = search[0];
        } else {
            debug(
                'Multiple entities found with the same Client Key:',
                clientKey
            );
        }
    }

    async findOrCreateEntity(params) {
        const clientKey = get(params, 'clientKey');

        const search = await Entity.find({
            user: this.userId,
            externalId: clientKey,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name: clientKey,
                externalId: clientKey,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same Client Key:',
                clientKey
            );
        }
    }

    //------------------------------------------------------------

    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.find({ user: this.userId });
        if (entity.credential) {
            await Credential.deleteOne({ _id: entity.credential });
            entity.credential = undefined;
            await entity.save();
        }
        this.credential = undefined;
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                await this.markCredentialsInvalid();
            }
        }
    }
}

module.exports = Manager;
