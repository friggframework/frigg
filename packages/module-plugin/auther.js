// Manages authorization and credential persistence
// Instantiation of an API Class
// Expects input object like this:
// const authDef = {
//     API: class anAPI{},
//     moduleName: 'anAPI', //maybe not required
//     requiredAuthMethods: {
//         // oauth methods, how to handle these being required/not?
//         getToken: async function(params, callbackParams, tokenResponse) {},
//         // required for all Auth methods
//         getEntityDetails: async function(params) {}, //probably calls api method
//         getCredentialDetails: async function(params) {}, // might be same as above
//         apiParamsFromCredential: function(params) {},
//         testAuth: async function() {}, // basic request to testAuth
//     },
//     env: {
//         client_id: process.env.HUBSPOT_CLIENT_ID,
//         client_secret: process.env.HUBSPOT_CLIENT_SECRET,
//         scope: process.env.HUBSPOT_SCOPE,
//         redirect_uri: `${process.env.REDIRECT_URI}/an-api`,
//     }
// };

//TODO:
// 1. Add definition of expected params to API Class (or could just be credential?)
// 2.


const { Delegate } = require('@friggframework/core');
const { get } = require('@friggframework/assertions');
const _ = require('lodash');
const {flushDebugLog} = require("@friggframework/logs");
const { Credential } = require('./credential');
const { Entity } = require('./entity');
const { mongoose } = require('@friggframework/database/mongoose');
mongoose.set('strictQuery', true);


class Auther extends Delegate {
    static validateDefinition(definition) {
        if (!definition) {
            throw new Error('Auther definition is required');
        }
        if (!definition.moduleName) {
            throw new Error('Auther definition requires moduleName');
        }
        if (!definition.API) {
            throw new Error('Auther definition requires API class');
        }
        // if (!definition.Credential) {
        //     throw new Error('Auther definition requires Credential class');
        // }
        // if (!definition.Entity) {
        //     throw new Error('Auther definition requires Entity class');
        // }
        if (!definition.requiredAuthMethods) {
            throw new Error('Auther definition requires requiredAuthMethods');
        } else {
            if (!definition.requiredAuthMethods.getToken) {
                throw new Error('Auther definition requires requiredAuthMethods.getToken');
            }
            if (!definition.requiredAuthMethods.getEntityDetails) {
                throw new Error('Auther definition requires requiredAuthMethods.getEntityDetails');
            }
            if (!definition.requiredAuthMethods.getCredentialDetails) {
                throw new Error('Auther definition requires requiredAuthMethods.getCredentialDetails');
            }
            if (!definition.requiredAuthMethods.apiPropertiesToPersist) {
                throw new Error('Auther definition requires requiredAuthMethods.apiPropertiesToPersist');
            } else if (definition.Credential){
                for (const prop of definition.requiredAuthMethods.apiPropertiesToPersist) {
                    if (!definition.Credential.schema.paths.hasOwnProperty(prop)) {
                        throw new Error(
                            `Auther definition requires Credential schema to have property ${prop}`
                        );
                    }
                }
            }
            if (!definition.requiredAuthMethods.testAuthRequest) {
                throw new Error('Auther definition requires requiredAuthMethods.testAuth');
            }
        }
    }

    constructor(params) {
        super(params);
        this.userId = get(params, 'userId', null); // Making this non-required
        const definition = get(params, 'definition');
        Auther.validateDefinition(definition);
        Object.assign(this, definition.requiredAuthMethods);
        this.name = definition.moduleName;
        this.apiClass = definition.API;
        this.CredentialModel = definition.Credential || this.getCredentialModel();
        this.EntityModel = definition.Entity || this.getEntityModel();
    }

    static async getInstance(params) {
        console.log('Auther getInstance', params);
        const instance = new this(params);
        if (params.entityId) {
            instance.entity = await instance.EntityModel.findById(params.entityId);
            instance.credential = await instance.CredentialModel.findById(
                instance.entity.credential
            );
        } else if (params.credentialId) {
            instance.credential = await instance.CredentialModel.findById(
                params.credentialId
            );
        }
        const apiParams = {
            ...params.definition.env,
            delegate: instance,
            ...instance.apiParamsFromCredential(instance.credential),
        };
        instance.api = new instance.apiClass(apiParams);
        return instance;
    }

    static getEntityModelFromDefinition(definition) {
        const partialModule = new this({definition});
        return partialModule.getEntityModel();
    }

    getName() {
        return this.name;
    }

    apiParamsFromCredential(credential) {
        return _.pick(credential, ...this.apiPropertiesToPersist);
    }

    getEntityModel() {
        if (!this.EntityModel) {
            const schema = new mongoose.Schema({});
            const name = `${_.upperFirst(this.getName())}Entity`;
            this.EntityModel =
                Entity.discriminators?.[name] || Entity.discriminator(name, schema);
        }
        return this.EntityModel;
    }

