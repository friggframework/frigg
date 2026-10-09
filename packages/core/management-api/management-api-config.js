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
 *         modules: {          // per-module allow-list override
 *             hubspot: { allow: 'module' },
 *             erp: { allow: [{ method: 'GET', path: '/v1/customers/**' }] },
 *         },
 *     },
 * }
 * ```
 */

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

/**
 * @param {Object} [managementApi] - `appDefinition.managementApi`
 * @returns {{ v1: boolean, proxy: { enable: boolean, timeoutMs: number, maxRequestBytes: number, maxResponseBytes: number, modules: Object } }}
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
            modules:
                proxy.modules && typeof proxy.modules === 'object'
                    ? proxy.modules
                    : {},
        },
    };
}

module.exports = { resolveManagementApiConfig, DEFAULT_PROXY_LIMITS };
