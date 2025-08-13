const { Delegate } = require('../core');
const _ = require('lodash');
const { flushDebugLog } = require('../logs');
const { ModuleConstants } = require('./ModuleConstants');
const { CredentialRepository } = require('../credential/credential-repository');
const { ModuleRepository } = require('./module-repository');

// todo: this class should be a Domain class, and the Delegate function is preventing us from
// doing that, we probably have to get rid of the Delegate class as well as the event based 
// calls since they go against the Domain Driven Design principles (eg. a domain class should not call repository methods or use cases)
class Module extends Delegate {

    //todo: entity should be replaced with actual entity properties
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
        this.name = this.definition.moduleName;
        this.modelName = this.definition.modelName;
        this.apiClass = this.definition.API;

        this.credentialRepository = new CredentialRepository();
        this.moduleRepository = new ModuleRepository();

        Object.assign(this, this.definition.requiredAuthMethods);

        const apiParams = {
            ...this.definition.env,
            delegate: this,
            ...this.apiParamsFromCredential(this.credential),
            ...this.apiParamsFromEntity(this.entity),
        };
        this.api = new this.apiClass(apiParams);
    }

    getName() {
        return this.name;
    }

    getEntityOptions() {
        return this.definition.getEntityOptions()
    }

    async refreshEntityOptions(options) {
        await this.definition.refreshEntityOptions(options);
        return this.getEntityOptions();
    }

    apiParamsFromCredential(credential) {
        return _.pick(credential, ...this.apiPropertiesToPersist?.credential);
    }

    apiParamsFromEntity(entity) {
        return _.pick(entity, ...this.apiPropertiesToPersist?.entity);
    }

    validateAuthorizationRequirements() {
        const requirements = this.getAuthorizationRequirements();
        let valid = true;
        if (
            ['oauth1', 'oauth2'].includes(requirements.type) &&
            !requirements.url
        ) {
            valid = false;
        }
        return valid;
    }

    getAuthorizationRequirements(params) {
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

        const persisted = await this.credentialRepository.upsertCredential(credentialDetails);
        this.credential = persisted;
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

    async markCredentialsInvalid() {
        if (!this.credential) return;

        // Persist flag change through repository – works even when the
        // credential object is a plain JavaScript object (lean query).
        const credentialId = this.credential._id || this.credential.id;
        if (!credentialId) return;

        await this.credentialRepository.updateAuthenticationStatus(
            credentialId,
            false
        );

        // Keep the in-memory snapshot consistent so that callers can read the
        // updated state without another fetch.
        this.credential.auth_is_valid = false;
    }

    async deauthorize() {
        this.api = new this.apiClass();

        // Remove persisted credential (if any)
        if (this.entity?.credential) {
            const credentialId =
                this.entity.credential._id || this.entity.credential.id || this.entity.credential;

            // Delete credential via repository
            await this.credentialRepository.deleteCredentialById(credentialId);

            // Unset credential reference on the Entity document
            const entityId = this.entity._id || this.entity.id;
            if (entityId) {
                await this.moduleRepository.unsetCredential(entityId);
            }

            // Keep in-memory snapshot consistent
            this.entity.credential = undefined;
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