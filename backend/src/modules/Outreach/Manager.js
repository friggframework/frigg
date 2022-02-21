const _ = require('lodash');
const { update } = require('lodash');
const Api = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');
const { flushDebugLog, debug } = require('../../utils/logger');

const MANAGER_NAME = 'outreach';

class Manager extends LHModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return MANAGER_NAME;
    }

    static async getInstance(params) {
        const instance = new this(params);

        const oParams = { delegate: instance };
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            oParams.access_token = instance.credential.accessToken;
            oParams.refresh_token = instance.credential.refreshToken;
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            oParams.access_token = instance.credential.accessToken;
            oParams.refresh_token = instance.credential.refreshToken;
        }
        instance.api = await new Api(oParams);

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
        const code = this.getParam(params.data, 'code');
        await this.api.getTokenFromCode(code);
        await this.testAuth();

        const userProfile = await this.api.getUser();
        await this.findOrCreateEntity({
            org_uuid: userProfile.org_uuid,
            org_name: userProfile.org_name,
        });

        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const org_uuid = this.getParam(params, 'org_uuid');
        const org_name = this.getParam(params, 'org_name');

        const search = await this.entityMO.list({
            user: this.userId,
            externalId: org_uuid,
        });
        if (search.length === 0) {
            // validate choices!!!
            // create entity
            const createObj = {
                credential: this.credential.id,
                user: this.userId,
                name: org_name,
                externalId: org_uuid,
            };
            this.entity = await this.entityMO.create(createObj);
        } else if (search.length === 1) {
            this.entity = search[0];
        } else {
            debug('Multiple entities found with the same Org ID:', org_uuid);
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
                const updatedToken = {
                    user: this.userId,
                    accessToken: this.api.access_token,
                    refreshToken: this.api.refresh_token,
                    accessTokenExpire: this.api.accessTokenExpire,
                    externalId: userProfile.user_id,
                    auth_is_valid: true,
                };

                if (!this.credential) {
                    const credentialSearch = await this.credentialMO.list({
                        externalId: userProfile.user_id,
                    });
                    if (credentialSearch.length === 0) {
                        this.credential = await this.credentialMO.create(
                            updatedToken
                        );
                    } else if (credentialSearch.length === 1) {
                        if (
                            credentialSearch[0].user.toString() === this.userId
                        ) {
                            this.credential = await this.credentialMO.update(
                                credentialSearch[0],
                                updatedToken
                            );
                        } else {
                            debug(
                                'Somebody else already created a credential with the same User ID:',
                                userProfile.user_id
                            );
                        }
                    } else {
                        // Handling multiple credentials found with an error for the time being
                        debug(
                            'Multiple credentials found with the same User ID:',
                            userProfile.user_id
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
