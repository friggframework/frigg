const {
    isDeniedKey,
    isDigestKey,
    isOAuthCallbackShape,
    normalizeKey,
    redactUrl,
    scrubString,
} = require('./redact');

const MAX_DEPTH = 6;
const MAX_CAUSE_DEPTH = 3;
const MAX_STRING = 2048;
const MAX_AGGREGATE_ERRORS = 10;
const HEADER_KEYS = new Set(['headers', 'multivalueheaders', 'rawheaders']);

function attempt(fn, fallback) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

function cutString(value) {
    if (value.length <= MAX_STRING) return value;
    const suffix = `…[truncated:${value.length}]`;
    return value.slice(0, MAX_STRING - suffix.length) + suffix;
}

function cleanString(value, key) {
    return cutString(scrubString(value, { allowHex: isDigestKey(key) }));
}

function isError(value) {
    return attempt(
        () =>
            value instanceof Error ||
            Object.prototype.toString.call(value) === '[object Error]',
        false
    );
}

function isHeadersLike(value) {
    if (typeof Headers !== 'undefined' && value instanceof Headers) return true;
    return (
        !(value instanceof Map) &&
        typeof value.get === 'function' &&
        typeof value.has === 'function' &&
        typeof value.forEach === 'function' &&
        typeof value.entries === 'function'
    );
}

function headerNames(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return '[REDACTED]';
    if (value instanceof Map) return [...value.keys()].map(String);
    if (Array.isArray(value)) {
        if (value.every((entry) => typeof entry === 'string')) {
            return value.filter((_entry, i) => i % 2 === 0);
        }
        return value.every(Array.isArray)
            ? value.map((entry) => cleanString(String(entry[0])))
            : '[REDACTED]';
    }
    if (isHeadersLike(value)) {
        const names = [];
        value.forEach((_v, name) => names.push(String(name)));
        return names;
    }
    return Object.keys(value);
}

function walkObject(value, depth, seen) {
    const keys = Object.keys(value);
    const dropAll = isOAuthCallbackShape(keys);
    const out = {};
    for (const key of keys) {
        if (dropAll || isDeniedKey(key)) {
            out[key] = '[REDACTED]';
            continue;
        }
        let child;
        try {
            child = value[key];
        } catch {
            out[key] = '[Getter threw]';
            continue;
        }
        if (HEADER_KEYS.has(normalizeKey(key))) {
            out[key] = attempt(() => headerNames(child), '[Unserializable]');
            continue;
        }
        const result = walk(child, depth + 1, seen, key);
        if (result !== undefined) out[key] = result;
    }
    return out;
}

function walkContainer(value, depth, seen) {
    if (value instanceof Map) {
        const out = {};
        for (const [k, v] of value) {
            const key = String(k);
            if (isDeniedKey(key)) {
                out[key] = '[REDACTED]';
                continue;
            }
            const result = walk(v, depth + 1, seen, key);
            if (result !== undefined) out[key] = result;
        }
        return out;
    }
    if (value instanceof Set) {
        return [...value].map((v) => walk(v, depth + 1, seen) ?? null);
    }
    if (Array.isArray(value)) {
        return value.map((v) => walk(v, depth + 1, seen) ?? null);
    }
    if (isHeadersLike(value)) return headerNames(value);
    return walkObject(value, depth, seen);
}

function walkSpecial(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? 'Invalid Date'
            : value.toISOString();
    }
    if (value instanceof URL) return redactUrl(value);
    if (value instanceof URLSearchParams) {
        return [...value.keys()].map((k) => `${k}=REDACTED`).join('&');
    }
    if (Buffer.isBuffer(value)) return { type: 'Buffer', length: value.length };
    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor?.name ?? 'TypedArray',
            length: value.byteLength,
        };
    }
    if (value instanceof ArrayBuffer) {
        return { type: 'ArrayBuffer', length: value.byteLength };
    }
    if (value instanceof RegExp) return cleanString(String(value));
    if (
        (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') &&
        typeof value.toHexString === 'function'
    ) {
        return value.toHexString();
    }
    return undefined;
}

function walk(value, depth, seen, key) {
    switch (typeof value) {
        case 'string':
            return cleanString(value, key);
        case 'number':
            return Number.isFinite(value) ? value : String(value);
        case 'boolean':
            return value;
        case 'bigint':
            return value.toString();
        case 'undefined':
        case 'symbol':
        case 'function':
            return undefined;
        default:
            break;
    }
    if (value === null) return null;
    if (isError(value)) return serializeErrorAt(value, 0, new WeakSet());
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_DEPTH) return '[Depth]';
    try {
        const special = walkSpecial(value);
        if (special !== undefined) return special;
        seen.add(value);
        try {
            return walkContainer(value, depth, seen);
        } finally {
            seen.delete(value);
        }
    } catch {
        return '[Unserializable]';
    }
}

