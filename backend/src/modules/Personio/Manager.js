// Scaffolded from
const _ = require('lodash');
const Api = require('./Api');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');
const AuthFields = require('./AuthFields');

const MANAGER_NAME = 'Personio';

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

        let personioParams;

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            if (instance.entity.credential) {
                instance.credential = await instance.credentialMO.get(
                    instance.entity.credential
                );
                personioParams = {
                    clientId: instance.credential.clientId,
                    clientSecret: instance.credential.clientSecret,
                    companyId: instance.credential.companyId,
                    accessToken: instance.credential.accessToken,
                    subdomain: instance.credential.subdomain,
                };
            }
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            personioParams = {
                clientId: instance.credential.clientId,
                clientSecret: instance.credential.clientSecret,
                companyId: instance.credential.companyId,
                accessToken: instance.credential.accessToken,
                subdomain: instance.credential.subdomain,
            };
        }
        if (personioParams) {
            instance.api = await new Api(personioParams);
        }

        return instance;
    }

    async getAuthorizationRequirements(params) {
        // see parent docs. only use these three top level keys
        return {
            url: null,
            type: ModuleConstants.authType.apiKey,
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async processAuthorizationCallback(params) {
        const clientId = this.getParam(params.data, 'clientId');
        const clientSecret = this.getParam(params.data, 'clientSecret');
        const companyId = this.getParam(params.data, 'companyId');
        const accessToken = this.getParam(params.data, 'accessToken');
        const subdomain = this.getParam(params.data, 'subdomain');
        this.api = new Api({
            clientId,
            clientSecret,
            companyId,
            accessToken,
            subdomain,
        });
        const userDetails = await this.api.getUserDetails();

        const byUserId = { user: this.userId };
        const credentials = await this.credentialMO.list(byUserId);

        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        const credential = await this.credentialMO.upsert(byUserId, {
            user: this.userId,
            client_id: clientId,
            client_secret: clientSecret,
            company_id: companyId,
            access_token: accessToken,
            subdomain: subdomain,
        });

        const byUserIdAndCredential = {
            ...byUserId,
            credential: credential.id,
        };
        const entity = await this.entityMO.upsert(byUserIdAndCredential, {
            user: this.userId,
            credential: credential.id,
            name: userDetails.user.username,
            externalId: userDetails.user.id,
        });

        return {
            entity_id: entity.id,
            credential_id: credential.id,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        // TODO - this method doesn't exist in API
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
