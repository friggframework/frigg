const _ = require('lodash');
const Api = require('./Api');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');

const MANAGER_NAME = 'attentive';

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

        const attentiveParams = { delegate: instance };
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            const credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            attentiveParams.access_token = credential.access_token;
            attentiveParams.refresh_token = credential.refresh_token;
        } else if (params.credentialId) {
            const credential = await instance.credentialMO.get(
                params.credentialId
            );
            attentiveParams.access_token = credential.access_token;
            attentiveParams.refresh_token = credential.refresh_token;
        }
        instance.api = await new Api(attentiveParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.authorizationUri,
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const code = this.getParam(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);

        let credentials = await this.credentialMO.list({ user: this.userId });

        if (credentials.length === 0) {
            throw new Error('Credentials failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        let entity = await this.entityMO.getByUserId(this.userId);

        return {
            credential_id: credentials[0]._id,
            entity_id: entity._id,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        await this.api.getUserDetails();
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
