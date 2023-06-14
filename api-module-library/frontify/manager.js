const {debug, flushDebugLog} = require('@friggframework/logs');
const {get} = require('@friggframework/assertions');
const {ModuleManager} = require('@friggframework/module-plugin');
const {Api} = require('./api');
const {Entity} = require('./models/entity');
const {Credential} = require('./models/credential');
const Config = require('./defaultConfig');

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
        const frontifyParams = {
            client_id: process.env.FRONTIFY_CLIENT_ID,
            client_secret: process.env.FRONTIFY_CLIENT_SECRET,
            redirect_uri: `${process.env.REDIRECT_URI}/frontify`,
            scope: process.env.FRONTIFY_SCOPE,
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            frontifyParams.access_token = credential.accessToken;
            frontifyParams.refresh_token = credential.refreshToken;
            frontifyParams.domain = credential.domain;
        }
        instance.api = new Api(frontifyParams);

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getUser()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    getAuthorizationRequirements() {
        return {
            url: this.api.getAuthUri(),
            type: 'oauth2',
            data: {
                jsonSchema: {
                    title: 'Auth Form',
                    type: 'object',
                    required: ['domain'],
                    properties: {
                        domain: {
                            type: 'string',
                            title: 'Your Frontify Domain',
                        }
                    }
                },
                uiSchema: {
                    domain: {
                        'ui:help':
                            'A Frontify domain, e.g: lefthook.frontify.com',
                        'ui:placeholder': 'Your Frontify domain...',
                    },
                }
            }
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code', 'test');
        const domain = get(params.data, 'domain');

        this.api.setDomain(domain);

        await this.api.getTokenFromCode(code);

        const authCheck = await this.testAuth();
        if (!authCheck) throw new Error('Authentication failed');

        const {user: userDetails} = await this.api.getUser();

        await this.findOrCreateEntity({
            externalId: userDetails.id,
            name: userDetails.name
        });

        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const externalId = get(params, 'externalId');
        const name = get(params, 'name');

        // TODO-new... this doesn't allow for multiple entities for a specific User.
        const search = await Entity.find({
            user: this.userId,
            externalId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            const message = 'Multiple entities found with the same external ID: ' + externalId;
            debug(message);
            throw new Error(message);
        }
    }

    //------------------------------------------------------------

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                const updatedToken = {
                    user: this.userId.toString(),
                    accessToken: this.api.access_token,
                    refreshToken: this.api.refresh_token,
                    domain: this.api.domain,
                    auth_is_valid: true,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] == null && delete updatedToken[k]
                );
                // TODO-new globally... multiple credentials should be allowed, this is 1:1
                if (!this.credential) {
                    let credentialSearch = await Credential.find({
                        user: this.userId.toString(),
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await Credential.create(updatedToken);
                    } else if (credentialSearch.length === 1) {
                        this.credential = await Credential.findOneAndUpdate(
                            {_id: credentialSearch[0]},
                            {$set: updatedToken},
                            {useFindAndModify: true, new: true}
                        );
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same user ID: ' + this.userId
                        );
                    }
                } else {
                    this.credential = await Credential.findOneAndUpdate(
                        {_id: this.credential},
                        {$set: updatedToken},
                        {useFindAndModify: true, new: true}
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                return this.markCredentialsInvalid();
            }
        }
    }

    // TODO-new (globally) normalize "deauthorization"
    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.findByUserId(this.userId);
        if (entity.credential) {
            await Credential.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
        this.credential = undefined;
    }
}

module.exports = Manager;
