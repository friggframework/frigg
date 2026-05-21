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
        // Symmetric "auth healed" signal — fired after a successful token
        // refresh persists the credential as valid again. Lets the parent
        // (IntegrationBase) reset Integration.status from ERROR back to
        // ENABLED so the user doesn't have to manually reconnect after a
        // transient credential failure.
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

        // Propagate upward so a parent delegate (e.g. IntegrationBase) can
        // self-heal Integration.status from ERROR back to ENABLED. Symmetric
        // with the markCredentialsInvalid → CREDENTIAL_INVALIDATED path.
        //
        // Best-effort: this method is invoked from OAuth2Requester.setTokens
        // immediately after a successful refresh; the new access_token has
        // already been persisted on the credential, and the original 401'd
        // API call is about to be retried with the new token. A delegate
        // hiccup must NOT throw — that would re-surface as a 401 catch in
        // the requester and confuse the auth state machine.
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
            await this.markCredentialsInvalid();
        }
    }

    async markCredentialsInvalid() {
        if (!this.credential) return;

        if (!this.credential.id) return;

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
