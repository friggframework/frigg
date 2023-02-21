const { Api } = require('./api');
const { ModuleManager } = require('@friggframework/module-plugin');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const { get } = require('@friggframework/assertions');
const Config = require('./defaultConfig.json');
const { debug } = require('@friggframework/logs');

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
        const instance = new this(params);

        // initializes the credentials and the Api
        const salesforceParams = { delegate: instance };
        salesforceParams.key = process.env.SALESFORCE_CONSUMER_KEY;
        salesforceParams.secret = process.env.SALESFORCE_CONSUMER_SECRET;
        salesforceParams.redirect_uri = `${process.env.REDIRECT_URI}/salesforce`;

        if (params.entityId) {
            try {
                instance.entity = await Entity.findById(params.entityId);
                const salesforceToken = await Credential.findById(
                    instance.entity.credential
                );
                salesforceParams.access_token = salesforceToken.accessToken;
                salesforceParams.refresh_token = salesforceToken.refreshToken;
                salesforceParams.instanceUrl = salesforceToken.instanceUrl;
                salesforceParams.isSandbox = instance.entity.isSandbox;
            } catch (e) {
                debug(
                    `Error retrieving Salesforce credential for Entity ${instance.entity.id}`
                );
            }
        }

        instance.api = await new Api(salesforceParams);

        return instance;
    }

    async getAuthorizationRequirements() {
        return {
            url: await this.api.getAuthorizationUri(),
            type: 'oauth2',
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
        const data = get(params, 'data');
        const code = get(data, 'code');
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

        await this.findOrCreateEntity({
            name: orgDetails.Name,
            externalId: orgDetails.Id,
            isSandbox,
            orgDetails,
            sfUserResponse,
        });
        return {
            entity_id: this.entity.id,
            credential_id: this.credential.id,
            type: Manager.getName(),
        };
    }

    async findOrCreateEntity(params) {
        const { name, externalId, isSandbox, orgDetails, sfUserResponse } =
            params;

        const createObj = {
            credential: this.credential.id,
            user: this.userId,
            name,
            externalId,
            isSandbox,
            connectedUsername: sfUserResponse.Username,
        };
        this.entity = await Entity.findOneAndUpdate(
            {
                user: this.userId,
                externalId,
                isSandbox,
            },
            createObj,
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
    }
    //------------------------------------------------------------

    checkUserAuthorized() {
        return this.api.isAuthenticated();
    }

    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await Entity.findByUserId(this.userId);
        if (entity.credential) {
            await Credential.delete(entity.credential);
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
                    this.credential = await Credential.findOneAndUpdate(
                        {
                            user: this.userId,
                            instanceUrl: this.api.instanceUrl,
                        },
                        updatedToken,
                        {
                            new: true,
                            upsert: true,
                            setDefaultsOnInsert: true,
                        }
                    );
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
