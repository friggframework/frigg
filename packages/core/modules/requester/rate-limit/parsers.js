const MAX_HINT_WAIT_MS = 366 * 24 * 60 * 60 * 1000;

const SECONDS_PATTERN = /^\d+(?:\.\d+)?$/;
const HAS_LETTER = /[A-Za-z]/;
const EPOCH_SECONDS_MIN = 1e9;
const EPOCH_MILLISECONDS_MIN = 1e12;

const RESET_HEADERS = [
    'x-ratelimit-reset',
    'ratelimit-reset',
    'x-rate-limit-reset',
];
const REMAINING_HEADERS = [
    'x-ratelimit-remaining',
    'ratelimit-remaining',
    'x-rate-limit-remaining',
];

const isMissing = (value) => value === undefined || value === null;

function readEntries(headers, wanted) {
    for (const entry of headers) {
        if (Array.isArray(entry) && String(entry[0]).toLowerCase() === wanted) {
            return entry[1];
        }
    }
    return undefined;
}

function readKeys(headers, wanted) {
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === wanted) return headers[key];
    }
    return undefined;
}

/**
 * Reads one header from a Headers-like object, a Map, an entries array or a
 * plain object. The name match is case-insensitive.
 * @returns {string|undefined}
 */
function headerValue(headers, name) {
    if (!headers || typeof headers !== 'object') return undefined;
    const wanted = name.toLowerCase();
    const hasGet = typeof headers.get === 'function';

    let value;
    if (hasGet) {
        value = headers.get(name);
        if (isMissing(value)) value = headers.get(wanted);
    }
    if (isMissing(value) && typeof headers[Symbol.iterator] === 'function') {
        value = readEntries(headers, wanted);
    }
    if (isMissing(value) && !hasGet && !Array.isArray(headers)) {
        value = readKeys(headers, wanted);
    }
    if (Array.isArray(value)) value = value[0];
    if (isMissing(value)) return undefined;

    const text = String(value).trim();
    return text === '' ? undefined : text;
}

function definedOnly(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) result[key] = value;
    }
    return result;
}

/**
 * Builds a hint from a wait in ms. Returns null for a wait that is not a
 * finite number in [0, MAX_HINT_WAIT_MS].
 */
function hintFromWait(waitMs, now, { source = 'header', ...extra } = {}) {
    if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > MAX_HINT_WAIT_MS) {
        return null;
    }
    return {
        waitMs,
        retryAt: new Date(now + waitMs),
        ...definedOnly(extra),
        source,
    };
}

/**
 * Builds a hint from an absolute time. A time in the past waits 0 ms.
 */
function hintFromRetryAt(retryAt, now, { source = 'header', ...extra } = {}) {
    const at = retryAt instanceof Date ? retryAt.getTime() : NaN;
    if (Number.isNaN(at)) return null;
    const waitMs = Math.max(0, at - now);
    if (waitMs > MAX_HINT_WAIT_MS) return null;
    return { waitMs, retryAt: new Date(at), ...definedOnly(extra), source };
}

function parseDate(text) {
    if (!HAS_LETTER.test(text)) return null;
    const at = Date.parse(text);
    return Number.isNaN(at) ? null : new Date(at);
}

/**
 * Retry-After: delta seconds, an HTTP-date or an ISO timestamp.
 */
function parseRetryAfter(value, { now = Date.now() } = {}) {
    if (isMissing(value)) return null;
    const text = String(value).trim();
    if (text === '') return null;
    if (SECONDS_PATTERN.test(text))
        return hintFromWait(Number(text) * 1000, now);
    const date = parseDate(text);
    return date ? hintFromRetryAt(date, now) : null;
}

function numberOrUndefined(text) {
    if (text === undefined) return undefined;
    const number = Number(text);
    return Number.isFinite(number) ? number : undefined;
}

function firstHeader(headers, names) {
    for (const name of names) {
        const value = headerValue(headers, name);
        if (value !== undefined) return value;
    }
    return undefined;
}

