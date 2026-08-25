const util = require('util');

// Except in some outlier circumstances, for example steam or event error handlers, this should be the only place that calls `console.*`.  That way, this file can be modified to log everything properly on a variety of platforms because all the logging code is here in one place.
/* eslint-disable no-console */

const logs = [];
let flushCalled = false;

/**
 * Keys whose values must never reach the logs. Matched case-insensitively.
 * These are the credential-bearing fields a request body / headers can carry —
 * the apiKey-login body (`{ apiKey }`), the friggToken body (`{ password }`),
 * OAuth material, and Authorization headers. Buffered debug output (and the
 * verbose `DEBUG_VERBOSE=1` path) is dumped verbatim on any 5xx, so a raw secret
 * in `event.body` would otherwise land in CloudWatch (ADR-034 §4).
 * @constant {Set<string>}
 */
const SENSITIVE_KEYS = new Set([
    'apikey',
    'api_key',
    'password',
    'token',
    'authorization',
    'refresh_token',
    'access_token',
]);

const REDACTED = '[REDACTED]';
// Bound recursion and body-parse cost so a pathological event can never hang or
// blow the stack inside the logger. The logger must never throw.
const MAX_REDACT_DEPTH = 8;
const MAX_BODY_PARSE_LENGTH = 100000;

function isSensitiveKey(key) {
    return typeof key === 'string' && SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Substring/regex fallback for a request body we could not (or should not)
 * JSON-parse: a non-JSON body, a form-urlencoded body, or one too large to parse
 * cheaply. Masks `"key":"value"` (JSON-ish) and `key=value` (form) shapes for the
 * denylisted keys. Best-effort — never throws.
 */
function redactBodyStringFallback(body) {
    let out = body;
    for (const key of SENSITIVE_KEYS) {
        // JSON-ish:  "apiKey": "secret"  ->  "apiKey":"[REDACTED]"
        out = out.replace(
            new RegExp(`("${key}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'gi'),
            `$1"${REDACTED}"`
        );
        // Form-urlencoded:  apiKey=secret  ->  apiKey=[REDACTED]
        out = out.replace(
            new RegExp(`(${key}=)[^&\\s]*`, 'gi'),
            `$1${REDACTED}`
        );
    }
    return out;
}

/**
 * Redact a serialized request `body` string. JSON bodies are parsed, deep-redacted
 * and re-serialized; non-JSON / oversized bodies fall back to pattern masking.
 * Never throws.
 */
function redactBodyString(body) {
    if (body.length <= MAX_BODY_PARSE_LENGTH) {
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object') {
                return JSON.stringify(redactValue(parsed, 0, new Set()));
            }
        } catch (_) {
            // Not JSON — fall through to pattern masking below.
        }
    }
    return redactBodyStringFallback(body);
}

/**
 * Deep-clone `value`, masking any denylisted key anywhere in the structure and
 * redacting an embedded `body` string (the Lambda/API-Gateway convention).
 * Returns a NEW object so the caller's data is never mutated; circular refs and
 * excessive depth are handled defensively. Never throws (guarded by the public
 * `redactSensitive`).
 */
function redactValue(value, depth, seen) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (depth > MAX_REDACT_DEPTH || seen.has(value)) {
        return value;
    }
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((v) => redactValue(v, depth + 1, seen));
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (isSensitiveKey(k)) {
            out[k] = REDACTED;
        } else if (k.toLowerCase() === 'body' && typeof v === 'string') {
            out[k] = redactBodyString(v);
        } else {
            out[k] = redactValue(v, depth + 1, seen);
        }
    }
    return out;
}

/**
 * Framework-wide redaction applied to anything buffered for logging. Strips
 * credential-bearing fields from objects (e.g. a buffered Lambda event) before
 * they are serialized. Non-object arguments (the event name, plain strings) pass
 * through untouched. Guaranteed not to throw.
 * @param {*} value
 * @returns {*}
 */
function redactSensitive(value) {
    try {
        return redactValue(value, 0, new Set());
    } catch (_) {
        // A logger must never break the request it is trying to describe.
        return value;
    }
}

function debug(...messages) {
    if (messages.length) {
        const date = new Date();
        const text = util.format.apply(null, messages);

        if (process.env.DEBUG_VERBOSE === '1') {
            console.debug(date, text);
        } else {
            logs.push({ date, text });
        }
    }
}

function initDebugLog(...initMessages) {
    flushCalled = false;

    // Hacky but fast way to empty an array.
    logs.length = 0;

    // Redact credential-bearing fields (e.g. the login request body buffered in
    // the Lambda event) BEFORE they are serialized and buffered. This is the one
    // choke point every handler passes its raw event through, so masking here
    // protects both the buffered dump and the DEBUG_VERBOSE=1 immediate path.
    debug(...initMessages.map(redactSensitive));
}

function flushDebugLog(error) {
    if (flushCalled) {
        console.debug(
            'Another error was encountered while handling the same request or event!  All debug messages are included again in this output as well.'
        );
    }

    flushCalled = true;

    // Output unless in verbose mode.  In verbose mode, these will already have been output so we don't want to output the messages twice.
    if (process.env.DEBUG_VERBOSE !== '1') {
        if (logs?.length > 0) {
            for (const { date, text } of logs) {
                console.debug(date, text);
            }
        }
    }

    if (!error) {
        error = new Error('flushDebugLog called with empty error');
    }

    console.error(error);

    let { cause: parentError } = error;

    while (parentError) {
        console.error('(Caused By)-------------------------');
        console.error(parentError);
        parentError = parentError.cause;
    }
}

module.exports = {
    debug,
    initDebugLog,
    flushDebugLog,
    redactSensitive,
    SENSITIVE_KEYS,
};
