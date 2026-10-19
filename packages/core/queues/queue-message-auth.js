/**
 * Queue message authentication for HTTP-delivered queues.
 *
 * An SQS-triggered Lambda is invoked by AWS itself, so its events are trusted
 * by the transport. An HTTP-delivered queue (a Netlify Background Function,
 * a QStash destination) is a public URL: anyone who can reach it can post a
 * message. These helpers let the sending adapter prove a message came from
 * Frigg and let the receiving adapter check that proof before anything runs.
 *
 * Scheme (Frigg-signed messages):
 *   timestamp = whole seconds since the epoch, as a decimal string
 *   signature = 'v1=' + hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 * sent as the `x-frigg-queue-timestamp` and `x-frigg-queue-signature`
 * headers. The receiver recomputes the HMAC over the raw body it was given,
 * compares in constant time, and refuses a timestamp more than
 * MAX_MESSAGE_AGE_SECONDS away from its own clock (replay window).
 *
 * Fail closed: with no secret configured, a message is accepted unsigned only
 * when FRIGG_QUEUE_ALLOW_UNSIGNED=true AND the environment is not production
 * (isProductionEnvironment; a deployed function always is). Anything else is
 * refused.
 */
const crypto = require('crypto');
const { isDeployedRuntime } = require('../providers/runtime-detection');

const SIGNING_SECRET_ENV = 'FRIGG_QUEUE_SIGNING_SECRET';
const ALLOW_UNSIGNED_ENV = 'FRIGG_QUEUE_ALLOW_UNSIGNED';
const SIGNATURE_HEADER = 'x-frigg-queue-signature';
const TIMESTAMP_HEADER = 'x-frigg-queue-timestamp';
const SIGNATURE_VERSION = 'v1';
const MAX_MESSAGE_AGE_SECONDS = 5 * 60;

// Stages core already treats as non-production (database/prisma.js bypasses
// encryption for the same list).
const NON_PRODUCTION_STAGES = ['dev', 'test', 'local'];
const NON_PRODUCTION_NODE_ENVS = ['development', 'test'];

/**
 * Production unless the environment says otherwise: an unset STAGE and
 * NODE_ENV count as production, so a missing setting never opens the door.
 * A deployed function (AWS Lambda, or the active provider's platform such as
 * a Netlify Function: providers/runtime-detection) is production whatever
 * STAGE says, so a deployed `dev` stage cannot opt out of signatures.
 *
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
function isProductionEnvironment(env = process.env) {
    if (isDeployedRuntime(env)) return true;
    if (NON_PRODUCTION_STAGES.includes(env.STAGE)) return false;
    if (NON_PRODUCTION_NODE_ENVS.includes(env.NODE_ENV)) return false;
    if (env.NETLIFY_DEV === 'true') return false;
    return true;
}

/**
 * Unsigned messages are allowed only by an explicit opt-in outside production.
 *
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
function allowsUnsignedMessages(env = process.env) {
    return env[ALLOW_UNSIGNED_ENV] === 'true' && !isProductionEnvironment(env);
}

/**
 * @param {Object} [env=process.env]
 * @returns {string|undefined} the configured signing secret, if non-empty
 */
function readSigningSecret(env = process.env) {
    const secret = env[SIGNING_SECRET_ENV];
    return typeof secret === 'string' && secret.length > 0 ? secret : undefined;
}

function computeSignature(secret, timestamp, rawBody) {
    const mac = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
    return `${SIGNATURE_VERSION}=${mac}`;
}

/**
 * Sign a raw message body.
 *
 * @param {Object} params
 * @param {string} params.body - the exact string that will be sent
 * @param {string} params.secret
 * @param {number} [params.now] - milliseconds since the epoch (default Date.now())
 * @returns {{ [header: string]: string }} headers to add to the request
 */
function signQueueMessage({ body, secret, now = Date.now() }) {
    if (!secret) {
        throw new Error('A signing secret is required to sign a queue message');
    }
    const timestamp = String(Math.floor(now / 1000));
    return {
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: computeSignature(secret, timestamp, body),
    };
}

function constantTimeEqual(a, b) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on unequal lengths; the length of a v1 signature
    // is fixed, so comparing lengths first leaks nothing secret.
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

/**
 * Verify a Frigg-signed message.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.body - raw body as received
 * @param {string|undefined} params.timestamp - x-frigg-queue-timestamp
 * @param {string|undefined} params.signature - x-frigg-queue-signature
 * @param {string} params.secret
 * @param {number} [params.now] - milliseconds since the epoch
 * @param {number} [params.maxAgeSeconds]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function verifyQueueMessage({
    body,
    timestamp,
    signature,
    secret,
    now = Date.now(),
    maxAgeSeconds = MAX_MESSAGE_AGE_SECONDS,
}) {
    if (!secret) return { ok: false, reason: 'signing_secret_not_configured' };
    if (!signature || !timestamp) return { ok: false, reason: 'missing_signature' };
    if (typeof body !== 'string') return { ok: false, reason: 'missing_body' };
    if (!/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'invalid_timestamp' };

    const ageSeconds = Math.abs(Math.floor(now / 1000) - Number(timestamp));
    if (ageSeconds > maxAgeSeconds) return { ok: false, reason: 'stale_timestamp' };

    const expected = computeSignature(secret, timestamp, body);
    if (!constantTimeEqual(expected, signature)) {
        return { ok: false, reason: 'invalid_signature' };
    }
    return { ok: true };
}

/**
 * Case-insensitive header lookup over a Lambda/Netlify v1 event's headers.
 *
 * @param {Object} event
 * @param {string} name - lower-case header name
 * @returns {string|undefined}
 */
function readHeader(event, name) {
    const headers = event?.headers || {};
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name) {
            return Array.isArray(value) ? value[0] : value;
        }
    }
    return undefined;
}

/**
 * The raw request body exactly as signed: a string body as is, a base64
 * body decoded to its UTF-8 text. An already-parsed object body cannot be
 * verified (its bytes are gone), so it reads as absent.
 *
 * @param {Object} event
 * @returns {string|null}
 */
function readRawBody(event) {
    if (typeof event?.body !== 'string') return null;
    if (event.isBase64Encoded) {
        return Buffer.from(event.body, 'base64').toString('utf8');
    }
    return event.body;
}

module.exports = {
    SIGNING_SECRET_ENV,
    ALLOW_UNSIGNED_ENV,
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    MAX_MESSAGE_AGE_SECONDS,
    isProductionEnvironment,
    allowsUnsignedMessages,
    readSigningSecret,
    signQueueMessage,
    verifyQueueMessage,
    readHeader,
    readRawBody,
};
