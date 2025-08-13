const { Delegate } = require('../core');
const { get } = require('../assertions');
const _ = require('lodash');
const { flushDebugLog } = require('../logs');
const { Credential } = require('./credential');
const { Entity } = require('./entity');
const { mongoose } = require('../database/mongoose');
const { ModuleConstants } = require('./ModuleConstants');

class Module extends Delegate {

    /**
     * 
     * @param {Object} params
     * @param {Object} params.definition The definition of the Api Module
     * @param {string} params.userId The user id
     * @param {Object} params.entity The entity record from the database
     */
    constructor({ definition, userId = null, entity: entityObj = null }) {
        super({ definition, userId, entity: entityObj });

        this.validateDefinition(definition);

        this.userId = userId;
        this.entity = entityObj;
        this.credential = entityObj?.credential;
        this.definition = definition;
        this.getEntityOptions = this.definition.getEntityOptions;
        this.refreshEntityOptions = this.definition.refreshEntityOptions;
        this.name = this.definition.moduleName;
        this.modelName = this.definition.modelName;
        this.apiClass = this.definition.API;


        Object.assign(this, this.definition.requiredAuthMethods);

        this.CredentialModel = this.getCredentialModel();
        this.EntityModel = this.getEntityModel();


        const apiParams = {
            ...this.definition.env,
            delegate: this,
            ...this.apiParamsFromCredential(this.credential),
            ...this.apiParamsFromEntity(this.entity),
        };
        this.api = new this.apiClass(apiParams);
    }

    static getEntityModelFromDefinition(definition) {
        const partialModule = new this({ definition });
        return partialModule.getEntityModel();
    }

    getName() {
        return this.name;
    }

    apiParamsFromCredential(credential) {
        return _.pick(credential, ...this.apiPropertiesToPersist?.credential);
    }

    apiParamsFromEntity(entity) {
        return _.pick(entity, ...this.apiPropertiesToPersist?.entity);
    }

    getEntityModel() {
        if (!this.EntityModel) {
            const prefix = this.modelName ?? _.upperFirst(this.getName());
            const arrayToDefaultObject = (array, defaultValue) =>
                _.mapValues(_.keyBy(array), () => defaultValue);
            const schema = new mongoose.Schema(
                arrayToDefaultObject(this.apiPropertiesToPersist.entity, {
                    type: mongoose.Schema.Types.Mixed,
                    trim: true,
                })
            );
            const name = `${prefix}Entity`;
            this.EntityModel =
                Entity.discriminators?.[name] ||
                Entity.discriminator(name, schema);
        }
        return this.EntityModel;
    }

    getCredentialModel() {
        if (!this.CredentialModel) {
            const arrayToDefaultObject = (array, defaultValue) =>
                _.mapValues(_.keyBy(array), () => defaultValue);
            const schema = new mongoose.Schema(
                arrayToDefaultObject(this.apiPropertiesToPersist.credential, {
                    type: mongoose.Schema.Types.Mixed,
                    trim: true,
                    lhEncrypt: true,
                })
            );
            const prefix = this.modelName ?? _.upperFirst(this.getName());
            const name = `${prefix}Credential`;
            this.CredentialModel =
                Credential.discriminators?.[name] ||
                Credential.discriminator(name, schema);
        }
        return this.CredentialModel;
    }

    // todo: remove this method from all places
    // async getEntitiesForUserId(userId) {
    //     // Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
    //     const list = await this.EntityModel.find(
    //         { user: userId },
    //         '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
    //         { lean: true }
    //     );
    //     console.log('getEntitiesForUserId list', list, userId);
    //     return list.map((entity) => ({
    //         id: entity._id,
    //         type: this.getName(),
    //         ...entity,
    //     }));
    // }

    async validateAuthorizationRequirements() {
        const requirements = await this.getAuthorizationRequirements();
        let valid = true;
        if (
            ['oauth1', 'oauth2'].includes(requirements.type) &&
            !requirements.url
        ) {
            valid = false;
        }
        return valid;
    }

    async getAuthorizationRequirements(params) {
        return this.api.getAuthorizationRequirements();
    }

    async testAuth() {
        let validAuth = false;
        try {
            if (await this.testAuthRequest(this.api)) validAuth = true;
        } catch (e) {
            flushDebugLog(e);
        }
        return validAuth;
    }