    getCredentialModel() {
        console.log('mongoose strictQuery', mongoose.get('strictQuery'));
        mongoose.set('strictQuery', true);
        if (!this.CredentialModel) {
            const arrayToDefaultObject = (array, defaultValue) => _.mapValues(_.keyBy(array), () => defaultValue);
            const schema = new mongoose.Schema(arrayToDefaultObject(this.apiPropertiesToPersist, {
                type: mongoose.Schema.Types.Mixed,
                trim: true,
                lhEncrypt: true
            }));
            const name = `${_.upperFirst(this.getName())}Credential`;
            this.CredentialModel =
                Credential.discriminators?.[name] || Credential.discriminator(name, schema);
        }
        return this.CredentialModel;
    }

    async getEntitiesForUserId(userId) {
        // Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
        const list = await this.EntityModel.find(
            { user: userId },
            '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
            { lean: true }
        );
        console.log('getEntitiesForUserId list', list, userId);
        return list.map((entity) => ({
            id: entity._id,
            type: this.getName(),
            ...entity,
        }));
    }

    async validateAuthorizationRequirements() {
        const requirements = await this.getAuthorizationRequirements();
        let valid = true;
        if (['oauth1', 'oauth2'].includes(requirements.type) && !requirements.url) {
            valid = false;
        }
        return valid;
    }

    getAuthorizationRequirements(params) {
        // TODO: How can this be more helpful both to implement and consume
        // this function must return a dictionary with the following format
        // node only url key is required. Data would be used for Base Authentication
        // let returnData = {
        //     url: "callback url for the data or teh redirect url for login",
        //     type: one of the types defined in modules/Constants.js
        //     data: ["required", "fields", "we", "may", "need"]
        // }
        return this.api.getAuthorizationRequirements();
    }

    async testAuth(params) {
        let validAuth = false;
        try {
            if (await this.testAuthRequest(this.api)) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async processAuthorizationCallback(params) {
        const tokenResponse = await this.getToken(this.api, params);
        const authRes = await this.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }
        const entityDetails = await this.getEntityDetails(
            this.api, params, tokenResponse, this.userId
        );
        await this.findOrCreateEntity(entityDetails);
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: this.getName(),
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
            const credentialDetails = await this.getCredentialDetails(this.api);
            Object.assign(credentialDetails.details, this.apiParamsFromCredential(this.api));
            credentialDetails.details.auth_is_valid = true;
            await this.updateOrCreateCredential(credentialDetails);
        }
        else if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        }
        else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid();
        }
    }

    async getEntityOptions() {
        // May not be needed if the callback already creates the entity, such as in situations
        // like HubSpot where the account is determined in the authorization flow.
        // This should only be used in situations such as FreshBooks where the user needs to make
        // an account decision on the front end.
        throw new Error(
            'Entity requirement method getEntityOptions() is not defined in the class'
        );
    }

    async findOrCreateEntity(entityDetails) {
        const identifiers = get(entityDetails, 'identifiers');
        const details = get(entityDetails, 'details');
        const search = await this.EntityModel.find({
            ...identifiers
        });
        if (search.length > 1) {
            throw new Error(
                'Multiple entities found with the same identifiers: ' + JSON.stringify(identifiers)
            );
        }
        else if (search.length === 0) {
            this.entity = await this.EntityModel.create({
                credential: this.credential.id,
                ...details,
                ...identifiers,
            });
        } else if (search.length === 1) {
            this.entity = search[0];
        }
        if (this.entity.credential === undefined) {
            this.entity.credential = this.credential.id;
            await this.entity.save();
        }
    }

    async updateOrCreateCredential(credentialDetails) {
        const identifiers = get(credentialDetails, 'identifiers');
        const details = get(credentialDetails, 'details');

        if (!this.credential){
            const credentialSearch = await this.CredentialModel.find(identifiers);
            if (credentialSearch.length > 1) {
                throw new Error(`Multiple credentials found with same identifiers: ${identifiers}`);
            }
            else if (credentialSearch === 1) {
                // found exactly one credential with these identifiers
                this.credential = credentialSearch[0];
            }
            else {
                // found no credential with these identifiers (match none for insert)
                this.credential = {$exists: false};
            }
        }
        // update credential or create if none was found
        this.credential = await this.CredentialModel.findOneAndUpdate(
            {_id: this.credential},
            {$set: {...identifiers, ...details}},
            {useFindAndModify: true, new: true, upsert: true}
        );
    }

    async markCredentialsInvalid() {
        this.credential.auth_is_valid = false;
        return await this.credential.save();
    }

    async deauthorize() {
        this.api = new this.apiClass();
        if (this.entity?.credential) {
            await this.CredentialModel.deleteOne({ _id: this.entity.credential });
            this.entity.credential = undefined;
            await this.entity.save();
        }
    }
}

module.exports = { Auther };
