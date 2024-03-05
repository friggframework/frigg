const { ModuleManager } = require('@friggframework/core');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');

const Config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);

        const apiParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await Entity.findById(params.entityId);
            const credential = await Credential.findById(
                instance.entity.credential
            );
            instance.credential = credential;
            apiParams.access_token = credential.access_token;
            apiParams.id_token = credential.id_token;
            apiParams.expires_in = credential.accessExpiresIn;
        }

        instance.api = await new Api(apiParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.authorizationUri,
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);
        const userDetails = await this.api.getTokenIdentity();

        let credentials = await this.credentialMO.list({ user: this.userId });

        if (credentials.length === 0) {
            throw new Error('Credential failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        let entity = await this.entityMO.getByUserId(this.userId);

        if (!entity) {
            entity = await this.entityMO.create({
                user: this.userId,
                credential: credentials[0]._id,
                externalId: userDetails.companyId,
                name: userDetails.companyName,
            });
        }

        return {
            credential_id: credentials[0]._id,
            entity_id: entity._id,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        await this.api.getTokenIdentity();
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                const updatedToken = {
                    user: this.userId,
                    access_token: this.api.access_token,
                    id_token: this.api.id_token,
                    // expires_in: this.api.accessExpiresIn,
                    auth_is_valid: true,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] === null && delete updatedToken[k]
                );

                let credential = await this.entityMO.getByUserId(this.userId);

                if (!credential) {
                    credential = await this.credentialMO.create(updatedToken);
                } else {
                    credential = await this.credentialMO.update(
                        credential,
                        updatedToken
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }
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
    }
}

module.exports = Manager;
