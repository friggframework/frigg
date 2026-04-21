const fetch = require('node-fetch');
const { Delegate } = require('../../core');
const { FetchError } = require('../../errors');
const { get } = require('../../assertions');

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

class Requester extends Delegate {
    constructor(params) {
        super(params);
        this.backOff = get(params, 'backOff', [1, 3, 10, 30, 60, 180]);
        this.isRefreshable = false;
        this.refreshCount = 0;
        this.DLGT_INVALID_AUTH = 'INVALID_AUTH';
        this.delegateTypes.push(this.DLGT_INVALID_AUTH);
        this.agent = get(params, 'agent', null);

        // Per-attempt HTTP timeout. Without this the framework called fetch()
        // with no AbortController and no timeout — a silently-hung TCP
        // connection (server accepts but never responds) blocked the calling
        // promise forever, cascading into stalled batches, stalled syncs,
        // and worker-lambda timeouts.
        //
        // Configuration precedence:
        //   1. Instance param:   new Requester({ requestTimeoutMs: 30_000 })
        //   2. Class static:     static requestTimeoutMs = 30_000
        //   3. Default:          DEFAULT_REQUEST_TIMEOUT_MS (60s)
        //
        // Pass 0 (or null) to disable the timeout entirely — reserved for
        // test doubles and documented long-running endpoints.
        // Intentionally NOT using `get(params, ...)` here — the Frigg
        // `get` helper throws RequiredPropertyError if the key is missing
        // and no default is provided, which would collide with the fall-
        // through to the class-level static override.
        const instanceTimeout = params?.requestTimeoutMs;
        this.requestTimeoutMs =
            instanceTimeout !== undefined && instanceTimeout !== null
                ? instanceTimeout
                : this.constructor.requestTimeoutMs ??
                  DEFAULT_REQUEST_TIMEOUT_MS;

        // Allow passing in the fetch function
        // Instance methods can use this.fetch without differentiating
        this.fetch = get(params, 'fetch', fetch);
    }

    parsedBody = async (resp) => {
        const contentType = resp.headers.get('Content-Type') || '';

        if (
            contentType.match(/^application\/json/) ||
            contentType.match(/^application\/vnd.api\+json/) ||
            contentType.match(/^application\/hal\+json/)
        ) {
            return resp.json();
        }

        return resp.text();
    };

    async _request(url, options, i = 0) {
        let encodedUrl = encodeURI(url);
        if (options.query) {
            let queryBuild = '?';
            for (const key in options.query) {
                queryBuild += `${encodeURIComponent(key)}=${encodeURIComponent(
                    options.query[key]
                )}&`;
            }
            encodedUrl += queryBuild.slice(0, -1);
        }

        options.headers = await this.addAuthHeaders(options.headers);

        if (this.agent) options.agent = this.agent;

        // Per-attempt timeout — fresh AbortController per call so the retry
        // recursion (with its own backoff sleeps) always gets a clean
        // signal. Timer is cleared in the finally block regardless of
        // outcome.
        const timeoutMs = this.requestTimeoutMs;
        const controller = timeoutMs > 0 ? new AbortController() : null;
        const timeoutHandle = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : null;
        const fetchOptions = controller
            ? { ...options, signal: controller.signal }
            : options;

        let response;
        try {
            response = await this.fetch(encodedUrl, fetchOptions);
        } catch (e) {
            // AbortController fires AbortError (name) / ETIMEDOUT-shaped
            // errors (type on node-fetch) when we hit the timeout. No
            // retry on timeout: a slow endpoint is a downstream problem,
            // and each retry would wait another `timeoutMs` before giving
            // up — amplifying the hang into a per-record multi-minute
            // stall at batch scale.
            const isTimeout =
                e?.name === 'AbortError' || e?.type === 'aborted';
            if (e?.code === 'ECONNRESET' && i < this.backOff.length) {
                const delay = this.backOff[i] * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this._request(url, options, i + 1);
            }
            const fetchError = await FetchError.create({
                resource: encodedUrl,
                init: options,
                responseBody: isTimeout
                    ? `Request timed out after ${timeoutMs}ms`
                    : e,
            });
            if (isTimeout) {
                // Flag + machine-readable fields so callers can
                // distinguish a timeout from a generic network error
                // without parsing the message (which FetchError
                // sanitizes outside of STAGE=dev).
                fetchError.isTimeout = true;
                fetchError.timeoutMs = timeoutMs;
            }
            throw fetchError;
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
        const { status } = response;

        // If the status is retriable and there are back off requests left, retry the request
        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        } else if (status === 401) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify(this.DLGT_INVALID_AUTH);
            } else {
                this.refreshCount++;
                const refreshSucceeded = await this.refreshAuth();
                if (refreshSucceeded) {
                    return this._request(url, options, i + 1);
                }
            }
        }

        // If the error wasn't retried, throw.
        if (status >= 400) {
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                response,
            });
        }

        return options.returnFullRes
            ? response
            : await this.parsedBody(response);
    }

    async _get(options) {
        const fetchOptions = {
            method: 'GET',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || false,
        };

        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _post(options, stringify = true) {
        const fetchOptions = {
            method: 'POST',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _patch(options, stringify = true) {
        const fetchOptions = {
            method: 'PATCH',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _put(options, stringify = true) {
        const fetchOptions = {
            method: 'PUT',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _delete(options) {
        const fetchOptions = {
            method: 'DELETE',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || true,
        };
        return this._request(options.url, fetchOptions);
    }

    async refreshAuth() {
        throw new Error('refreshAuth not yet defined in child of Requester');
    }
}

module.exports = { Requester };
