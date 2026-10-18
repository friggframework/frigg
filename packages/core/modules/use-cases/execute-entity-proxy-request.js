const Boom = require('@hapi/boom');
const { getLogger } = require('../../logs');
const { getTelemetry } = require('../../telemetry/telemetry-runtime');
const { ProxyRequestError } = require('../proxy/proxy-errors');
const { SCOPES } = require('../scope-resolution');
const { grantsUse } = require('../scope-visibility');
const { normalizeProxyPath, matchAllowRule } = require('../proxy/proxy-path');
const { DEFAULT_BASE, resolveModuleBases } = require('../proxy/proxy-bases');
const {
    validateProxyRequest,
    resolveAllowRules,
    filterRequestHeaders,
    filterResponseHeaders,
    decodeResponseBody,
} = require('../proxy/proxy-policy');

const log = getLogger('frigg.api.proxy');

/** HTTP status and audit outcome for each proxy error code (ADR-052 §10). */
const ERROR_MAP = {
    INVALID_PROXY_REQUEST: { status: 400, outcome: 'denied' },
    PROXY_UNKNOWN_BASE: { status: 400, outcome: 'denied' },
    PROXY_NOT_ALLOWED: { status: 403, outcome: 'denied' },
    PAYLOAD_TOO_LARGE: { status: 413, outcome: 'too_large' },
    UNSUPPORTED_MEDIA_TYPE: { status: 415, outcome: 'denied' },
    PROXY_NOT_CONFIGURED: { status: 501, outcome: 'denied' },
    INVALID_CREDENTIALS: { status: 401, outcome: 'upstream_error' },
    RATE_LIMITED: { status: 429, outcome: 'upstream_error' },
    UPSTREAM_ERROR: { status: 502, outcome: 'upstream_error' },
    NETWORK_ERROR: { status: 502, outcome: 'upstream_error' },
    RESPONSE_TOO_LARGE: { status: 502, outcome: 'too_large' },
    TIMEOUT: { status: 504, outcome: 'timeout' },
};

function toBoom(error, extra = {}) {
    const mapping = ERROR_MAP[error.code] || { status: 502 };
    const boom = new Boom.Boom(error.message, {
        statusCode: mapping.status,
        data: {
            code: error.code,
            details: error.details,
            // Every proxy message is written for the caller (no URLs, no
            // credential material), including the 5xx ones.
            expose: true,
            proxy: true,
            ...extra,
        },
    });
    return boom;
}

const authHeaderNamesOf = (api) =>
    [api?.api_key_name, api?.API_KEY_NAME].filter(
        (name) => typeof name === 'string' && name
    );

/**
 * POST /api/v2/entities/:entityId/proxy (ADR-052): calls the entity's API
 * through its module with the stored credential, inside the limits the app
 * and the module set.
 *
 * Order of checks: request shape and size, path rules, entity visibility in
 * the active organization (404), `use` access (403), the entity's scope
 * against `managementApi.proxy.scopes` (403), the module's allow-list (403,
 * deny by default), credential readiness (401), then the call through
 * Requester._proxyRequest. Every call,
 * allowed or denied, writes one audit record and one usage count. Bodies,
 * headers, query values and the raw path are never logged.
 */
class ExecuteEntityProxyRequest {
    /**
     * @param {Object} params
     * @param {import('./get-entity-module-for-user').GetEntityModuleForUser} params.getEntityModuleForUser
     * @param {ReturnType<import('../../management-api/management-api-config').resolveManagementApiConfig>['proxy']} params.proxyConfig
     * @param {Object} [params.telemetry]
     * @param {() => number} [params.now]
     */
    constructor({ getEntityModuleForUser, proxyConfig, telemetry, now }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
        this.proxyConfig = proxyConfig;
        this.telemetry = telemetry;
        this.now = now || Date.now;
    }

