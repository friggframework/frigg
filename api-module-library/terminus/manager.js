const {
    ModuleManager,
    ModuleConstants,
    debug
} = require('@friggframework/core');
const {Api} = require('./api.js');
const {Entity} = require('./models/entity');
const {Credential} = require('./models/credential');

Config = require('./defaultConfig.json');

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

        // initializes the Api
        const terminusParams = {delegate: instance};
        if (params.entityId) {
            try {
                instance.entity = await Entity.findById(params.entityId);
                let credential = await Credential.findById(
                    instance.entity.credential
                );
                terminusParams.api_key = credential.apiKey;
            } catch (e) {
                debug(
                    `Error retrieving Salesforce credential for Entity ${instance.entity.id}`
                );
            }
        }
        instance.api = await new Api(terminusParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        if (await this.api.listFolders()) validAuth = true;
        return validAuth;
    }

    async getAuthorizationRequirements(params) {
        return {
            // url: await this.api.getAuthUri(),
            type: ModuleConstants.authType.apiKey,
            jsonSchema: {
                // "title": "Authorization Credentials",
                // "description": "A simple form example.",
                type: 'object',
                required: ['api_key'],
                properties: {
                    api_key: {
                        type: 'string',
                        title: 'Username',
                    },
                },
            },
            uiSchema: {
                api_key: {
                    'ui:help': 'The API Key you use to access the Terminus API',
                    'ui:placeholder': 'User API Key',
                },
            },
        };
    }

    async processAuthorizationCallback(params) {
        // Create credential and entity?
        const api_key = get(params.data, 'apiKey');
        await this.api.setApiKey(api_key);
        const isValid = await this.testAuth();
        if (isValid) {
            let credential, entity;
            const credentialSearch = await this.credentialMO.list({
                user: this.userId,
            });
            // If found, then credential key should match
            if (credentialSearch.length === 1) {
                if (credentialSearch[0].apiKey !== api_key) {
                    credential = await this.credentialMO.update(
                        credentialSearch[0]._id,
                        {apiKey: api_key}
                    );
                } else {
                    credential = await this.credentialMO.get(
                        credentialSearch[0]._id
                    );
                }
                const entityList = await this.entityMO.list({
                    credential: credential._id,
                });
                if (entityList.length === 1) {
                    entity = entityList[0];
                    if (entity._id.toString() !== this.entity._id.toString()) {
                        throw new Error(
                            'This credential is in use by another user'
                        );
                    }
                }
                if (entityList.length === 0) {
                    entity = await this.entityMO.update(this.entity._id, {
                        credential,
                    });
                }
            }

            // If not found, then create credential and entity
            if (credentialSearch.length === 0) {
                credential = await this.credentialMO.create({
                    apiKey: api_key,
                    user: this.userId,
                });
                entity = await this.entityMO.update(this.entity._id, {
                    credential,
                });
            }

            //This shouldn't happen
            if (credentialSearch.length > 1) {
                throw new Error(
                    "Shouldn't have more than one credential per user ID"
                );
            }

            return {
                credential_id: credential._id,
                entity_id: entity._id,
                type: Manager.getName(),
            };
        }
    }

    //------------------------------------------------------------

    async deauthorize() {
        // wipe api connection
        this.api = new Api({});

        // delete credentials from the database
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
    }

    // Likely never invoked, as there isn't anything to invoke it yet
    async receiveNotification(notifier, delegateString, object = null) {
        // if (notifier instanceof Api) {
        //     if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
        //         console.log(`should update the api key: ${object}`);
        //         const updatedToken = {
        //             apiKey: this.api.apiKey
        //         };
        //         let entity = await this.entityMO.getByUserId(this.userId);
        //         if (!entity) {
        //             entity = await this.entityMO.create({
        //                 user: this.userId,
        //             });
        //         }
        //         let { credential } = entity;
        //         if (!credential) {
        //             credential = await this.credentialMO.create(
        //                 updatedToken
        //             );
        //         } else {
        //             credential = await this.credentialMO.update(
        //                 credential,
        //                 updatedToken
        //             );
        //         }
        //         await this.entityMO.update(entity.id, { credential });
        //     }
        //     if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
        //         await this.deauthorize();
        //         console.log(this.checkUserAuthorized());
        //     }
        // }
    }
}

module.exports = Manager;
