const { Delegate } = require('../core');
const _ = require('lodash');
const { flushDebugLog } = require('../logs');
const { ModuleConstants } = require('./ModuleConstants');
const {
    createCredentialRepository,
} = require('../credential/repositories/credential-repository-factory');
const {
    createModuleRepository,
} = require('./repositories/module-repository-factory');

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
     * @param {string} [params.state] Optional OAuth state value forwarded to the API client (round-trips through the OAuth provider).
     */
    constructor({ definition, userId = null, entity: entityObj = null, state = null }) {
        super({ definition, userId, entity: entityObj });

        this.validateDefinition(definition);

        this.userId = userId;
        this.entity = entityObj;
        this.credential = entityObj?.credential;
        this.definition = definition;
        this.name = this.definition.moduleName;
        this.modelName = this.definition.modelName;
        this.apiClass = this.definition.API;

        this.credentialRepository = createCredentialRepository();
        this.moduleRepository = createModuleRepository();

        // Module → parent delegate (typically IntegrationBase) events
        this.DLGT_CREDENTIAL_INVALIDATED = 'CREDENTIAL_INVALIDATED';
        this.delegateTypes.push(this.DLGT_CREDENTIAL_INVALIDATED);
        this.DLGT_CREDENTIAL_VALIDATED = 'CREDENTIAL_VALIDATED';
        this.delegateTypes.push(this.DLGT_CREDENTIAL_VALIDATED);

        Object.assign(this, this.definition.requiredAuthMethods);

        const apiParams = {
            ...this.definition.env,
            delegate: this,
            ...(state ? { state } : {}),
            ...(this.credential?.data
                ? this.apiParamsFromCredential(this.credential.data)
                : {}), // Handle case when credential is undefined
            ...this.apiParamsFromEntity(this.entity),
        };
        this.api = new this.apiClass(apiParams);
    }

    getName() {
        return this.name;
    }

    getEntityOptions() {
        return this.definition.getEntityOptions();
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
        const apiParams = this.apiParamsFromCredential(this.api);

        if (!apiParams.refresh_token && this.api.isRefreshable) {
            console.warn(
                `[Frigg] No refresh_token in apiParams for module ${this.name}.`
            );
        }

        Object.assign(credentialDetails.details, apiParams);
        credentialDetails.details.authIsValid = true;

        const persisted = await this.credentialRepository.upsertCredential(
            credentialDetails
        );
        this.credential = persisted;

        if (this.credential?.id) {
            try {
                await this.notify(this.DLGT_CREDENTIAL_VALIDATED, {
                    credentialId: this.credential.id,
                    moduleName: this.name,
                });
            } catch (err) {
                console.error(
                    `[Frigg] Failed to propagate CREDENTIAL_VALIDATED for module ${this.name}:`,
                    err?.message || err
                );
            }
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
            await this.onTokenUpdate();
        } else if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        } else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid(object);
        } else if (delegateString === this.api.DLGT_CREDENTIAL_RELOAD) {
            return this.reloadCredential();
        }
    }

    /**
     * Re-reads this module's credential row and returns the token fields the
     * api persists, so the requester can adopt a concurrent invocation's
     * refresh instead of racing it (ADR-031, option 4).
     *
     * Read-only by design: no upsert, no authIsValid change. Routing the
     * reload through setTokens()/onTokenUpdate would write to the database
     * and resurrect a credential an operator had just disabled.
     *
     * @returns {Promise<Object|null>} The picked token fields, or null when
     *   no credential row is available.
     */
    async reloadCredential() {
        if (!this.credential?.id) return null;
        const fresh = await this.credentialRepository.findCredentialById(
            this.credential.id
        );
        if (!fresh?.data) return null;
        this.credential = fresh;
        return this.apiParamsFromCredential(fresh.data);
    }

    async markCredentialsInvalid(diagnosticInfo = null) {
        if (!this.credential) return;

        if (!this.credential.id) return;

        if (diagnosticInfo) {
            console.error(
                `[Frigg] Module ${this.name} credentials rejected (status ${
                    diagnosticInfo.statusCode ?? '?'
                }):`,
                diagnosticInfo.message ?? diagnosticInfo
            );
        }

        await this.credentialRepository.updateAuthenticationStatus(
            this.credential.id,
            false
        );

        // Keep the in-memory snapshot consistent so that callers can read the
        // updated state without another fetch.
        this.credential.authIsValid = false;

        // Propagate upward so a parent delegate (e.g. IntegrationBase) can
        // react — for instance by flipping Integration.status to DISABLED.
        // Delegate.notify is a silent no-op when this.delegate is null, so
        // Module instances constructed outside of an Integration context
        // (e.g. during ProcessAuthorizationCallback) remain unaffected.
        //
        // Best-effort: this method is invoked from the OAuth2Requester 401
        // refresh catch block, which depends on us NOT throwing. A DB hiccup
        // in the downstream status flip must not alter refreshAuth's
        // documented `return false` contract. The credential has already
        // been persisted as invalid; integrations left un-flipped can be
        // recovered by the next retry or by operator intervention.
        try {
            await this.notify(this.DLGT_CREDENTIAL_INVALIDATED, {
                credentialId: this.credential.id,
                moduleName: this.name,
                ...(diagnosticInfo && {
                    reason: diagnosticInfo.message,
                    statusCode: diagnosticInfo.statusCode,
                }),
            });
        } catch (err) {
            console.error(
                `[Frigg] Failed to propagate CREDENTIAL_INVALIDATED for module ${this.name}:`,
                err?.message || err
            );
        }
    }

    async deauthorize() {
        //todo: Check if this is correct, we're instantiating a new api without params (credentials, tokens, etc...)
        this.api = new this.apiClass();

        // Remove persisted credential (if any)
        if (this.entity?.credential) {
            const credentialId =
                this.entity.credential.id || this.entity.credential;

            // Delete credential via repository
            await this.credentialRepository.deleteCredentialById(credentialId);

            // Unset credential reference on the Entity document
            const entityId = this.entity.id;
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