    /**
     * @param {string} entityId
     * @param {Object} user - authenticated User
     * @param {Object} request - { method, path, query?, headers?, body? }
     * @returns {Promise<{ status: number, body: { success: boolean, status: number, headers: Object, data: unknown, dataEncoding?: string } }>}
     */
    async execute(entityId, user, request) {
        const started = this.now();
        const audit = {
            userId: user?.getId?.(),
            organizationId: user?.getOrganizationUser?.()?.id,
            entityId: String(entityId),
            method: typeof request?.method === 'string' ? request.method.toUpperCase() : undefined,
            requestBytes: 0,
        };

        try {
            const validated = validateProxyRequest(request, this.proxyConfig);
            audit.method = validated.method;
            audit.requestBytes = validated.requestBytes;
            const path = normalizeProxyPath(validated.path);

            // Visible in the active organization, or 404 (ADR-056 §3.6): the
            // same clauses the v2 lists use, so a missing entity, another
            // person's and one paired with another organization look alike.
            const { entity, definition, module } =
                await this.getEntityModuleForUser.execute(entityId, user);
            audit.module = definition.moduleName;
            this.assertProxyable(entityId, entity, definition, user);

            // The base is a name the module declared; the host comes from the
            // module's declaration, never from the request.
            const base = validated.base ?? DEFAULT_BASE;
            const bases = resolveModuleBases(definition);
            if (!bases.names.includes(base)) {
                throw new ProxyRequestError(
                    'PROXY_UNKNOWN_BASE',
                    `Module ${definition.moduleName} has no base named ${base}; use one of: ${bases.names.join(', ')}`,
                    { module: definition.moduleName, base, bases: bases.names }
                );
            }
            audit.base = base;

            const credentialRef = entity.credential;
            const credentialId =
                credentialRef && typeof credentialRef === 'object'
                    ? credentialRef.id ?? credentialRef._id
                    : credentialRef;
            if (credentialId !== undefined && credentialId !== null) {
                audit.credentialId = String(credentialId);
            }

            const { rules } = resolveAllowRules(definition, this.proxyConfig.modules);
            const rule = matchAllowRule(rules, validated.method, path, base);
            if (!rule) {
                throw new ProxyRequestError(
                    'PROXY_NOT_ALLOWED',
                    `Module ${definition.moduleName} does not allow ${validated.method} on this path of base ${base}`,
                    { module: definition.moduleName, method: validated.method, base }
                );
            }
            audit.pattern = rule.path;

            const credential = entity.credential;
            if (!credential || (typeof credential === 'object' && credential.authIsValid === false)) {
                throw new ProxyRequestError(
                    'INVALID_CREDENTIALS',
                    'The entity has no usable credential; re-authorize it'
                );
            }

            const authHeaderNames = authHeaderNamesOf(module.api);
            const headers = filterRequestHeaders(validated.headers, {
                moduleHeaders: Array.isArray(definition.proxy?.headers) ? definition.proxy.headers : [],
                authHeaderNames,
            });
            if (validated.body !== undefined && !headers['content-type']) {
                headers['content-type'] = validated.bodyIsJson ? 'application/json' : 'text/plain';
            }

            const upstream = await module.api._proxyRequest({
                method: validated.method,
                path,
                query: validated.query,
                headers,
                body: validated.body,
                baseUrl: this.resolveBaseUrl(bases, module.api, base),
                timeoutMs: this.proxyConfig.timeoutMs,
                maxResponseBytes: this.proxyConfig.maxResponseBytes,
                isAllowedRedirect: (nextPath, nextMethod) =>
                    Boolean(matchAllowRule(rules, nextMethod, nextPath, base)),
            });
            audit.upstreamStatus = upstream.status;
            audit.responseBytes = upstream.body?.length ?? 0;

            if (upstream.status === 429) {
                throw Object.assign(
                    new ProxyRequestError('RATE_LIMITED', 'The upstream API is rate limiting this account', {
                        upstreamStatus: 429,
                    }),
                    { retryAfter: upstream.headers['retry-after'] }
                );
            }
            if (upstream.status >= 500) {
                throw new ProxyRequestError('UPSTREAM_ERROR', 'The upstream API returned an error', {
                    upstreamStatus: upstream.status,
                });
            }

            const decoded = decodeResponseBody(upstream.body, upstream.contentType, {
                binary: definition.proxy?.binary === true,
            });
            const result = {
                status: upstream.status,
                body: {
                    success: upstream.status < 400,
                    status: upstream.status,
                    headers: filterResponseHeaders(upstream.headers, {
                        redirectBlocked: upstream.redirectBlocked,
                        authHeaderNames,
                    }),
                    data: decoded.data,
                    ...(decoded.encoding && { dataEncoding: decoded.encoding }),
                },
            };
            this.record(audit, upstream.status < 400 ? 'ok' : 'upstream_error', started);
            return result;
        } catch (error) {
            if (error instanceof ProxyRequestError) {
                const { outcome = 'upstream_error' } = ERROR_MAP[error.code] || {};
                this.record(audit, outcome, started, error.code);
                throw toBoom(error, error.retryAfter ? { retryAfter: error.retryAfter } : {});
            }
            const notFound = error?.isBoom && error.output.statusCode === 404;
            this.record(
                audit,
                notFound ? 'denied' : 'error',
                started,
                error?.data?.code || (error?.isBoom ? undefined : 'INTERNAL_ERROR')
            );
            throw error;
        }
    }

