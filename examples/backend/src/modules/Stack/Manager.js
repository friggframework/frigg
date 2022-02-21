const Api = require('./Api.js');
const Credential = require('./models/Credential');
const Entity = require('./models/Entity');
const LHModuleManager = require('../../base/managers/LHModuleManager');
const ModuleConstants = require('../ModuleConstants');

// the name used for the entity type, generally
const MANAGER_NAME = 'stack';

class Manager extends LHModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
        this.companyId = this.getParam(params, 'companyId', null);
        this.integrationType = this.getParam(params, 'integrationType', null);
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return MANAGER_NAME;
    }

    static getEntityType() {}

    static async getInstance(params) {
        const instance = new Manager(params);
        // ALL YOUR ASYNC CODE HERE, ADD TO instance. as needed
        instance.api = await new Api({
            companyId: instance.companyId,
            integrationType: instance.integrationType,
        });
        return instance;
    }

    static async browserExtensionAuth(params) {
        const instance = new Manager(params);
        instance.integrationType = 'browser_extension';
        const email = instance.getParam(params, 'email');
        const password = instance.getParam(params, 'password');

        instance.api = await new Api({
            integrationType: instance.integrationType,
        });

        const res = await instance.api.browserExtensionAuth(params);

        return res.body;
    }

    // async getAuthorizationRequirements(params) {
    //   return {
    //     url: 'empty',
    //     type: 'stack',
    //     fields: ['companyId'],
    //   };
    // }

    // async processAuthorizationCallback(params) {
    //   const response = await this.api.authorize();
    //   const credentials = {
    //     bearer_token: response.body.data,
    //     companyId: params.companyId,
    //   };
    //   this.send(this.api, 'TOKEN_UPDATE', credentials);
    //   const entity = await this.entityMO.getByUserId(this.userId);
    //   return {
    //     id: entity._id,
    //     type: Manager.getName(),
    //   };
    // }

    // async deauthorize() {
    //
    // }

    //------------------------------------------------------------

    async findOrCreateEntity() {
        let entity = await this.entityMO.getByUserId(this.userId);

        // create an entry in the database if it does not exist
        if (!entity) {
            entity = await this.entityMO.create({
                user: this.userId,
                companyId: this.companyId,
            });
        }
        return entity;
    }
    //
    // async sleep(ms) {
    //   return new Promise((resolve) => setTimeout(resolve, ms));
    // }
    //
    // async receiveNotification(notifier, delegateString, object = null) {
    //     if (notifier instanceof Api) {
    //       if (delegateString === 'TOKEN_UPDATE') {
    //         // todo update the database
    //         const updatedToken = {
    //           secret: this.api.accessToken,
    //           type: this.api.refreshToken,
    //           companyId: this.api.accessTokenExpire,
    //         };
    //         let entity = await this.entityMO.getByUserId(this.userId);
    //
    //         if (!entity) {
    //           entity = await this.entityMO.create({ user: this.userId });
    //         }
    //         let { credential } = entity;
    //         if (!credential) {
    //           credential = await this.credentialMO.create(updatedToken);
    //         } else {
    //           credential = await this.credentialMO.update(credential, updatedToken);
    //         }
    //         await this.entityMO.update(entity.id, { credential, companyId: object.companyId });
    //       }
    //     }
}

module.exports = Manager;