function serializeValue(value, { depth = 0 } = {}) {
    try {
        return walk(value, depth, new WeakSet());
    } catch {
        return '[Unserializable]';
    }
}

function errorType(err) {
    const ctorName = attempt(() => err.constructor?.name, undefined);
    const name = attempt(() => err.name, undefined);
    if (typeof ctorName === 'string' && ctorName && ctorName !== 'Error') {
        return ctorName;
    }
    if (typeof name === 'string' && name) return name;
    return ctorName || 'Error';
}

function lastParagraph(message) {
    const paragraphs = message
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
    return paragraphs[paragraphs.length - 1] ?? '';
}

function errorStatus(err) {
    const status = attempt(
        () => err.statusCode ?? err.status ?? err.response?.status,
        undefined
    );
    if (typeof status === 'number' && Number.isFinite(status)) return status;
    if (typeof status === 'string' && status) return cleanString(status);
    return undefined;
}

function errorCode(err) {
    const code = attempt(() => err.code, undefined);
    if (typeof code === 'number' && Number.isFinite(code)) return code;
    if (typeof code === 'string' && code) return cleanString(code);
    return undefined;
}

function errorStack(err, type, message) {
    const stack = attempt(() => err.stack, undefined);
    if (typeof stack !== 'string') return undefined;
    const frames = stack.split('\n').filter((line) => /^\s*at\s/.test(line));
    return cutString(
        [`${type}: ${message}`, ...frames.map((f) => scrubString(f))].join('\n')
    );
}

function nested(value, depth, seen) {
    if (depth > MAX_CAUSE_DEPTH) return '[Depth]';
    if (value !== null && typeof value === 'object' && seen.has(value)) {
        return '[Circular]';
    }
    return serializeErrorAt(value, depth, seen);
}

function nonErrorMessage(value) {
    if (value === null || typeof value !== 'object') {
        return cleanString(attempt(() => String(value), '[Unserializable]'));
    }
    const message = attempt(() => value.message, undefined);
    if (typeof message === 'string') return cleanString(message);
    return cutString(
        attempt(() => JSON.stringify(serializeValue(value)), '[Unserializable]')
    );
}

function serializeErrorAt(err, depth, seen) {
    if (!isError(err)) {
        return { type: 'NonError', message: nonErrorMessage(err) };
    }
    seen.add(err);
    const type = cutString(scrubString(errorType(err)));
    const rawMessage = attempt(() => err.message, '');
    let message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage);
    if (type.startsWith('PrismaClient')) message = lastParagraph(message);
    message = cleanString(message);

    const out = { type, message };
    const code = errorCode(err);
    if (code !== undefined) out.code = code;
    const status = errorStatus(err);
    if (status !== undefined) out.status = status;
    const stack = errorStack(err, type, message);
    if (stack !== undefined) out.stack = stack;

    const cause = attempt(() => err.cause, undefined);
    if (cause !== undefined && cause !== null) {
        out.cause = nested(cause, depth + 1, seen);
    }

    const errors = attempt(() => err.errors, undefined);
    if (type === 'AggregateError' && Array.isArray(errors)) {
        out.errors = errors
            .slice(0, MAX_AGGREGATE_ERRORS)
            .map((e) => nested(e, depth + 1, seen));
    }
    return out;
}

function serializeError(err) {
    try {
        return serializeErrorAt(err, 0, new WeakSet());
    } catch {
        return { type: 'Error', message: '[Unserializable]' };
    }
}

function toSanitizedSurrogate(err) {
    const serialized = serializeError(err);
    const surrogate = new Error(serialized.message);
    surrogate.name =
        serialized.type === 'NonError' ? 'Error' : serialized.type;
    surrogate.stack =
        serialized.stack ?? `${surrogate.name}: ${serialized.message}`;
    if (serialized.code !== undefined) surrogate.code = serialized.code;
    if (serialized.status !== undefined) {
        surrogate.statusCode = serialized.status;
    }
    return surrogate;
}

module.exports = {
    serializeValue,
    serializeError,
    toSanitizedSurrogate,
    MAX_DEPTH,
    MAX_CAUSE_DEPTH,
    MAX_STRING,
};