    /**
     * ADR-056 §3.5: the caller needs `use` access to the entity in the active
     * organization, and the entity's scope must be one the app lets the proxy
     * accept. `access` and `scope` come from the description the v2 lists
     * return (GetEntityModuleForUser.describe), never from a second rule.
     *
     * Both refusals are 403 PROXY_NOT_ALLOWED: the caller can already see the
     * entity, so saying it exists leaks nothing. `details.reason` tells them
     * apart ('access' or 'scope').
     */
    assertProxyable(entityId, entity, definition, user) {
        const tenancy = this.getEntityModuleForUser.describe(entity, user);
        if (!tenancy) {
            // Not visible after all: the same 404 as a missing entity.
            throw Boom.notFound(`Entity ${entityId} not found`, {
                code: 'ENTITY_NOT_FOUND',
            });
        }
        if (!grantsUse(tenancy.access)) {
            throw new ProxyRequestError(
                'PROXY_NOT_ALLOWED',
                'Proxying through an entity needs use access to it; you can only view this one',
                { module: definition.moduleName, reason: 'access' }
            );
        }
        // Narrowest by default (§3.5): with no setting only individual
        // entities are proxied, because proxying through a shared credential
        // lets any member act on the organization's account.
        const acceptedScopes = this.proxyConfig.scopes ?? [SCOPES.INDIVIDUAL];
        if (!acceptedScopes.includes(tenancy.scope)) {
            throw new ProxyRequestError(
                'PROXY_NOT_ALLOWED',
                `The entity proxy does not accept ${tenancy.scope} entities in this app`,
                { module: definition.moduleName, reason: 'scope', scope: tenancy.scope }
            );
        }
    }

    /**
     * The URL of the named base: a module may pin it (string, or a function of
     * the api). Undefined for `default` on a module that pins nothing, in which
     * case the requester's own base URL is used.
     */
    resolveBaseUrl(bases, api, name) {
        const declared = bases.values.get(name);
        if (typeof declared === 'function') return declared(api);
        if (typeof declared === 'string') return declared;
        return undefined;
    }

    /** One audit record (ADR-048) and one usage count (ADR-011) per call. */
    record(audit, outcome, started, reason) {
        const fields = {
            eventName: 'frigg.api.proxy.request',
            ...audit,
            outcome,
            durationMs: this.now() - started,
            ...(reason && { reason }),
        };
        if (outcome === 'ok' || outcome === 'upstream_error') {
            log.info('Entity proxy request', fields);
        } else {
            log.warn('Entity proxy request refused', fields);
        }
        try {
            (this.telemetry || getTelemetry()).count('frigg.api.proxy.requests', 1, {
                module: audit.module || 'unknown',
                method: audit.method || 'unknown',
                outcome,
            });
        } catch {
            // Telemetry must never break a request.
        }
    }
}

module.exports = { ExecuteEntityProxyRequest, ERROR_MAP };
