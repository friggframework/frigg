const { FetchError } = require('../../errors/fetch-error');
const { ProxyRequestError } = require('../proxy/proxy-errors');
const {
    normalizeProxyPath,
    joinProxyUrl,
} = require('../proxy/proxy-path');

const MAX_REDIRECTS = 3;

/**
 * The generic, path-checked request behind the Management API entity proxy
 * (ADR-052 §8). It runs through the requester's own `_request`, so auth
 * headers, token refresh (single-flight), the per-attempt timeout, telemetry
 * and log redaction all apply. What it adds:
 *
 * - the URL is always `module base URL + normalised path`; the caller cannot
 *   name a host, scheme or port;
 * - no backoff retries (the caller decides; a 429 comes back with its
 *   Retry-After), and upstream errors are returned, not thrown;
 * - redirects are handled manually: same origin and under the base path only,
 *   at most three hops, each re-checked with `isAllowedRedirect`;
 * - one deadline for the whole call and a cap on the response body.
 *
 * @param {import('./requester').Requester} requester
 * @param {Object} params
 * @param {string} params.method - upper case
 * @param {string} params.path - caller path, validated here
 * @param {Object} [params.query]
 * @param {Object} [params.headers] - already filtered by the caller's policy
 * @param {string|Buffer} [params.body] - already serialised
 * @param {string} [params.baseUrl] - module-declared proxy base URL; falls
 *   back to the requester's `proxyBaseUrl`, `baseUrl` or `baseURL`
 * @param {number} params.timeoutMs - budget for the whole call
 * @param {number} params.maxResponseBytes
 * @param {(path: string, method: string) => boolean} [params.isAllowedRedirect]
 * @returns {Promise<{ status: number, headers: Object, body: Buffer, contentType: string, redirectBlocked: boolean }>}
 * @throws {ProxyRequestError} INVALID_PROXY_REQUEST, PROXY_NOT_CONFIGURED,
 *   INVALID_CREDENTIALS, TIMEOUT, NETWORK_ERROR, RESPONSE_TOO_LARGE
 */
async function proxyRequest(requester, params) {
    const {
        method,
        path,
        query,
        headers = {},
        body,
        baseUrl,
        timeoutMs,
        maxResponseBytes,
        isAllowedRedirect,
    } = params;

    const normalizedPath = normalizeProxyPath(path);
    const base =
        baseUrl ??
        requester.proxyBaseUrl ??
        requester.baseUrl ??
        requester.baseURL;
    if (!base) {
        throw new ProxyRequestError(
            'PROXY_NOT_CONFIGURED',
            'The module declares no base URL to proxy to'
        );
    }
    const target = joinProxyUrl(base, normalizedPath);
    const deadline = Date.now() + timeoutMs;

    const run = async () => {
        let url = target.url;
        let currentMethod = method;
        let currentBody = body;
        let currentQuery = query;
        for (let hop = 0; ; hop++) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw timeoutError();

            const response = await requester._request(url, {
                method: currentMethod,
                headers: { ...headers },
                query: currentQuery,
                body: currentBody,
                returnFullRes: true,
                returnErrorResponses: true,
                noRetry: true,
                redirect: 'manual',
                size: maxResponseBytes,
                timeoutMs: remaining,
            });

            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                const next = sameApiRedirect(location, url, target);
                const nextMethod = redirectMethod(response.status, currentMethod);
                if (
                    next &&
                    hop < MAX_REDIRECTS &&
                    (!isAllowedRedirect || isAllowedRedirect(next.path, nextMethod))
                ) {
                    if (nextMethod !== currentMethod) currentBody = undefined;
                    currentMethod = nextMethod;
                    url = next.url;
                    currentQuery = undefined;
                    continue;
                }
                return readResponse(response, maxResponseBytes, {
                    redirectBlocked: !next,
                });
            }
            return readResponse(response, maxResponseBytes, {
                redirectBlocked: false,
            });
        }
    };

    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    });
    const work = run();
    // If the deadline wins, the request still settles later; nothing awaits it.
    work.catch(() => {});
    try {
        return await Promise.race([work, timeout]);
    } catch (error) {
        throw toProxyError(error);
    } finally {
        clearTimeout(timer);
    }
}

function timeoutError() {
    return new ProxyRequestError('TIMEOUT', 'The upstream API did not answer in time');
}

/**
 * A redirect target the proxy may follow: same origin as the module base URL
 * and under its base path. Returns null for anything else.
 */
function sameApiRedirect(location, currentUrl, target) {
    let next;
    try {
        next = new URL(location, currentUrl);
    } catch {
        return null;
    }
    if (next.origin !== target.origin || next.protocol !== 'https:') return null;
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(next.pathname);
    } catch {
        return null;
    }
    if (
        !(decodedPath === target.basePath || decodedPath.startsWith(`${target.basePath}/`))
    ) {
        return null;
    }
    const relativePath = decodedPath.slice(target.basePath.length) || '/';
    let checkedPath;
    try {
        checkedPath = normalizeProxyPath(relativePath);
    } catch {
        return null;
    }
    // _rawRequest percent-encodes the URL once, so hand it the decoded form.
    return {
        url: `${target.origin}${target.basePath}${checkedPath}${next.search ? decodeURI(next.search) : ''}`,
        path: checkedPath,
    };
}

/** Method for the next hop, as fetch does it. */
function redirectMethod(status, method) {
    if (status === 303 && method !== 'HEAD') return 'GET';
    if ((status === 301 || status === 302) && method === 'POST') return 'GET';
    return method;
}

async function readResponse(response, maxResponseBytes, { redirectBlocked }) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        destroyBody(response);
        throw tooLarge();
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxResponseBytes) throw tooLarge();
    const headers = {};
    response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
    });
    return {
        status: response.status,
        headers,
        body: buffer,
        contentType: headers['content-type'] || '',
        redirectBlocked,
    };
}

function destroyBody(response) {
    try {
        response.body?.destroy?.();
    } catch {
        // nothing to clean up
    }
}

function tooLarge() {
    return new ProxyRequestError(
        'RESPONSE_TOO_LARGE',
        'The upstream response is larger than the proxy allows'
    );
}

/** Maps requester and fetch failures to the proxy's error codes. */
function toProxyError(error) {
    if (error instanceof ProxyRequestError) return error;
    const causeType = error?.cause?.type ?? error?.type;
    if (causeType === 'max-size') return tooLarge();
    if (error?.isTimeout) return timeoutError();
    if (error instanceof FetchError || error?.name === 'FetchError') {
        if (error.statusCode === 401) {
            return new ProxyRequestError(
                'INVALID_CREDENTIALS',
                'The upstream API rejected the stored credentials; re-authorize the entity',
                { upstreamStatus: 401 }
            );
        }
        if (!error.statusCode) {
            return new ProxyRequestError(
                'NETWORK_ERROR',
                'Could not reach the upstream API'
            );
        }
        return new ProxyRequestError(
            'UPSTREAM_ERROR',
            'The upstream API returned an error',
            { upstreamStatus: error.statusCode }
        );
    }
    return error;
}

module.exports = { proxyRequest, MAX_REDIRECTS };
