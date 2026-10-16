/**
 * Netlify Background Functions Queue Provider (Adapter)
 *
 * Uses Netlify Background Functions for async job processing.
 * Background functions have a 15-minute execution limit and are triggered via HTTP POST.
 * They return 202 immediately while processing continues.
 *
 * Queue ID format: The function name or URL path for the background function.
 * Convention: function files named with '-background' suffix (e.g., 'worker-background.js')
 *
 * Authentication: a background function is a public URL and Netlify does
 * not authenticate its caller, so every message is signed with
 * FRIGG_QUEUE_SIGNING_SECRET (HMAC-SHA256 over timestamp + raw body, see
 * ../queue-message-auth.js) and verifyEvent() checks that signature before
 * the worker parses or dispatches anything. Without the secret, send() and
 * verifyEvent() refuse, except outside production with
 * FRIGG_QUEUE_ALLOW_UNSIGNED=true.
 *
 * Limitations:
 * - No built-in retry (must implement manually)
 * - No dead-letter queue
 * - No FIFO ordering guarantees
 * - 15-minute max execution time
 */
const { QueueProvider } = require('../queue-provider');
const {
    SIGNING_SECRET_ENV,
    ALLOW_UNSIGNED_ENV,
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    allowsUnsignedMessages,
    readSigningSecret,
    signQueueMessage,
    verifyQueueMessage,
    readHeader,
    readRawBody,
} = require('../queue-message-auth');

class NetlifyBackgroundProvider extends QueueProvider {
    /**
     * @param {Object} [options]
     * @param {string} [options.baseUrl] - site URL (default process.env.URL)
     * @param {string} [options.signingSecret] - default FRIGG_QUEUE_SIGNING_SECRET, read per call
     * @param {Object} [options.env] - environment to read (default process.env)
     * @param {() => number} [options.now] - clock in milliseconds (tests)
     */
    constructor(options = {}) {
        super();
        // Base URL for triggering background functions (e.g., https://mysite.netlify.app)
        this.baseUrl = options.baseUrl || process.env.URL || '';
        this.signingSecret = options.signingSecret;
        this.env = options.env || process.env;
        this.now = options.now || Date.now;
    }

    // Read on every call, not in the constructor: secrets may be loaded into
    // the environment after the provider is built (loadSecrets).
    _secret() {
        return this.signingSecret || readSigningSecret(this.env);
    }

    /**
     * Send a message by invoking a Netlify Background Function via HTTP POST.
     *
     * @param {Object} message - Message payload
     * @param {string} queueId - Background function path (e.g., '/.netlify/functions/worker-background')
     */
    async send(message, queueId) {
        const url = `${this.baseUrl}${queueId}`;
        const body = JSON.stringify(message);
        const headers = { 'Content-Type': 'application/json' };

        const secret = this._secret();
        if (secret) {
            Object.assign(headers, signQueueMessage({ body, secret, now: this.now() }));
        } else if (!allowsUnsignedMessages(this.env)) {
            // The worker would refuse the message, and a background function
            // answers 202 either way, so the loss would be silent. Fail here.
            throw new Error(
                `${SIGNING_SECRET_ENV} is required to send to a Netlify background function ` +
                    `(${ALLOW_UNSIGNED_ENV}=true allows unsigned messages outside production only)`
            );
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body,
        });

        if (!response.ok && response.status !== 202) {
            throw new Error(
                `Failed to invoke background function at ${queueId}: ${response.status} ${response.statusText}`
            );
        }

        return { status: response.status, queueId };
    }

    /**
     * Send batch of messages sequentially (background functions are HTTP-triggered).
     */
    async batchSend(batch, queueId) {
        const entries = batch ?? [];
        const results = [];
        for (const entry of entries) {
            const result = await this.send(entry, queueId);
            results.push(result);
        }
        return { results };
    }

    /**
     * Check the Frigg signature on an incoming background-function event.
     *
     * @param {Object} event - Netlify v1 (Lambda-shaped) event
     * @returns {Promise<{ ok: boolean, reason?: string, unsigned?: boolean }>}
     */
    async verifyEvent(event) {
        const secret = this._secret();
        if (!secret) {
            return allowsUnsignedMessages(this.env)
                ? { ok: true, unsigned: true }
                : { ok: false, reason: 'signing_secret_not_configured' };
        }
        return verifyQueueMessage({
            body: readRawBody(event),
            timestamp: readHeader(event, TIMESTAMP_HEADER),
            signature: readHeader(event, SIGNATURE_HEADER),
            secret,
            now: this.now(),
        });
    }

    /**
     * Parse Netlify Background Function event.
     * Background functions receive the raw HTTP event body as the event.
     */
    parseEvent(event) {
        const raw = readRawBody(event);
        const body = raw !== null ? JSON.parse(raw) : event.body;

        // Background functions receive a single message per invocation
        return [body];
    }
}

module.exports = { NetlifyBackgroundProvider };