function parseResetValue(text, now, extra) {
    if (SECONDS_PATTERN.test(text)) {
        const number = Number(text);
        if (number >= EPOCH_MILLISECONDS_MIN) {
            return hintFromRetryAt(new Date(number), now, extra);
        }
        if (number >= EPOCH_SECONDS_MIN) {
            return hintFromRetryAt(new Date(number * 1000), now, extra);
        }
        return hintFromWait(number * 1000, now, extra);
    }
    const date = parseDate(text);
    return date ? hintFromRetryAt(date, now, extra) : null;
}

/**
 * X-RateLimit-Reset and the other reset headers. The magnitude tells the
 * unit: epoch milliseconds, epoch seconds, or delta seconds.
 */
function parseResetHeaders(headers, { now = Date.now() } = {}) {
    const remaining = numberOrUndefined(
        firstHeader(headers, REMAINING_HEADERS)
    );
    const extra = { remaining };

    const after = headerValue(headers, 'x-ratelimit-reset-after');
    if (after !== undefined && SECONDS_PATTERN.test(after)) {
        return hintFromWait(Number(after) * 1000, now, extra);
    }

    for (const name of RESET_HEADERS) {
        const value = headerValue(headers, name);
        if (value === undefined) continue;
        const hint = parseResetValue(value, now, extra);
        if (hint) return hint;
    }
    return null;
}

function splitList(text) {
    const items = [];
    let current = '';
    let quoted = false;
    for (const char of text) {
        if (char === '"') quoted = !quoted;
        if (char === ',' && !quoted) {
            items.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    items.push(current);
    return items.map((item) => item.trim()).filter(Boolean);
}

function parseStructuredItem(item) {
    const [head, ...params] = item.split(';').map((part) => part.trim());
    const values = {};
    for (const param of params) {
        const [key, raw] = param.split('=').map((part) => part.trim());
        if (key) values[key] = numberOrUndefined(raw);
    }
    const name = head.replace(/^"|"$/g, '');
    return {
        name: name || undefined,
        remaining: values.r,
        waitSeconds: values.t,
    };
}

function pickStructured(items) {
    const usable = items.filter(
        (item) => Number.isFinite(item.waitSeconds) && item.waitSeconds >= 0
    );
    usable.sort((a, b) => {
        const byRemaining =
            (a.remaining ?? Infinity) - (b.remaining ?? Infinity);
        if (byRemaining !== 0 && !Number.isNaN(byRemaining)) return byRemaining;
        return b.waitSeconds - a.waitSeconds;
    });
    return usable[0];
}

function readKeyValue(text, key) {
    const match = new RegExp(
        `(?:^|[,;\\s])${key}\\s*=\\s*([^,;\\s]+)`,
        'i'
    ).exec(text);
    return match ? match[1] : undefined;
}

/**
 * The IETF RateLimit field: the key=value form (limit=, remaining=, reset=)
 * and the structured-field form ("name";r=0;t=12). The list form picks the
 * policy with the fewest remaining calls, then the longest wait.
 */
function parseIetfRateLimit(headers, { now = Date.now() } = {}) {
    const raw = headerValue(headers, 'ratelimit');
    if (raw === undefined) return null;
    const policyHeader = headerValue(headers, 'ratelimit-policy');

    if (/;\s*t\s*=/.test(raw)) {
        const chosen = pickStructured(splitList(raw).map(parseStructuredItem));
        if (!chosen) return null;
        return hintFromWait(chosen.waitSeconds * 1000, now, {
            remaining: chosen.remaining,
            policy: chosen.name ?? policyHeader,
        });
    }

    const reset = readKeyValue(raw, 'reset');
    if (reset === undefined || !SECONDS_PATTERN.test(reset)) return null;
    return hintFromWait(Number(reset) * 1000, now, {
        remaining: numberOrUndefined(readKeyValue(raw, 'remaining')),
        policy: policyHeader,
    });
}

const BUILT_IN_PARSERS = {
    retryAfter: (headers, { now } = {}) =>
        parseRetryAfter(headerValue(headers, 'retry-after'), { now }),
    resetHeaders: parseResetHeaders,
    ietf: parseIetfRateLimit,
};

module.exports = {
    BUILT_IN_PARSERS,
    MAX_HINT_WAIT_MS,
    headerValue,
    hintFromRetryAt,
    hintFromWait,
    parseIetfRateLimit,
    parseResetHeaders,
    parseRetryAfter,
};
