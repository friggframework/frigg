/**
 * Resolves `appDefinition.managementApi` (ADR-052, ADR-053).
 *
 * ```js
 * managementApi: {
 *     v1: false,              // drop the deprecated v1 routes (default true)
 *     proxy: {
 *         enable: true,       // entity proxy, off by default (ADR-052)
 *         timeoutMs: 25000,   // whole upstream call, lower only
 *         maxRequestBytes: 1048576,
 *         maxResponseBytes: 5242880, // lower only
 *         scopes: ['individual'], // entity scopes the proxy accepts (ADR-056 §3.5)
 *         modules: {          // per-module allow-list override
 *             hubspot: { allow: 'module' },
 *             erp: { allow: [{ method: 'GET', path: '/v1/customers/**' }] },
 *         },
 *     },
 * }
 * ```
 *
 * Limits that are out of range fall back to their defaults. `proxy.scopes` is a
 * security setting, so it does not fall back: a value that is not a list of
 * known tenant scopes throws ManagementApiConfigError, and loadAppDefinition
 * calls this so the app stops at load.
 */

const { BaseError } = require('../errors/base-error');
const { SCOPES } = require('../modules/scope-resolution');

/** Raised for an invalid `appDefinition.managementApi` setting. */
class ManagementApiConfigError extends BaseError {
    constructor(message, options) {
        super(message, options);
        this.code = 'MANAGEMENT_API_CONFIG_INVALID';
    }
}

/**
 * The scopes `managementApi.proxy.scopes` may list. `global` is not one of
 * them: a global entity is the app owner's and is never a tenant's to proxy.
 */
const PROXY_SCOPE_VALUES = Object.freeze([SCOPES.INDIVIDUAL, SCOPES.ORGANIZATION]);

/**
 * Narrowest by default (ADR-056 §3.5): proxying through a shared credential
 * lets any member act on the organization's account, so an app opts in to
 * `organization` explicitly.
 */
const DEFAULT_PROXY_SCOPES = Object.freeze([SCOPES.INDIVIDUAL]);

// ADR-052 §7. API Gateway HTTP APIs time out at 30s and Lambda responses cap
// at 6MB, so the timeout and response defaults are also ceilings: an app may
// lower them, not raise them.
const DEFAULT_PROXY_LIMITS = Object.freeze({
    timeoutMs: 25_000,
    maxRequestBytes: 1024 * 1024,
    maxResponseBytes: 5 * 1024 * 1024,
});

// The request-body limit has no platform ceiling below API Gateway's 10MB, so
// an app may raise it up to that.
const MAX_REQUEST_BYTES_CEILING = 10 * 1024 * 1024;

const isPositiveNumber = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The value, capped at `ceiling`; the ceiling when the value is unusable. */
function positiveCapped(value, ceiling) {
    return isPositiveNumber(value) ? Math.min(value, ceiling) : ceiling;
}

/** The value, capped at `ceiling`; `fallback` when the value is unusable. */
function positiveOr(value, fallback, ceiling) {
    return isPositiveNumber(value) ? Math.min(value, ceiling) : fallback;
}

const proxyScopesError = (message) =>
    new ManagementApiConfigError(`managementApi.proxy.scopes: ${message}`);

/**
 * `managementApi.proxy.scopes`: absent means the default; anything else must be
 * a non-empty list of PROXY_SCOPE_VALUES, each once.
 * @returns {ReadonlyArray<string>}
 * @throws {ManagementApiConfigError}
 */
function resolveProxyScopes(scopes) {
    if (scopes === undefined) return DEFAULT_PROXY_SCOPES;
    const allowed = PROXY_SCOPE_VALUES.join(', ');
    if (!Array.isArray(scopes) || scopes.length === 0) {
        throw proxyScopesError(`must be a non-empty list drawn from ${allowed}`);
    }
    for (const scope of scopes) {
        if (scope === SCOPES.GLOBAL) {
            throw proxyScopesError(
                "'global' is not allowed: global entities belong to the app owner and are never proxied for a tenant"
            );
        }
        if (!PROXY_SCOPE_VALUES.includes(scope)) {
            throw proxyScopesError(`unknown scope ${JSON.stringify(scope)}; use ${allowed}`);
        }
    }
    if (new Set(scopes).size !== scopes.length) {
        throw proxyScopesError('lists a scope more than once');
    }
    return Object.freeze([...scopes]);
}

/**
 * @param {Object} [managementApi] - `appDefinition.managementApi`
 * @returns {{ v1: boolean, proxy: { enable: boolean, timeoutMs: number, maxRequestBytes: number, maxResponseBytes: number, scopes: ReadonlyArray<string>, modules: Object } }}
 * @throws {ManagementApiConfigError} for an invalid `proxy.scopes`
 */
function resolveManagementApiConfig(managementApi) {
    const config =
        managementApi && typeof managementApi === 'object' ? managementApi : {};
    const proxy =
        config.proxy && typeof config.proxy === 'object' ? config.proxy : {};

    return {
        v1: config.v1 !== false,
        proxy: {
            enable: proxy.enable === true,
            timeoutMs: positiveCapped(
                proxy.timeoutMs,
                DEFAULT_PROXY_LIMITS.timeoutMs
            ),
            maxRequestBytes: positiveOr(
                proxy.maxRequestBytes,
                DEFAULT_PROXY_LIMITS.maxRequestBytes,
                MAX_REQUEST_BYTES_CEILING
            ),
            maxResponseBytes: positiveCapped(
                proxy.maxResponseBytes,
                DEFAULT_PROXY_LIMITS.maxResponseBytes
            ),
            scopes: resolveProxyScopes(proxy.scopes),
            modules:
                proxy.modules && typeof proxy.modules === 'object'
                    ? proxy.modules
                    : {},
        },
    };
}

module.exports = {
    resolveManagementApiConfig,
    DEFAULT_PROXY_LIMITS,
    DEFAULT_PROXY_SCOPES,
    PROXY_SCOPE_VALUES,
    ManagementApiConfigError,
};
