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
        // Deliberately separate from `i` — a 429/5xx retry must not consume
        // the 401 grace retry budget below.
        this.authGraceRetryCount = 0;
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

        // Timer must stay active through body consumption. node-fetch v2
        // resolves the fetch() promise when headers arrive, not when the
        // body is fully read — so a server that sends headers and then
        // stalls the body would still hang parsedBody() or
        // FetchError.create()'s response.text() call. We clear the timer
        // only after the body is fully consumed (success path) or
        // deliberately before each recursive retry so the new attempt
        // starts with its own fresh timer.
        let timerCleared = false;
        const clearRequestTimer = () => {
            if (!timerCleared && timeoutHandle) {
                clearTimeout(timeoutHandle);
                timerCleared = true;
            }
        };

        try {
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
                    clearRequestTimer();
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
            }

            const { status } = response;

            // If the status is retriable and there are back off requests left, retry the request
            if ((status === 429 || status >= 500) && i < this.backOff.length) {
                clearRequestTimer();
                const delay = this.backOff[i] * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this._request(url, options, i + 1);
            }

            if (status === 401) {
                if (!this.isRefreshable) {
                    // One grace retry before invalidating — a single 401
                    // isn't proof the credential is bad.
                    if (this.authGraceRetryCount === 0) {
                        this.authGraceRetryCount++;
                        clearRequestTimer();
                        const delay = this.backOff[0] * 1000;
                        await new Promise((resolve) =>
                            setTimeout(resolve, delay)
                        );
                        return this._request(url, options, i + 1);
                    }

                    throw await this._invalidateAuth(
                        encodedUrl,
                        options,
                        response
                    );
                }

                if (this.refreshCount === 0) {
                    this.refreshCount++;
                    const refreshSucceeded = await this.refreshAuth();
                    if (refreshSucceeded) {
                        clearRequestTimer();
                        return this._request(url, options, i + 1);
                    }

                    throw await this._invalidateAuth(
                        encodedUrl,
                        options,
                        response
                    );
                }
            }

            // If the error wasn't retried, throw. FetchError.create reads
            // the response body (response.text()) — timer must still be
            // alive to catch a stalled body stream.
            if (status >= 400) {
                const fetchError = await FetchError.create({
                    resource: encodedUrl,
                    init: options,
                    response,
                });
                throw this._maybeFlagTimeoutDuringBodyRead(
                    fetchError,
                    timeoutMs
                );
            }

            // Successful response: reset the per-instance refresh budget so
            // a later 401 in the same Requester lifetime can attempt refresh
            // again instead of silently falling through.
            this.refreshCount = 0;
            this.authGraceRetryCount = 0;

            // parsedBody consumes the response body stream. If the server
            // stalls mid-stream the timer (still armed) aborts it.
            return options.returnFullRes
                ? response
                : await this.parsedBody(response);
        } catch (e) {
            // If the abort fired during body consumption, node-fetch emits
            // the error as an AbortError on the body stream. Surface the
            // same isTimeout flag callers use for header-phase timeouts.
            throw this._maybeFlagTimeoutDuringBodyRead(e, timeoutMs);
        } finally {
            clearRequestTimer();
        }
    }

    async _invalidateAuth(encodedUrl, options, response) {
        const fetchError = await FetchError.create({
            resource: encodedUrl,
            init: options,
            response,
        });
        await this.notify(this.DLGT_INVALID_AUTH, fetchError);
        return fetchError;
    }

    _maybeFlagTimeoutDuringBodyRead(err, timeoutMs) {
        if (!err || typeof err !== 'object') return err;
        if (err.isTimeout) return err;
        const isAbort = err.name === 'AbortError' || err.type === 'aborted';
        if (!isAbort) return err;
        err.isTimeout = true;
        err.timeoutMs = timeoutMs;
        return err;
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
