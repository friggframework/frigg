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
                    await new Promise((resolve) =>
                        setTimeout(resolve, delay)
                    );
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
            } else if (status === 401) {
                // Three outcomes per the auth-state contract:
                //   1. Token is not refreshable      → fire INVALID_AUTH (→ ERROR)
                //   2. Refreshable, refresh FAILS    → refreshAuth's own catch
                //                                      fires INVALID_AUTH; we
                //                                      do NOT double-fire here
                //   3. Refreshable, refresh SUCCEEDS → retry silently, no
                //                                      status change
                //
                // The previous version also fired INVALID_AUTH on
                // `refreshCount > 0` (any second 401 on the same Requester
                // instance). That caused integrations to be marked ERROR
                // when a transient 401 hit AFTER a successful refresh, or
                // when sibling concurrent requesters had already refreshed
                // (the new access token hadn't propagated to this
                // instance's in-memory state). A 401 after we've already
                // attempted refresh should just propagate up as a normal
                // HTTP error and let the next worker invocation try
                // refresh with the freshly persisted credential.
                if (!this.isRefreshable) {
                    await this.notify(this.DLGT_INVALID_AUTH);
                } else if (this.refreshCount === 0) {
                    this.refreshCount++;
                    const refreshSucceeded = await this.refreshAuth();
                    if (refreshSucceeded) {
                        clearRequestTimer();
                        return this._request(url, options, i + 1);
                    }
                    // refresh failed — refreshAuth() already fired
                    // INVALID_AUTH from its catch block; fall through
                    // to throw the 401 below.
                }
                // refreshable AND already attempted in this instance: do
                // nothing; the 401 will be thrown below and the integration
                // status is left untouched.
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

    _maybeFlagTimeoutDuringBodyRead(err, timeoutMs) {
        if (!err || typeof err !== 'object') return err;
        if (err.isTimeout) return err;
        const isAbort =
            err.name === 'AbortError' || err.type === 'aborted';
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
