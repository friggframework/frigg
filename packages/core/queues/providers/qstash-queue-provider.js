/**
 * QStash Queue Provider (Adapter)
 *
 * Upstash QStash implementation - platform-agnostic HTTP-based message queue.
 * Works on any platform (Netlify, Vercel, AWS, bare metal, etc.)
 *
 * Features:
 * - Configurable retry with exponential backoff
 * - Dead-letter queue via callbacks
 * - At-least-once delivery
 * - Scheduling support (delay, cron)
 * - Message deduplication
 *
 * Requires:
 * - QSTASH_TOKEN env var (from Upstash console)
 * - QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY for verification
 *
 * Queue ID format: The destination URL that QStash will POST to when delivering the message.
 *
 * Verification (verifyEvent), per Upstash's documented scheme and its
 * @upstash/qstash Receiver: every delivery carries an `Upstash-Signature`
 * header, a JWT signed HS256 with the current signing key (the next key
 * during rotation). Its claims are iss "Upstash", sub the destination URL,
 * exp / nbf / iat, and body = base64url(SHA-256(raw body)). A delivery is
 * accepted when the JWT verifies with either key, carries exp, nbf, sub and
 * body, is inside its exp / nbf window, names this request's URL as its sub
 * (the configured destinationUrl, else the event's rawUrl: a delivery
 * published to another endpoint cannot be replayed here), and its body claim
 * matches the body received (trailing '=' padding ignored, as the Receiver
 * does). A request whose URL cannot be determined is refused. With neither
 * key configured it is refused, except outside production with
 * FRIGG_QUEUE_ALLOW_UNSIGNED=true.
 */
const crypto = require('crypto');
const { QueueProvider } = require('../queue-provider');
const {
    allowsUnsignedMessages,
    readHeader,
    readRawBody,
} = require('../queue-message-auth');

const QSTASH_API_BASE = 'https://qstash.upstash.io/v2';

/**
 * @param {*} value
 * @returns {string|null} the URL in canonical form, or null when it is not one
 */
function normalizeUrl(value) {
    if (typeof value !== 'string' || value.length === 0) return null;
    try {
        return new URL(value).href;
    } catch (_) {
        return null;
    }
}

class QStashQueueProvider extends QueueProvider {
    constructor(options = {}) {
        super();
        this.token =
            options.token || process.env.QSTASH_TOKEN;
        this.retries =
            options.retries !== undefined ? options.retries : 3;
        this.currentSigningKey = options.currentSigningKey;
        this.nextSigningKey = options.nextSigningKey;
        // The URL QStash delivers to. When unset, the JWT's sub is compared
        // with the request's own URL (event.rawUrl, set by Netlify).
        this.destinationUrl = options.destinationUrl;
        this.env = options.env || process.env;
        this.clockToleranceSeconds = options.clockToleranceSeconds || 0;
        // verifyEvent() proves an HTTP delivery came from QStash.
        this.verifiesHttpDelivery = true;
    }

    // Read per call: secrets may reach the environment after construction.
    _signingKeys() {
        return [
            this.currentSigningKey || this.env.QSTASH_CURRENT_SIGNING_KEY,
            this.nextSigningKey || this.env.QSTASH_NEXT_SIGNING_KEY,
        ].filter((key) => typeof key === 'string' && key.length > 0);
    }

    /**
     * Verify the Upstash-Signature JWT of a QStash delivery.
     *
     * @param {Object} event - Lambda-shaped HTTP event
     * @returns {Promise<{ ok: boolean, reason?: string, unsigned?: boolean }>}
     */
    async verifyEvent(event) {
        const keys = this._signingKeys();
        if (keys.length === 0) {
            return allowsUnsignedMessages(this.env)
                ? { ok: true, unsigned: true }
                : { ok: false, reason: 'signing_keys_not_configured' };
        }
        const token = readHeader(event, 'upstash-signature');
        if (!token) return { ok: false, reason: 'missing_signature' };
        const body = readRawBody(event);
        if (body === null) return { ok: false, reason: 'missing_body' };

        const jose = require('jose');
        let payload;
        for (const key of keys) {
            try {
                ({ payload } = await jose.jwtVerify(token, new TextEncoder().encode(key), {
                    issuer: 'Upstash',
                    algorithms: ['HS256'],
                    requiredClaims: ['exp', 'nbf', 'sub', 'body'],
                    clockTolerance: this.clockToleranceSeconds,
                }));
                break;
            } catch (_) {
                // try the next key
            }
        }
        if (!payload) return { ok: false, reason: 'invalid_signature' };

        const requestUrl = normalizeUrl(this.destinationUrl || event?.rawUrl);
        if (!requestUrl) return { ok: false, reason: 'missing_request_url' };
        if (normalizeUrl(payload.sub) !== requestUrl) {
            return { ok: false, reason: 'invalid_subject' };
        }
        const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('base64url');
        const claimed = typeof payload.body === 'string' ? payload.body.replace(/=+$/, '') : '';
        if (claimed !== bodyHash.replace(/=+$/, '')) {
            return { ok: false, reason: 'body_mismatch' };
        }
        return { ok: true };
    }

    /**
     * Send a message via QStash.
     *
     * @param {Object} message - Message payload
     * @param {string} queueId - Destination URL that QStash will POST to
     */
    async send(message, queueId) {
        if (!this.token) {
            throw new Error(
                'QSTASH_TOKEN is required. Get one at https://console.upstash.com'
            );
        }

        const headers = {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': String(this.retries),
        };

        const response = await fetch(
            `${QSTASH_API_BASE}/publish/${queueId}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(message),
            }
        );

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'unknown');
            throw new Error(
                `QStash publish failed: ${response.status} ${response.statusText} - ${errorBody}`
            );
        }

        return response.json();
    }

    /**
     * Send batch of messages via QStash batch API.
     */
    async batchSend(batch, queueId) {
        const entries = batch ?? [];
        if (!this.token) {
            throw new Error(
                'QSTASH_TOKEN is required. Get one at https://console.upstash.com'
            );
        }

        const messages = entries.map((entry) => ({
            destination: queueId,
            body: JSON.stringify(entry),
            headers: { 'Content-Type': 'application/json' },
            retries: this.retries,
        }));

        const response = await fetch(`${QSTASH_API_BASE}/batch`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'unknown');
            throw new Error(
                `QStash batch publish failed: ${response.status} - ${errorBody}`
            );
        }

        return response.json();
    }

    /**
     * Parse QStash webhook delivery event.
     * QStash POSTs the message body directly to the destination URL.
     */
    parseEvent(event) {
        const raw = readRawBody(event);
        const body = raw !== null ? JSON.parse(raw) : event.body;

        // QStash delivers a single message per invocation
        return [body];
    }
}

module.exports = { QStashQueueProvider };
