const Api = require('./Api');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');
const ModuleConstants = require('../ModuleConstants');
const AuthFields = require('./AuthFields');

const MANAGER_NAME = 'huggg';

class Manager extends ModuleManager {
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
        const hugggParams = { delegate: instance };

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            let credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            hugggParams.access_token = credential.access_token;
            hugggParams.refresh_token = credential.refresh_token;
            hugggParams.username = credential.username;
            hugggParams.password = credential.password;
        } else if (params.credentialId) {
            let credential = await instance.credentialMO.get(
                params.credentialId
            );
            hugggParams.access_token = credential.access_token;
            hugggParams.refresh_token = credential.refresh_token;
            hugggParams.username = credential.username;
            hugggParams.password = credential.password;
        }
        instance.api = await new Api(hugggParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: null,
            type: ModuleConstants.authType.basic,
            data: {
                fields: AuthFields.hugggAuthorizationFields, //TODO Let's refactor to use JSON Schema
            },
        };
    }

    async processAuthorizationCallback(params) {
        await this.api.getTokenFromClientCredentials();
        this.api.username = get(params, 'username');
        this.api.password = get(params, 'password');
        await this.api.getTokenFromUsernamePassword();
        //TODO add async testAuth()

        const credentials = await this.credentialMO.list({ user: this.userId });
        const entitySearch = await this.entityMO.list({ user: this.userId });
        let entity;
    }
}
module.exports = Manager;
