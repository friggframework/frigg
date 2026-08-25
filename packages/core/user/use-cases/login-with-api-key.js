const Boom = require('@hapi/boom');
const { Module } = require('../../modules/module');

/**
 * Maximum accepted length of a submitted API key. Capped before any provider
 * work so the endpoint cannot be used to smuggle arbitrarily large payloads or
 * amplify an oracle attack. Generous enough for JWT-shaped or concatenated keys.
 * @constant {number}
 */
const DEFAULT_MAX_API_KEY_LENGTH = 8192;

/**
 * Classify an error thrown by the module's Requester while validating or
 * identifying a key, per ADR-034 §Security requirement 6 ("Outage ≠ invalid").
 *
 * A definitive provider rejection (401/403, or any other non-5xx client error)
 * means the key is bad. A 5xx, a network failure, or a timeout means the
 * provider is unavailable and MUST NOT be reported as an invalid key nor allowed
 * to mint a session.
 *
 * @param {*} err - The thrown error.
 * @returns {'invalid'|'unavailable'} classification
 */
function classifyProviderError(err) {
    const status =
        err?.statusCode ?? err?.response?.status ?? err?.status ?? undefined;

    if (typeof status === 'number' && status >= 400 && status < 500) {
        // 401/403 and any other definitive 4xx from the provider → bad key.
        return 'invalid';
    }
    // 5xx, or no status at all (timeout / DNS / socket error) → outage.
    return 'unavailable';
}

/**
 * Generic invalid-credentials error. Deliberately identical for every failure
 * reason on the bad-key path so the endpoint never enumerates users or keys
 * (ADR-034 §Security requirement 3).
 * @returns {Boom} 401
 */
function invalidCredentials() {
    return Boom.unauthorized('Invalid credentials');
}

/**
 * Provider-unavailable error, distinct from invalid credentials. No session is
 * created and no cookie is cleared when this is thrown (ADR-034 §6).
 * @returns {Boom} 503
 */
function providerUnavailable() {
    return Boom.serverUnavailable('Identity provider unavailable');
}

/**
 * Use case implementing the ADR-034 `apiKey` auth mode: log a browser end user
 * in with their own product API key, validated *through the api-module itself*.
 *
 * Flow (see ADR-034):
 *   1. Validate + identify the key via the configured identity module's
 *      Requester (`testAuthRequest`, then `getEntityDetails`).
 *   2. Derive a provider-authoritative tenant identity — NEVER from client input.
 *   3. Find-or-create the Frigg user from that identity (ordinary app user).
 *   4. Create the Credential + Entity via `ProcessAuthorizationCallback`.
 *   5. Mint a short-lived Frigg session token and return it.
 *
 * @class LoginWithApiKey
 */
class LoginWithApiKey {
    /**
     * @param {Object} params
     * @param {Object} params.userConfig - App-definition `user` config (reads `authModes.apiKey`).
     * @param {Array<Object>} params.moduleDefinitions - Module definitions available to the app.
     * @param {import('./get-user-from-x-frigg-headers').GetUserFromXFriggHeaders} params.getUserFromXFriggHeaders - Reused find-or-create path.
     * @param {import('../../modules/use-cases/process-authorization-callback').ProcessAuthorizationCallback} params.processAuthorizationCallback - Reused credential/entity creation.
     * @param {import('./create-token-for-user-id').CreateTokenForUserId} params.createTokenForUserId - Reused session-token minting.
     * @param {number} [params.tokenExpiryMinutes=120] - Access token TTL. Short by design (ADR-034 §5): revocation latency is bounded by this.
     * @param {number} [params.maxApiKeyLength=8192] - Length cap enforced before any provider work.
     * @param {typeof Module} [params.ModuleClass=Module] - Injectable Module class (for testing without a real Requester).
     */
    constructor({
        userConfig,
        moduleDefinitions,
        getUserFromXFriggHeaders,
        processAuthorizationCallback,
        createTokenForUserId,
        tokenExpiryMinutes = 120,
        maxApiKeyLength = DEFAULT_MAX_API_KEY_LENGTH,
        ModuleClass = Module,
    }) {
        this.userConfig = userConfig || {};
        this.moduleDefinitions = moduleDefinitions || [];
        this.getUserFromXFriggHeaders = getUserFromXFriggHeaders;
        this.processAuthorizationCallback = processAuthorizationCallback;
        this.createTokenForUserId = createTokenForUserId;
        this.tokenExpiryMinutes = tokenExpiryMinutes;
        this.maxApiKeyLength = maxApiKeyLength;
        this.ModuleClass = ModuleClass;
    }

