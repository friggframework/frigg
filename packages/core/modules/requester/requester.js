const fetch = require('node-fetch');
const { Delegate } = require('../../core');
const { FetchError } = require('../../errors');
const { get } = require('../../assertions');
const { getTelemetry } = require('../../telemetry/telemetry-singleton');

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

        // Telemetry (ADR-011). Defaults to the process singleton; overridable
        // for tests. Outbound requests are instrumented in `_request`.
        this.telemetry = (params && params.telemetry) || getTelemetry();
    }

    /**
     * Redact secrets/PII from a URL before it touches telemetry. Many API
     * modules embed credentials in the query string (?api_key=, ?token=,
     * presigned signatures) or in userinfo — those must never reach a span,
     * the bus, or an exporter. Keep only protocol + host + path (enough for
     * North Star endpoint matching).
     */
    _sanitizeUrl(url) {
        const raw = String(url);
        try {
            const u = new URL(raw);
            return `${u.protocol}//${u.host}${u.pathname}`;
        } catch (_) {
            // Relative/opaque URL: drop the query string at minimum.
            return raw.split('?')[0];
        }
    }

    /** Bounded module label for the apimodule.requests metric. */
    _telemetryModuleLabel() {
        return (
            this.moduleName ||
            this.delegate?.name ||
            this.delegate?.constructor?.name ||
            this.constructor?.name ||
            'unknown'
        );
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

    /**
     * Instrumenting entry point (ADR-011 P7). Wraps the whole logical request —
     * including retry/refresh recursion — in a single span + one
     * `frigg.apimodule.requests` counter, emitted on the `i === 0` boundary so
     * retries are never double-counted. The full URL rides the span only; the
     * metric carries bounded labels {module, method, status} — never endpoint.
     */
    async _request(url, options = {}, i = 0) {
        if (i !== 0) {
            return this._rawRequest(url, options, i);
        }

        const telemetry = this.telemetry;
        if (!telemetry || typeof telemetry.span !== 'function') {
            return this._rawRequest(url, options, 0);
        }

        const module = this._telemetryModuleLabel();
        const method = (options.method || 'GET').toUpperCase();
        const safeUrl = this._sanitizeUrl(url);

        return telemetry.span('frigg.apimodule.request', async (span) => {
            if (span && typeof span.setAttributes === 'function') {
                span.setAttributes({
                    'frigg.module': module,
                    'http.request.method': method,
                    // Redacted (no query/userinfo) — never emit raw URLs.
                    'url.path': safeUrl,
                });
            }
            // Redacted url (unbounded) rides the bus-only context for North Star
            // derived-from-trace matching — never a metric label.
            const busContext = { url: safeUrl };
            try {
                const result = await this._rawRequest(url, options, 0);
                telemetry.count(
                    'frigg.apimodule.requests',
                    1,
                    { module, method, status: 'ok' },
                    busContext
                );
                return result;
            } catch (err) {
                const code = err?.status ?? err?.statusCode;
                const status = code ? String(code) : 'error';
                if (span && typeof span.setAttribute === 'function' && code) {
                    span.setAttribute('http.response.status_code', code);
                }
                telemetry.count(
                    'frigg.apimodule.requests',
                    1,
                    { module, method, status },
                    busContext
                );
                throw err;
            }
        });
    }

    async _rawRequest(url, options, i = 0) {
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
                    return this._rawRequest(url, options, i + 1);
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
                return this._rawRequest(url, options, i + 1);
            }

            if (status === 401) {
                if (!this.isRefreshable) {
                    await this.notify(this.DLGT_INVALID_AUTH);
                    return;
                }

                if (this.refreshCount === 0) {
                    this.refreshCount++;
                    const refreshSucceeded = await this.refreshAuth();
                    if (refreshSucceeded) {
                        clearRequestTimer();
                        return this._rawRequest(url, options, i + 1);
                    }

                    await this.notify(this.DLGT_INVALID_AUTH);
                    return;
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
