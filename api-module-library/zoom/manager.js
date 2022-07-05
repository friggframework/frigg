const { Api } = require('./api.js');
const Entity = require('./models/entity');
const Credential = require('./models/credential.js');
const ModuleManager = require('@friggframework/core/managers/ModuleManager');
const ModuleConstants = require('../ModuleConstants');
const _ = require('lodash');
const Config = require('./defaultConfig.json');

class Manager extends LHModuleManager {
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
        console.log(`getAuthorizationRequirements: params=${params}`);
        return null;
    }

    async processAuthorizationCallback(params) {
        console.log(`processAuthorizationCallback: params=${params}`);
        return null;
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
