const {
    ModuleManager,
    ModuleConstants,
    flushDebugLog,
    debug
} = require('@friggframework/core');
const {Api} = require('./api.js');
const {Entity} = require('./models/entity');
const {Credential} = require('./models/credential');
const Config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static
    Entity = Entity;

    static
    Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return Config.name;
    }

    static
    async getInstance(params) {
        const instance = new this(params);

        const apiParams = {delegate: instance};
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
        }
        if (instance.entity?.credential) {
            apiParams.access_token = instance.credential.accessToken;
            apiParams.refresh_token = instance.credential.refreshToken;
            apiParams.companyDomain = instance.credential.companyDomain;
        }
        instance.api = await new Api(apiParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.getUser()) validAuth = true;
        } catch (e) {
            await this.markCredentialsInvalid();
            flushDebugLog(e);
        }
        return validAuth;
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        await this.api.getTokenFromCode(code);
        await this.testAuth();

        const userProfile = await this.api.getUser();
        await this.findOrCreateEntity({
            companyId: userProfile.data.company_id,
            companyName: userProfile.data.company_name,
        });

        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const companyId = get(params, 'companyId');
        const companyName = get(params, 'companyName');

        const search = await this.entityMO.list({
            user: this.userId,
            externalId: companyId,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name: companyName,
                externalId: companyId,
            };
            this.entity = await this.entityMO.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug(
                'Multiple entities found with the same Company ID:',
                companyId
            );
        }

        return {
            entity_id: this.entity.id,
        };
    }

    async deauthorize() {
        this.api = new Api();

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
                const userProfile = await this.api.getUser();
                const pipedriveUserId = userProfile.data.id;
                const updatedToken = {
                    user: this.userId,
                    accessToken: this.api.access_token,
                    refreshToken: this.api.refresh_token,
                    accessTokenExpire: this.api.accessTokenExpire,
                    externalId: pipedriveUserId,
                    companyDomain: object.api_domain,
                    auth_is_valid: true,
                };

                if (!this.credential) {
                    let credentialSearch = await this.credentialMO.list({
                        externalId: pipedriveUserId,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await this.credentialMO.create(
                            updatedToken
                        );
                    } else if (credentialSearch.length === 1) {
                        if (
                            credentialSearch[0].user.toString() ===
                            this.userId.toString()
                        ) {
                            this.credential = await this.credentialMO.update(
                                credentialSearch[0],
                                updatedToken
                            );
                        } else {
                            debug(
                                'Somebody else already created a credential with the same User ID:',
                                pipedriveUserId
                            );
                        }
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same User ID:',
                            pipedriveUserId
                        );
                    }
                } else {
                    this.credential = await this.credentialMO.update(
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