    async processAuthorizationCallback(params) {
        let tokenResponse;
        if (this.apiClass.requesterType === ModuleConstants.authType.oauth2) {
            tokenResponse = await this.getToken(this.api, params);
        } else {
            tokenResponse = await this.setAuthParams(this.api, params);
            await this.onTokenUpdate();
        }
        const authRes = await this.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }
        const entityDetails = await this.getEntityDetails(
            this.api,
            params,
            tokenResponse,
            this.userId
        );
        Object.assign(
            entityDetails.details,
            this.apiParamsFromEntity(this.api)
        );
        await this.findOrCreateEntity(entityDetails);
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: this.getName(),
        };
    }

    async onTokenUpdate() {
        const credentialDetails = await this.getCredentialDetails(
            this.api,
            this.userId
        );
        Object.assign(
            credentialDetails.details,
            this.apiParamsFromCredential(this.api)
        );
        credentialDetails.details.auth_is_valid = true;
        await this.updateOrCreateCredential(credentialDetails);
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
            await this.onTokenUpdate();
        } else if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        } else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid();
        }
    }

    async findOrCreateEntity(entityDetails) {
        const identifiers = get(entityDetails, 'identifiers');
        const details = get(entityDetails, 'details');
        const search = await this.EntityModel.find(identifiers);
        if (search.length > 1) {
            throw new Error(
                'Multiple entities found with the same identifiers: ' +
                JSON.stringify(identifiers)
            );
        } else if (search.length === 0) {
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

        if (!this.credential) {
            const credentialSearch = await this.CredentialModel.find(
                identifiers
            );
            if (credentialSearch.length > 1) {
                throw new Error(
                    `Multiple credentials found with same identifiers: ${identifiers}`
                );
            } else if (credentialSearch.length === 1) {
                // found exactly one credential with these identifiers
                this.credential = credentialSearch[0];
            } else {
                // found no credential with these identifiers (match none for insert)
                this.credential = { $exists: false };
            }
        }
        // update credential or create if none was found
        this.credential = await this.CredentialModel.findOneAndUpdate(
            { _id: this.credential },
            { $set: { ...identifiers, ...details } },
            { useFindAndModify: true, new: true, upsert: true }
        );
    }

    async markCredentialsInvalid() {
        if (this.credential) {
            this.credential.auth_is_valid = false;
            await this.credential.save();
        }
    }

    async deauthorize() {
        this.api = new this.apiClass();
        if (this.entity?.credential) {
            await this.CredentialModel.deleteOne({
                _id: this.entity.credential,
            });
            this.entity.credential = undefined;
            await this.entity.save();
        }
    }

    // todo: check if all these props are still up to date
    validateDefinition(definition) {
        if (!definition) {
            throw new Error('Module definition is required');
        }
        if (!definition.moduleName) {
            throw new Error('Module definition requires moduleName');
        }
        if (!definition.API) {
            throw new Error('Module definition requires API class');
        }
        if (!definition.requiredAuthMethods) {
            throw new Error('Module definition requires requiredAuthMethods');
        } else {
            if (
                definition.API.requesterType ===
                ModuleConstants.authType.oauth2 &&
                !definition.requiredAuthMethods.getToken
            ) {
                throw new Error(
                    'Module definition requires requiredAuthMethods.getToken'
                );
            }
            if (!definition.requiredAuthMethods.getEntityDetails) {
                throw new Error(
                    'Module definition requires requiredAuthMethods.getEntityDetails'
                );
            }
            if (!definition.requiredAuthMethods.getCredentialDetails) {
                throw new Error(
                    'Module definition requires requiredAuthMethods.getCredentialDetails'
                );
            }
            if (!definition.requiredAuthMethods.apiPropertiesToPersist) {
                throw new Error(
                    'Module definition requires requiredAuthMethods.apiPropertiesToPersist'
                );
            } else if (definition.Credential) {
                for (const prop of definition.requiredAuthMethods
                    .apiPropertiesToPersist?.credential) {
                    if (
                        !definition.Credential.schema.paths.hasOwnProperty(prop)
                    ) {
                        throw new Error(
                            `Module definition requires Credential schema to have property ${prop}`
                        );
                    }
                }
            }
            if (!definition.requiredAuthMethods.testAuthRequest) {
                throw new Error(
                    'Module definition requires requiredAuthMethods.testAuth'
                );
            }
        }
    }
}

module.exports = { Module }; 