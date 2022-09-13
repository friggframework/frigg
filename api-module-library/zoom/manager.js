const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const { ModuleManager } = require('@friggframework/module-plugin');
const Config = require('./defaultConfig.json');
const { get } = require('@friggframework/assertions');

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
        console.log(`getInstance: params=${params}`);
        let instance = new this(params);

        const zoomParams = { delegate: instance };
        instance.api = await new Api(zoomParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: this.api.getAuthorizationUri(),
            type: 'oauth2',
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        await this.getAccessToken(code);
        const userDetails = await this.api.getUserDetails();

        await this.findOrCreateEntity({
            portalId: userDetails.portalId,
            domainName: userDetails.hub_domain,
        });
        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async getEntityOptions() {
        console.log('getEntityOptions');

        let options = [];
        return options;
    }

    async findOrCreateEntity(data) {
        console.log('findOrCreateEntity');
    }

    //------------------------------------------------------------

    async deauthorize() {
        console.log('deauthorize');
    }

    async send(notifier, delegateString, object = null) {
        console.log('send');
    }

    async mark_credentials_invalid() {
        console.log('mark_credentials_invalid');
    }
}

module.exports = Manager;
