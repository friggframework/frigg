const Api = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const LHModuleManager = require('frigg/managers/LHModuleManager');
const ModuleConstants = require('../ModuleContants');

// the name used for the entity type, generally
const MANAGER_NAME = 'salesforce';

class Manager extends LHModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return MANAGER_NAME;
    }

    static async getInstance(params) {
        const instance = new this(params);

        if (params.userId && !params.entityId) {
            instance.entity = await instance.entityMO.getByUserId(
                params.userId
            );
        }

        // // create an entry in the database if it does not exist
        if (!params.entityId && !instance.entity) {
            instance.entity = await instance.entityMO.create({
                user: params.userId,
            });
        }

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
        }

        // initializes the credentials and the Api
        const salesforceParams = { delegate: instance };
        salesforceParams.key = process.env.SALESFORCE_CLIENT_ID;
        salesforceParams.secret = process.env.SALESFORCE_CLIENT_SECRET;
        salesforceParams.redirectUri = process.env.SALESFORCE_REDIRECT_URI;
        // salesforceParams.baseURL = process.env.SALESFORCE_API_BASE_URL;

        if (instance.entity.credential) {
            try {
                const salesforceToken = await instance.credentialMO.get(
                    instance.entity.credential
                );
                salesforceParams.access_token = salesforceToken.accessToken;
                salesforceParams.refresh_token = salesforceToken.refreshToken;
                salesforceParams.instanceUrl = salesforceToken.instanceUrl;
                salesforceParams.isSandbox = instance.entity.isSandbox;
            } catch (e) {
                // instance.entity.credential = undefined;
                // await instance.entity.save();
                console.log(
                    `Error retrieving Salesforce credential for Entity ${instance.entity.id}`
                );
                console.log(JSON.stringify(e));
            }
        } else {
            // Otherwise if no creds?
        }

        instance.api = await new Api(salesforceParams);

        return instance;
    }

    async getAuthorizationRequirements() {
        return {
            url: await this.api.getAuthorizationUri(),
            type: ModuleConstants.authType.oauth2,
        };
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.api.find('Organization')) validAuth = true;
        } catch (e) {
            console.log(e);
        }
        return validAuth;
    }

    async processAuthorizationCallback(params) {
        const userId = this.getParam(params, 'userId');
        const data = this.getParam(params, 'data');
        const code = this.getParam(data, 'code');
        let isSandbox = false;

        // try to get access token.
        try {
            await this.api.getAccessToken(code);
        } catch (e) {
            // If that fails, re-set API class as sandbox
            // Then try again
            console.log(e);

            this.api.resetToSandbox();
            await this.api.getAccessToken(code);
            isSandbox = true;
        }

        // Get Account details and save on Entity record to `name` and `externalId` field
        // Get Username details too
        const orgResponse = await this.api.find('Organization');
        const orgDetails = orgResponse[0];
        const sfUserResponse = await this.api.get(
            'User',
            this.api.conn.userInfo.id
        );

        const entity = await this.entityMO.getByUserId(userId);
        entity.name = orgDetails.Name;
        entity.externalId = orgDetails.Id;
        // Note that the Entity is a sandbox
        entity.isSandbox = isSandbox;
        entity.connectedUsername = sfUserResponse.Username;
        await entity.save();
        return {
            id: entity.id,
            type: Manager.getName(),
        };
    }

    //------------------------------------------------------------

    checkUserAuthorized() {
        return this.api.isAuthenticated();
    }

    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
            entity.credential = undefined;
            entity.isSandbox = false;
            await entity.save();
        }
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async receiveNotification(notifier, delegateString, object = null) {
        try {
            if (notifier instanceof Api) {
                if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                    console.log(`should update the token: ${object}`);
                    const updatedToken = {
                        accessToken: this.api.access_token,
                        refreshToken: this.api.refresh_token,
                        instanceUrl: this.api.instanceUrl,
                    };
                    if (!this.entity.credential) {
                        this.entity.credential = await this.credentialMO.create(
                            updatedToken
                        );
                    } else {
                        this.entity.credential = await this.credentialMO.update(
                            this.entity.credential,
                            updatedToken
                        );
                    }
                    await this.entity.save();
                }
                if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                    await this.deauthorize();
                    console.log(this.checkUserAuthorized());
                }
            }
        } catch (e) {
            console.log('error yo');
        }
    }
}

module.exports = Manager;
