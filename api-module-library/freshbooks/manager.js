const { ModuleManager, get, debug, flushDebugLog } = require('@friggframework/core-rollup');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const { IndividualUser } = require('./models/IndividualUser');
const { Api } = require('./api');
const config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;
    constructor(params) {
        super(params);
        this.api = new Api({});
        this.credential = null;
        this.entity = null;
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
        let credential, entity;
        const apiParams = {
            delegate: instance,
            client_id: process.env.FRESHBOOKS_CLIENT_ID,
            client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
            redirect_uri: `${process.env.REDIRECT_URI}/freshbooks`,
        };

        if (params.entityId) {
            entity = await Entity.findOne({ _id: params.entityId });
            if (!entity)
                throw new Error(
                    `Freshbooks Module: getInstance: No entity found for id: ${params.entityId}`
                );

            credential = await Credential.findOne({ _id: entity.credential });
        }
        instance.api = new Api(apiParams);
        if (entity) {
            instance.setEntity(entity);
        }
        if (credential) {
            instance.setCredential(credential);
        }

        return instance;
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getUserInfo()) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    getAuthorizationRequirements(params) {
        return {
            url: this.api.getAuthUri(params),
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        console.log('processAuthorizationCallback', JSON.stringify(params));
        const code = get(params.data, 'code');
        if (!code) throw new Error('Node valid params.data.code');

        await this.getAccessToken(code);

        await this.findOrCreateEntity({
            externalId: String(params.data.account_id || params.data.appOrgId),
            subType: params.data.subType,
        });

        if (!this.credential) {
            throw new Error(
                `Freshbooks Module: processAuthorizationCallback: No credential set.`
            );
        }

        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(data){
        const { externalId, subType } = data;

        const search = await Entity.find({
            externalId,
            subType,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            if (!this.credential) {
                throw new Error(
                    `Freshbooks Module: No credential set when creating entity for externalId: ${externalId}`
                );
            }

            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                externalId,
                subType,
            };
            this.setEntity(await Entity.create(createObj));
        } else if (search.length === 1) {
            this.setEntity(search[0]);
        } else {
            debug(
                'Multiple entities found with the same externalId:',
                externalId
            );
            throw new Error(
                `Multiple entities found with the same externalId: ${externalId}`
            );
        }
        return this.entity;
    }

    //------------------------------------------------------------

    async deauthorize() {
        // wipe api connection
        this.api = new Api({});

        // delete credentials from the database
        const entity = await Entity.findByUserId(this.userId);
        if (entity.credential) {
            await Credential.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
        this.credential = null;
    }

    setEntity(entity) {
        this.entity = entity;
        this.api.setAccountId(entity.externalId);
    }
    setCredential(credential) {
        this.credential = credential;
        this.api.setAccessToken(credential.access_token);
        this.api.setRefreshToken(credential.refresh_token);
    }

    async getAccessToken(code) {
        return this.api.getTokenFromCode(code);
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                debug(`should update the token: ${object}`);

                const userDetails = await this.api.getUserInfo();
                console.log('userDetails', userDetails);

                const updatedToken = {
                    externalId: userDetails.id,
                    appUserId: userDetails.id,
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    expires_at: String(this.api.accessTokenExpire),
                    // portalId: userDetails.portalId,
                    auth_is_valid: true,
                };

                if (!this.credential) {
                    console.log('Credential not found, searching by external ID', userDetails.id);
                    const credentialSearch = await Credential.find({
                        externalId: userDetails.id,
                    });
                    if (credentialSearch.length === 0) {
                        let user = await IndividualUser.getUserByAppUserId(
                            updatedToken.appUserId
                        );
                        if (!user) {
                            user = await IndividualUser.create({
                                name: userDetails.user_name,
                                email: userDetails.user_email,
                                externalId: userDetails.id,
                                appUserId: updatedToken.appUserId,
                                organizationUser: null,
                            });
                        }

                        this.credential = await Credential.create({
                            ...updatedToken,
                            user: user._id,
                        });
                    } else if (credentialSearch.length === 1) {
                        console.log('Credential user', credentialSearch[0].user);
                        console.log('Updating credential', credentialSearch[0]._id);
                        this.credential = await Credential.update(
                            { _id: credentialSearch[0]._id },
                            updatedToken
                        );
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        console.log(
                            'Multiple credentials found with the same external ID:',
                            updatedToken.externalId,
                        );
                    }
                } else {
                    this.credential = await Credential.update(
                        this.credential,
                        updatedToken
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                await this.markCredentialsInvalid();
            }
        }
    }
}

module.exports = Manager;
