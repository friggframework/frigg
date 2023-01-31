const { debug, flushDebugLog } = require('@friggframework/logs');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
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

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);
        // All async code here

        // initializes the Api
        const teamsParams = {
            client_id: process.env.TEAMS_CLIENT_ID,
            client_secret: process.env.TEAMS_CLIENT_SECRET,
            redirect_uri: `${process.env.REDIRECT_URI}`,
            scope: process.env.TEAMS_SCOPE,
            forceConsent: true,
            delegate: instance,
        };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            teamsParams.access_token = credential.accessToken;
            teamsParams.refresh_token = credential.refreshToken;
        }
        instance.api = new Api(teamsParams);

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

    async getAuthorizationRequirements() {
        return {
            url: await this.api.getAuthUri(),
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code', 'test');
        await this.api.getTokenFromCode(code);
        const authCheck = await this.testAuth();
        if (!authCheck) throw new Error('Authentication failed');

        const orgDetails = await this.api.getOrganization();

        await this.findOrCreateEntity({
            externalId: orgDetails.id,
            name: orgDetails.displayName,
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
            debug('Multiple entities found with the same portal ID:', portalId);
            this.throwException('');
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
                            { _id: credentialSearch[0] },
                            { $set: updatedToken },
                            { useFindAndModify: true, new: true }
                        );
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same client ID:'
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