    /**
     * Resolve which identity module a request may use.
     *
     * The module is fixed by config (`authModes.apiKey.module`). A multi-identity
     * app MAY configure an allowlist (`authModes.apiKey.modules`) and let the
     * client pick one via the request body — but only from that allowlist. A
     * client-supplied module that is not allowlisted is rejected generically, so
     * the endpoint cannot be steered at an arbitrary module.
     *
     * @param {string} [requestedModule] - Optional module name from the request body.
     * @returns {string} The resolved module name.
     * @throws {Boom} 401 generic if apiKey mode is unconfigured or the request names a non-allowlisted module.
     */
    resolveModuleName(requestedModule) {
        const config = this.userConfig.authModes?.apiKey;
        if (!config) {
            // apiKey mode not enabled for this app.
            throw invalidCredentials();
        }

        // Allowlist = the UNION of the explicit `modules` array and the single
        // `module` (matching validateApiKeyAuthMode's own union). This keeps the
        // resolver and the wiring-time validator in agreement: a config like
        // `{ modules: [], module: 'reevo' }` passes validation AND resolves to
        // ['reevo'] here, rather than validation passing while the resolver saw
        // an empty list and rejected every login. Never an open set.
        const allowlist = [
            ...(Array.isArray(config.modules) ? config.modules : []),
            ...(config.module ? [config.module] : []),
        ];

        if (allowlist.length === 0) {
            throw invalidCredentials();
        }

        if (requestedModule) {
            if (!allowlist.includes(requestedModule)) {
                throw invalidCredentials();
            }
            return requestedModule;
        }

        // No client-specified module: only unambiguous when exactly one is configured.
        if (allowlist.length === 1) {
            return allowlist[0];
        }

        // Multi-identity app but the client did not name a module.
        throw invalidCredentials();
    }

    /**
     * Validate the key against the provider and derive a provider-authoritative
     * tenant identity. Reused by login (and available for refresh re-validation,
     * ADR-034 §5): a revoked key stops validating here.
     *
     * @param {string} apiKey
     * @param {string} moduleName
     * @returns {Promise<{ externalId: string, moduleDefinition: Object }>}
     * @throws {Boom} 401 invalid credentials on a bad/rejected key or missing identifier; 503 on provider outage.
     */
    async validateAndIdentify(apiKey, moduleName) {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.moduleName === moduleName
        );
        if (!moduleDefinition) {
            // Should be caught at config-validation time; treat a runtime miss
            // as a server misconfiguration rather than leaking specifics.
            throw Boom.badImplementation(
                `apiKey identity module '${moduleName}' is not registered`
            );
        }

        const module = new this.ModuleClass({ definition: moduleDefinition });

        // Seed the api client with the key without persisting anything.
        const setAuthParams =
            moduleDefinition.requiredAuthMethods?.setAuthParams;
        if (typeof setAuthParams === 'function') {
            await setAuthParams(module.api, { api_key: apiKey });
        } else if (typeof module.api?.setApiKey === 'function') {
            module.api.setApiKey(apiKey);
        }

        // 1) Validity. Call testAuthRequest directly (NOT module.testAuth, which
        //    swallows the error and would collapse 401 and 503 into one `false`).
        let isValid;
        try {
            isValid =
                await moduleDefinition.requiredAuthMethods.testAuthRequest(
                    module.api
                );
        } catch (err) {
            throw classifyProviderError(err) === 'unavailable'
                ? providerUnavailable()
                : invalidCredentials();
        }
        // Require a STRICT boolean pass. A module that returns a truthy value on
        // a bad key (e.g. an error object, a non-empty string, a response body)
        // must NOT clear the validity gate — only an explicit `true` does. The
        // login-path contract for testAuthRequest is: throw, or return `true`.
        if (isValid !== true) {
            throw invalidCredentials();
        }

