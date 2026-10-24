const { ProxyRequestError } = require('./proxy-errors');

/**
 * What the entity proxy accepts and returns (ADR-052 §5-§7). Pure functions:
 * no I/O, so every rule is unit-tested on its own.
 */

const PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Request headers a caller may always send (lower case). */
const ALLOWED_REQUEST_HEADERS = [
    'accept',
    'content-type',
    'accept-language',
    'if-match',
    'if-none-match',
];

/** Request headers that are refused outright, even if a module lists them. */
const REJECTED_REQUEST_HEADERS = [
    'authorization',
    'proxy-authorization',
    'cookie',
    'host',
    'forwarded',
    'x-real-ip',
    'x-api-key',
];
const REJECTED_REQUEST_HEADER_PREFIXES = ['x-forwarded-'];

/** Response headers never passed back (credentials and hop-by-hop). */
const REMOVED_RESPONSE_HEADERS = [
    'authorization',
    'proxy-authorization',
    'proxy-authenticate',
    'set-cookie',
    'set-cookie2',
    'www-authenticate',
    'x-api-key',
    'connection',
    'keep-alive',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    // The body is re-encoded as JSON, so these no longer describe it.
    'content-length',
    'content-encoding',
];

const invalid = (message, details) =>
    new ProxyRequestError('INVALID_PROXY_REQUEST', message, details);

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validates the request body of POST /api/v2/entities/:id/proxy and returns
 * it with the method upper-cased and the body serialised.
 *
 * @param {unknown} request
 * @param {{ maxRequestBytes: number }} limits
 * @returns {{ method: string, path: string, query?: Object, headers: Object, body?: string, requestBytes: number, bodyIsJson: boolean }}
 */
function validateProxyRequest(request, { maxRequestBytes }) {
    if (!isPlainObject(request)) throw invalid('The proxy request must be a JSON object');
    const method = typeof request.method === 'string' ? request.method.toUpperCase() : '';
    if (!PROXY_METHODS.includes(method)) {
        throw invalid(`method must be one of ${PROXY_METHODS.join(', ')}`, { field: 'method' });
    }
    if (typeof request.path !== 'string') {
        throw invalid('path is required', { field: 'path' });
    }

    let query;
    if (request.query !== undefined && request.query !== null) {
        if (!isPlainObject(request.query)) throw invalid('query must be an object', { field: 'query' });
        query = {};
        for (const [key, value] of Object.entries(request.query)) {
            const scalar = ['string', 'number', 'boolean'].includes(typeof value);
            const list = Array.isArray(value) && value.every((v) => typeof v === 'string');
            if (!scalar && !list) {
                throw invalid(`query.${key} must be a string, number, boolean or array of strings`, {
                    field: `query.${key}`,
                });
            }
            // The requester sends one value per key; arrays go comma-separated.
            query[key] = list ? value.join(',') : value;
        }
    }

    const headers = {};
    if (request.headers !== undefined && request.headers !== null) {
        if (!isPlainObject(request.headers)) throw invalid('headers must be an object', { field: 'headers' });
        for (const [name, value] of Object.entries(request.headers)) {
            if (typeof value !== 'string') {
                throw invalid(`header ${name} must be a string`, { field: `headers.${name}` });
            }
            headers[name.toLowerCase()] = value;
        }
    }

    let body;
    let bodyIsJson = false;
    if (request.body !== undefined && request.body !== null) {
        if (!METHODS_WITH_BODY.has(method)) {
            throw invalid(`${method} requests cannot have a body`, { field: 'body' });
        }
        if (typeof request.body === 'string') {
            body = request.body;
        } else {
            body = JSON.stringify(request.body);
            bodyIsJson = true;
        }
    }
    const requestBytes = body === undefined ? 0 : Buffer.byteLength(body);
    if (requestBytes > maxRequestBytes) {
        throw new ProxyRequestError(
            'PAYLOAD_TOO_LARGE',
            `The proxied request body is larger than ${maxRequestBytes} bytes`
        );
    }
    return { method, path: request.path, query, headers, body, bodyIsJson, requestBytes };
}

const isWildcardRule = (rule) => rule?.method === '*' || rule?.path === '/**';

const isValidRule = (rule) =>
    isPlainObject(rule) &&
    typeof rule.method === 'string' &&
    typeof rule.path === 'string' &&
    rule.path.startsWith('/');

