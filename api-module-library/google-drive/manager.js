const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return config.name;
    }

    static async getInstance(params) {
        let instance = new this(params);

        /* eslint-disable camelcase */
        const apiParams = {
            client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
            client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
            redirect_uri: `${process.env.REDIRECT_URI}/google-drive`,
            scope: process.env.GOOGLE_DRIVE_SCOPE,
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            instance.credential = await Credential.findById(
                instance.entity.credential
            );
            apiParams.access_token = instance.credential.access_token;
            apiParams.refresh_token = instance.credential.refresh_token;
        } else if (params.credentialId) {
            instance.credential = await Credential.findById(
                params.credentialId
            );
            apiParams.access_token = instance.credential.access_token;
            apiParams.refresh_token = instance.credential.refresh_token;
        }
        instance.api = await new Api(apiParams);
        /* eslint-enable camelcase */
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

    getAuthorizationRequirements(params) {
        return {
            url: this.api.getAuthorizationUri(),
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        // For OAuth2, generate the token and store in this.credential and the DB
        await this.api.getTokenFromCode(code);
        // get entity identifying information from the api. You'll need to format this.
        const userDetails = await this.api.getUserDetails();
        await this.findOrCreateEntity({
            externalId: userDetails.emailAddress,
            name: userDetails.displayName,
        });

        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async getEntityOptions() {
        // No entity options to get. Probably won't even hit this
        return [];
    }

    async findOrCreateEntity(data) {
        const externalId = get(data, 'externalId');
        const name = get(data, 'name');

        const search = await Entity.find({
            user: this.userId,
            externalId: externalId,
        });
        if (search.length === 0) {
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name,
                externalId: externalId,
            };
            this.entity = await Entity.create(createObj);
        } else if (search.length === 1) {
            this.entity = await Entity.findOneAndUpdate(
                { _id: search[0] },
                { $set: {
                        credential: this.credential.id
                    }},
                { useFindAndModify: true, new: true }
            );
        } else {
            debug(
                'Multiple entities found with the same external ID:',
                externalId
            );
            throw new Error(
                `Multiple entities found with the same external ID: ${externalId}`
            );
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

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                const userDetails = await this.api.getUserDetails();
                const updatedToken = {
                    user: this.userId.toString(),
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    expires_in: this.api.expires_in,
                    auth_is_valid: true,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] == null && delete updatedToken[k]
                );

                if (!this.credential) {
                    let credentialSearch = await Credential.find({
                        externalId: userDetails.emailAddress,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await Credential.create(updatedToken);
                    } else if (credentialSearch.length === 1) {
                        if (credentialSearch[0].user === this.userId) {
                            this.credential = await Credential.findOneAndUpdate(
                                { _id: credentialSearch[0] },
                                { $set: updatedToken },
                                { useFindAndModify: true, new: true }
                            );
                        } else {
                            debug(
                                'Somebody else already created a credential with the same externalId (email address):',
                                userDetails.emailAddress
                            );
                        }
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same externalId (email address):',
                            userDetails.emailAddress
                        );
                    }
                } else {
                    this.credential = await Credential.findOneAndUpdate(
                        { _id: this.credential },
                        { $set: updatedToken },
                        { useFindAndModify: true, new: true }
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

    async mark_credentials_invalid() {
        let credentials = await this.credentialMO.list({ user: this.userId });
        if (credentials.length === 1) {
            return await this.credentialMO.update(credentials[0]._id, {
                auth_is_valid: false,
            });
        } else if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        } else if (credentials.length === 0) {
            throw new Error(
                'How are we marking nonexistant credentials invalid???'
            );
        }
    }
}

module.exports = Manager;
