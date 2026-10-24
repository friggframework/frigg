const { Router } = require('express');
const Boom = require('@hapi/boom');
const { getLogger } = require('../logs');
const { getTelemetry } = require('../telemetry/telemetry-runtime');
const {
    MANAGEMENT_API_VERSIONS,
    V1_MIGRATION_DOCS_URL,
    V1_ROUTES,
} = require('./route-registry');

const log = getLogger('frigg.api');

const V1_LINK_HEADER = `<${V1_MIGRATION_DOCS_URL}>; rel="deprecation"; type="text/html"`;

/**
 * RFC 9745 `Deprecation` value: an RFC 9651 structured-field date, i.e. `@`
 * followed by seconds since the epoch.
 * @param {string} isoDate - YYYY-MM-DD
 */
function deprecationHeaderValue(isoDate) {
    return `@${Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000)}`;
}

const registerOn = (router, { method, path }, handler) => {
    const verb = method === 'ANY' ? 'all' : method.toLowerCase();
    router[verb](path, handler);
};

function setDeprecationHeaders(res) {
    const { deprecatedAt, sunset } = MANAGEMENT_API_VERSIONS['1'];
    res.set('Deprecation', deprecationHeaderValue(deprecatedAt));
    if (sunset) {
        // RFC 8594: an HTTP-date.
        res.set('Sunset', new Date(`${sunset}T00:00:00Z`).toUTCString());
    }
    res.append('Link', V1_LINK_HEADER);
}

/**
 * Marks every v1 response as deprecated and records the call (ADR-053 §6):
 * `Deprecation` + `Link: rel="deprecation"` headers, one ADR-048 log record
 * and one ADR-011 counter increment per call. Mounted ahead of the frozen v1
 * router; it calls `next()` so the v1 handler answers unchanged.
 *
 * @param {Object} [params]
 * @param {Object} [params.telemetry] - defaults to the process telemetry.
 */
function createV1DeprecationRouter({ telemetry } = {}) {
    const router = Router();

    for (const route of V1_ROUTES) {
        registerOn(router, route, (req, res, next) => {
            // One signal per request, even if two v1 patterns match it.
            if (res.locals.friggV1Deprecated) return next();
            res.locals.friggV1Deprecated = true;
            setDeprecationHeaders(res);
            const method = req.method;
            log.info('Deprecated Management API v1 route called', {
                eventName: 'frigg.api.deprecated_route',
                route: route.path,
                method,
                client: req.get('Frigg-Client'),
            });
            try {
                (telemetry || getTelemetry()).count('frigg.api.v1.requests', 1, {
                    route: route.path,
                    method,
                });
            } catch {
                // Telemetry must never break a request.
            }
            next();
        });
    }

    return router;
}

/**
 * Answers the v1 routes with 410 Gone when the app sets
 * `managementApi.v1: false`. Only the registry's v1 routes are claimed, so
 * the OAuth redirect and adopter routes keep working.
 */
function createV1DisabledRouter() {
    const router = Router();
    for (const route of V1_ROUTES) {
        registerOn(router, route, (_req, res, next) => {
            res.append('Link', V1_LINK_HEADER);
            next(
                Boom.resourceGone(
                    'Management API v1 is disabled for this app. Use /api/v2; see the migration guide.',
                    {
                        code: 'API_VERSION_DISABLED',
                        details: { migrationGuide: V1_MIGRATION_DOCS_URL },
                    }
                )
            );
        });
    }
    // A disabled v1 answers in the v2 error shape: there is no v1 contract
    // left to honour, and the body should point at the replacement.
    router.use((err, req, res, next) => {
        if (err?.data?.code !== 'API_VERSION_DISABLED') return next(err);
        res.status(410).json({
            error: {
                code: 'API_VERSION_DISABLED',
                message: err.message,
                details: err.data.details,
            },
        });
    });
    return router;
}

module.exports = {
    createV1DeprecationRouter,
    createV1DisabledRouter,
    deprecationHeaderValue,
    V1_LINK_HEADER,
};
