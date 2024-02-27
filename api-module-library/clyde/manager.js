const { debug, flushDebugLog, get } = require('@friggframework/core');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const {
    ModuleManager,
    ModuleConstants,
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
        // All async code here

        // initializes the Api
        const apiParams = {
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            apiParams.clientKey = credential.clientKey;
            apiParams.secret = credential.secret;
        }
        instance.api = await new Api(apiParams);

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
                jsonSchema: {
                    type: 'object',
                    required: ['clientKey', 'secret'],
                    properties: {
                        clientKey: {
                            type: 'string',
                            title: 'Client Key',
                        },
                        secret: {
                            type: 'string',
                            title: 'Secret',
                        },
                    },
                },
                uiSchema: {
                    clientKey: {
                        'ui:help':
                            'To obtain your Client Key and Secret, log in and head to settings. You can find your Keys in the "Developers" section.',
                        'ui:placeholder': 'Client Key',
                    },
                    secret: {
                        'ui:widget': 'password',
                        'ui:help':
                            'Your secret is obtained along with your Client Key',
                        'ui:placeholder': 'secret',
                    },
                },
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
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateCredential(params) {
        const clientKey = get(params, 'clientKey');
        const secret = get(params, 'secret');

        const search = await this.credentialMO.list({
            user: this.userId,
            clientKey,
        });

        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                user: this.userId,
                clientKey,
                secret,
            };
            this.credential = await this.credentialMO.create(createObj);
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

        const search = await this.entityMO.list({
            user: this.userId,
            externalId: clientKey,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name: clientKey,
                externalId: clientKey,
            };
            this.entity = await this.entityMO.create(createObj);
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
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
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