        // 2) Identity. Derive the tenant id from the provider response only.
        let entityDetails;
        try {
            entityDetails =
                await moduleDefinition.requiredAuthMethods.getEntityDetails(
                    module.api,
                    { api_key: apiKey },
                    undefined,
                    undefined
                );
        } catch (err) {
            throw classifyProviderError(err) === 'unavailable'
                ? providerUnavailable()
                : invalidCredentials();
        }

        const externalId = entityDetails?.identifiers?.externalId;
        // Require a scalar, string-or-number identifier. Anything else (an
        // object, array, boolean, null/undefined) is NOT a stable identifier and
        // must be rejected rather than String()-coerced into a bogus one like
        // "[object Object]" (ADR-034 §Security requirement 1).
        if (
            (typeof externalId !== 'string' &&
                typeof externalId !== 'number') ||
            String(externalId).trim() === ''
        ) {
            throw invalidCredentials();
        }

        return { externalId: String(externalId), moduleDefinition };
    }

    /**
     * Execute the api-key login.
     *
     * @param {Object} input
     * @param {string} input.apiKey - The submitted product API key.
     * @param {string} [input.module] - Optional module name (multi-identity apps only; allowlisted).
     * @returns {Promise<{ token: string, userId: string, module: string }>} The minted session token and principal.
     * @throws {Boom} 401 generic on invalid key / missing identifier / unconfigured mode; 503 on provider outage.
     */
    async execute({ apiKey, module: requestedModule } = {}) {
        // Cap length and shape BEFORE any provider work (ADR-034 §3).
        if (typeof apiKey !== 'string' || apiKey.length === 0) {
            throw invalidCredentials();
        }
        if (apiKey.length > this.maxApiKeyLength) {
            throw invalidCredentials();
        }

        const moduleName = this.resolveModuleName(requestedModule);

        const { externalId } = await this.validateAndIdentify(
            apiKey,
            moduleName
        );

        // Namespace the provider identity by the RESOLVED module. In a
        // multi-module allowlist two different providers can legitimately return
        // the SAME externalId (e.g. both use the numeric account id "42"); a bare
        // externalId would then collapse those two distinct tenants onto one
        // Frigg user. Prefixing with the module keeps them separate for BOTH the
        // org-user and individual-user identity.
        const identity = `${moduleName}:${externalId}`;

        // Find-or-create the Frigg user from the PROVIDER-DERIVED identity only.
        // A client-supplied appOrgId/appUserId is never read here — the caller
        // passes nothing but the key and (optionally) the allowlisted module.
        const useOrg = this.userConfig.organizationUserRequired === true;
        const appOrgId = useOrg ? identity : undefined;
        const appUserId = useOrg ? undefined : identity;

        // NOTE (accepted cleanup debt): the user is found-or-created before the
        // credential is provisioned below. If ProcessAuthorizationCallback fails,
        // a user with no credential/entity is left behind. Reordering to create
        // the credential first is intentionally out of scope here; orphaned users
        // on partial failure are tolerated and cleaned up out of band.
        const user = await this.getUserFromXFriggHeaders.execute(
            appUserId,
            appOrgId
        );
        const userId = user.getId();
        if (!userId) {
            throw invalidCredentials();
        }

        // Create/refresh the Credential + Entity through the same path
        // /api/authorize uses. The key is persisted only as the encrypted
        // Credential — never returned, never logged, never a JWT claim.
        const callbackResult = await this.processAuthorizationCallback.execute(
            userId,
            moduleName,
            { api_key: apiKey }
        );

        // Defense-in-depth: never mint a session unless the credential was
        // actually persisted. A callback that returns without a credential id
        // means the key was not connected; minting anyway would hand out a
        // session over a half-provisioned tenant. Fail 500-class, not 401.
        if (!callbackResult || !callbackResult.credential_id) {
            throw Boom.badImplementation(
                'Login failed to create a credential for the api-key identity'
            );
        }

        // Mint an ordinary, short-lived app-user session token (never admin).
        const token = await this.createTokenForUserId.execute(
            userId,
            this.tokenExpiryMinutes
        );

        return { token, userId, module: moduleName };
    }
}

module.exports = {
    LoginWithApiKey,
    classifyProviderError,
    DEFAULT_MAX_API_KEY_LENGTH,
};