/**
 * The allow-list in force for a module: the app definition's list for it when
 * one is given (`managementApi.proxy.modules[name].allow`), otherwise the
 * module's own `proxy.allow`. A module cannot grant itself a wildcard; only
 * the app definition can. No list means nothing may be proxied.
 *
 * @returns {{ rules: Array<{method: string, path: string}>, source: 'app'|'module'|'none', ignored: number }}
 */
function resolveAllowRules(definition, moduleOverrides = {}) {
    const override = moduleOverrides?.[definition.moduleName]?.allow;
    if (Array.isArray(override)) {
        return { rules: override.filter(isValidRule), source: 'app', ignored: 0 };
    }
    const declared = Array.isArray(definition.proxy?.allow) ? definition.proxy.allow : [];
    const rules = declared.filter((rule) => isValidRule(rule) && !isWildcardRule(rule));
    return {
        rules,
        source: rules.length ? 'module' : 'none',
        ignored: declared.length - rules.length,
    };
}

/**
 * Keeps only the request headers the caller may set. A header from the
 * rejected list (credentials, Host, forwarding headers, or one the module's
 * own auth sets) fails the request instead of being dropped quietly.
 *
 * @param {Object} headers - lower-cased names
 * @param {Object} options
 * @param {string[]} [options.moduleHeaders] - from the module's `proxy.headers`
 * @param {string[]} [options.authHeaderNames] - headers the module's auth sets
 */
function filterRequestHeaders(headers, { moduleHeaders = [], authHeaderNames = [] } = {}) {
    const rejected = new Set([
        ...REJECTED_REQUEST_HEADERS,
        ...authHeaderNames.filter(Boolean).map((name) => String(name).toLowerCase()),
    ]);
    const allowed = new Set([
        ...ALLOWED_REQUEST_HEADERS,
        ...moduleHeaders.map((name) => String(name).toLowerCase()),
    ]);
    const kept = {};
    for (const [name, value] of Object.entries(headers)) {
        if (
            rejected.has(name) ||
            REJECTED_REQUEST_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))
        ) {
            throw invalid(`The ${name} header cannot be sent through the proxy`, {
                field: `headers.${name}`,
            });
        }
        if (allowed.has(name)) kept[name] = value;
    }
    return kept;
}

/**
 * Removes credential and hop-by-hop headers from an upstream response, and
 * the Location of a redirect the proxy refused to follow.
 */
function filterResponseHeaders(headers, { redirectBlocked = false, authHeaderNames = [] } = {}) {
    const removed = new Set([
        ...REMOVED_RESPONSE_HEADERS,
        ...authHeaderNames.filter(Boolean).map((name) => String(name).toLowerCase()),
    ]);
    if (redirectBlocked) removed.add('location');
    const kept = {};
    for (const [name, value] of Object.entries(headers || {})) {
        if (!removed.has(name.toLowerCase())) kept[name.toLowerCase()] = value;
    }
    return kept;
}

const JSON_TYPE = /^application\/([a-z0-9.+-]*\+)?json\b/i;
const TEXT_TYPE = /^(text\/|application\/(xml|x-www-form-urlencoded|javascript|graphql)\b|[a-z]+\/[a-z0-9.+-]*\+xml\b)/i;

/**
 * Turns the upstream body into the `data` of the proxy response: parsed JSON,
 * text, or (only if the module allows binary) base64.
 *
 * @returns {{ data: unknown, encoding?: 'base64' }}
 */
function decodeResponseBody(body, contentType, { binary = false } = {}) {
    if (!body || body.length === 0) return { data: null };
    if (JSON_TYPE.test(contentType)) {
        const text = body.toString('utf8');
        try {
            return { data: JSON.parse(text) };
        } catch {
            return { data: text };
        }
    }
    if (!contentType || TEXT_TYPE.test(contentType)) {
        return { data: body.toString('utf8') };
    }
    if (binary) return { data: body.toString('base64'), encoding: 'base64' };
    throw new ProxyRequestError(
        'UNSUPPORTED_MEDIA_TYPE',
        'The upstream response is binary and this module does not allow binary proxying',
        { contentType: contentType.split(';')[0] }
    );
}

module.exports = {
    PROXY_METHODS,
    ALLOWED_REQUEST_HEADERS,
    REJECTED_REQUEST_HEADERS,
    REMOVED_RESPONSE_HEADERS,
    validateProxyRequest,
    resolveAllowRules,
    filterRequestHeaders,
    filterResponseHeaders,
    decodeResponseBody,
};
