const Api = require('./Api.js');
const Entity = require('./Entity');
const PrimaryEntity = require('../HubSpot/models/Entity');
const Credential = require('./Credential.js');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');

class MarketoManager extends ModuleManager {
    static Credential = Credential;
    static Entity = Entity;

    constructor(params) {
        super(params);
    }

    static getName() {
        return 'marketo';
    }

    static async getInstance(params = {}) {
        // if there's an entityId, retrieving the entity and retrieving the credential connected to the entity, then passing whatever is needed into the args for the API
        // if there's a credentialId, retrieving the credential and passing those as args for the API constructor (default to entity... so an else if here)
        // Instantiating the API class with the args passed in, appending it to the instance of the manager (instance.api), and returning the instance.
        // (Noting for posterity... this is definitely based on a different module that uses a tangled concept... should be cleaner and hence the refactor you'll see in the crossbeam API module. Also may benefit from just removing altogether from the Manager class and making it part of the ModuleManager base class)

        const instance = new MarketoManager(params);

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);

            if (!instance.entity) {
                throw new Error(`No entity exists with ID ${params.entityId}`);
            }

            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );

            if (!instance.credential) {
                throw new Error('Marketo credentials not found');
            }
        }

        instance.api = new Api({
            delegate: instance,
            munchkin_id: instance.entity?.munchkin_id,
            client_id: instance.credential?.client_id,
            client_secret: instance.credential?.client_secret,
        });

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            type: 'Form',
            data: {
                jsonSchema: {
                    title: 'Authorization Credentials',
                    description: 'A simple form example.',
                    type: 'object',
                    required: ['munchkin_id', 'services'],
                    properties: {
                        munchkin_id: {
                            type: 'string',
                            title: 'Please enter your Munchkin ID.',
                        },
                        services: {
                            type: 'array',
                            title: 'Services',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string',
                                        title: 'Please enter the name of the service.',
                                    },
                                    client_id: {
                                        type: 'string',
                                        title: 'Please enter the client_id for the service.',
                                    },
                                    client_secret: {
                                        type: 'string',
                                        title: 'Please enter the client_secret for the service.',
                                    },
                                },
                                required: [
                                    'name',
                                    'client_id',
                                    'client_secret',
                                ],
                            },
                        },
                    },
                },
                uiSchema: {
                    'ui:order': ['munchkin_id', 'services'],
                    munchkin_id: {
                        'ui:help': 'The Munchkin ID for the Marketo account',
                    },
                    services: {
                        'ui:help': 'Please add 1 or more services',
                    },
                },
            },
        };
    }

    async processAuthorizationCallback(params) {
        // Update the API class (as needed) with params.data to do whatever is needed to get an authenticated request to the API. For OAuth this means generateTokenFromCode, for your client_credentials grant it means a slide modification.

        const { munchkin_id, services } = params.data;
        const created = [];

        for (const service of services) {
            const { service_name, client_id, client_secret } = service;

            const credential = await this.credentialMO.upsert(
                {
                    user: this.userId,
                    client_id,
                },
                {
                    client_secret,
                }
            );

            const entity = await this.entityMO.upsert(
                {
                    munchkin_id,
                    externalId: client_id,
                    user: this.userId,
                },
                {
                    name: service_name,
                    credential: credential._id,
                }
            );

            created.push({ entity, credential });
        }

        const primaryEntity = await PrimaryEntity.Model.upsert(
            {
                user: this.userId,
            },
            {
                user: this.userId,
            }
        );

        // TODO how to pick one?
        const { entity, credential } = created[0];

        this.api.munchkin_id = entity.munchkin_id;
        this.api.client_id = credential.client_id;
        this.api.client_secret = credential.client_secret;

        // testAuth to confirm valid credentials
        await this.testAuth();

        // If the Entity : Credential relationship is 1:1, then searchOrCreateEntity. In some cases, this means using an API request to look up the externalId and name for the Entity (typically an "Account ID" and "Account Name"), in other cases you'll have this info as part of the params.data object.

        // Return the credential_id, entity_id (null if not available yet), and type (just the Manager Name) as an object.
        return {
            type: MarketoManager.getName(),
            primary_entity_id: primaryEntity._id,
            entity_id: entity._id,
            credential_id: credential._id,
        };
    }

    async testAuth() {
        await this.api.refreshAuth();

        const response = await this.api.describeLeads();

        if (this.api.checkExpired(response)) {
            throw new Error('Not authenticated to Marketo');
        }
    }

    //------------------------------------------------------------

    async deauthorize() {
        // Wipe API connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await this.entityMO.getByUserId(this.userId);

        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (!(notifier instanceof Api)) return;

        if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        } else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            const credentials = await this.credentialMO.list({
                user: this.userId,
            });
            if (credentials.length === 1) {
                return (this.credential = this.credentialMO.update(
                    credentials[0]._id,
                    { auth_is_valid: false }
                ));
            }
            if (credentials.length > 1) {
                throw new Error('User has multiple credentials???');
            } else if (credentials.length === 0) {
                throw new Error(
                    'How are we marking nonexistant credentials invalid???'
                );
            }
        }
    }
}

module.exports = MarketoManager;
