const { ProxyRequestError } = require('./proxy-errors');

/**
 * Path rules for the entity proxy (ADR-052 §4). The caller supplies a path
 * relative to the module's base URL and nothing else: the host, scheme and
 * port always come from the module.
 */

const invalid = (reason) =>
    new ProxyRequestError('INVALID_PROXY_REQUEST', `Invalid proxy path: ${reason}`, {
        field: 'path',
    });

// Control characters (C0, DEL, C1), any whitespace, and invisible format
// characters such as zero-width spaces and byte-order marks.
const FORBIDDEN_CHARS = /[\x00-\x20\x7f-\x9f]|\s|\p{Cf}/u;

/**
 * Validates and normalises a caller-supplied path.
 *
 * - must start with a single `/`; `//` (anywhere), `\`, `?`, `#`, control
 *   and whitespace characters are rejected;
 * - encoded separators (`%2f`, `%5c`) are rejected, then the path is
 *   percent-decoded exactly once; a `%` left after decoding (double
 *   encoding) is rejected, as is any decoded control or whitespace
 *   character other than a space (`%20`);
 * - `.` and `..` segments are rejected rather than resolved.
 *
 * @param {unknown} path
 * @returns {string} the decoded path, e.g. `/crm/v3/objects/contacts`
 * @throws {ProxyRequestError} INVALID_PROXY_REQUEST
 */
function normalizeProxyPath(path) {
    if (typeof path !== 'string' || path.length === 0) {
        throw invalid('path must be a non-empty string');
    }
    if (path.length > 2048) throw invalid('path is too long');
    if (!path.startsWith('/')) throw invalid('path must start with /');
    if (path.startsWith('//') || path.includes('//')) {
        throw invalid('empty path segments (//) are not allowed');
    }
    if (path.includes('\\')) throw invalid('backslashes are not allowed');
    if (path.includes('?') || path.includes('#')) {
        throw invalid('send the query string in `query`, not in the path');
    }
    if (FORBIDDEN_CHARS.test(path)) {
        throw invalid('control and whitespace characters are not allowed');
    }
    if (/%(2f|5c)/i.test(path)) {
        throw invalid('encoded path separators are not allowed');
    }

    let decoded;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        throw invalid('malformed percent-encoding');
    }
    if (
        decoded.includes('%') ||
        decoded.includes('\\') ||
        decoded.includes('?') ||
        decoded.includes('#') ||
        decoded.includes('//') ||
        // An encoded space (%20) is a legitimate path character; every other
        // control or whitespace character stays forbidden.
        FORBIDDEN_CHARS.test(decoded.replaceAll(' ', ''))
    ) {
        throw invalid('encoded characters decode to something not allowed');
    }

    const segments = decoded.split('/').slice(1);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
        throw invalid('dot segments (. and ..) are not allowed');
    }
    return decoded;
}

/**
 * Joins a module base URL and a normalised path, then proves the result
 * cannot leave the module's API: https only, same origin as the base URL,
 * and under the base URL's path.
 *
 * @param {string} baseUrl - from the module, never from the request
 * @param {string} normalizedPath - from normalizeProxyPath()
 * @returns {{ url: string, basePath: string, origin: string }} `url` is not
 *   percent-encoded; the Requester encodes it once.
 * @throws {ProxyRequestError} PROXY_NOT_CONFIGURED or INVALID_PROXY_REQUEST
 */
function joinProxyUrl(baseUrl, normalizedPath) {
    let base;
    try {
        base = new URL(baseUrl);
    } catch {
        throw new ProxyRequestError(
            'PROXY_NOT_CONFIGURED',
            'The module has no valid base URL to proxy to'
        );
    }
    if (base.protocol !== 'https:') {
        throw new ProxyRequestError(
            'PROXY_NOT_CONFIGURED',
            'The module base URL must use https to be proxied'
        );
    }
    if (base.username || base.password || base.search || base.hash) {
        throw new ProxyRequestError(
            'PROXY_NOT_CONFIGURED',
            'The module base URL must not carry credentials, a query or a fragment'
        );
    }

    const basePath = base.pathname.replace(/\/+$/, '');
    const url = `${base.origin}${basePath}${normalizedPath}`;

    let joined;
    try {
        joined = new URL(url);
    } catch {
        throw invalid('the joined URL is not valid');
    }
    const joinedPath = decodeURIComponent(joined.pathname);
    if (
        joined.protocol !== 'https:' ||
        joined.origin !== base.origin ||
        joined.username ||
        joined.password ||
        !(joinedPath === basePath || joinedPath.startsWith(`${basePath}/`))
    ) {
        throw invalid('the path leaves the module API');
    }
    return { url, basePath, origin: base.origin };
}

/**
 * Finds the allow-list rule that permits `method` on `path`.
 *
 * Patterns use `:param` for exactly one segment and a trailing `/**` for a
 * subtree (the prefix itself included). `method: '*'` matches any method.
 *
 * @param {Array<{method: string, path: string}>} rules
 * @param {string} method - upper case
 * @param {string} path - normalised path
 * @returns {{method: string, path: string}|null}
 */
function matchAllowRule(rules, method, path) {
    const requestSegments = path.split('/').slice(1);
    for (const rule of rules || []) {
        if (!rule || typeof rule.path !== 'string' || typeof rule.method !== 'string') {
            continue;
        }
        const ruleMethod = rule.method.toUpperCase();
        if (ruleMethod !== '*' && ruleMethod !== method) continue;
        if (patternMatches(rule.path, requestSegments)) return rule;
    }
    return null;
}

function patternMatches(pattern, requestSegments) {
    if (!pattern.startsWith('/')) return false;
    let patternSegments = pattern.split('/').slice(1);
    let subtree = false;
    if (patternSegments[patternSegments.length - 1] === '**') {
        subtree = true;
        patternSegments = patternSegments.slice(0, -1);
    }
    if (subtree) {
        if (requestSegments.length < patternSegments.length) return false;
    } else if (requestSegments.length !== patternSegments.length) {
        return false;
    }
    return patternSegments.every((segment, index) => {
        const actual = requestSegments[index];
        if (segment.startsWith(':')) return actual !== undefined && actual !== '';
        return segment === actual;
    });
}

module.exports = { normalizeProxyPath, joinProxyUrl, matchAllowRule };
