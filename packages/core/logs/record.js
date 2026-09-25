const { LEVELS } = require('./levels');
const { serializeValue, serializeError, isError } = require('./serialize');
const { isPlainObject } = require('./context');
const {
    RESOURCE_KEYS,
    DROPPED_KEYS_FIELD,
    OWNED_KEYS,
    RESERVED_KEYS,
    PAYLOAD_KEYS,
} = require('./contract-keys');

const MAX_RECORD_BYTES = 16 * 1024;
const DEFAULT_LOGGER_NAME = 'frigg.unknown';

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const key of Object.keys(value)) deepFreeze(value[key]);
        Object.freeze(value);
    }
    return value;
}

function readFields(source) {
    const result = {};
    if (!source || typeof source !== 'object') return result;
    let keys;
    try {
        keys = Object.keys(source);
    } catch {
        return result;
    }
    for (const key of keys) {
        try {
            result[key] = source[key];
        } catch {
            result[key] = '[Getter threw]';
        }
    }
    return result;
}

// Returns the message text. An Error message is serialized once; when the
// call site has no `error`, that result becomes the record's `error`.
function buildMessage(message, callSite) {
    if (typeof message === 'string') {
        return { text: serializeValue(message) };
    }
    if (message === undefined || message === null) return { text: '' };
    if (isError(message)) {
        const error = serializeError(message);
        const text = typeof error?.message === 'string' ? error.message : '';
        if (callSite.error !== undefined) return { text };
        callSite.error = message;
        return { text, error };
    }
    if (callSite.value === undefined) callSite.value = message;
    return { text: '[non-string message]' };
}

const INVOCATION_KEY = 'invocation';

// A boundary adds request detail to the scope's invocation; scope keys win.
function extendInvocation(scoped, detail) {
    const merged = { ...scoped };
    for (const key of Object.keys(detail)) {
        if (!(key in merged)) merged[key] = detail[key];
    }
    return merged;
}

function traceFields(spanContext) {
    if (
        !spanContext ||
        typeof spanContext.traceId !== 'string' ||
        typeof spanContext.spanId !== 'string'
    ) {
        return {};
    }
    const flags = Number(spanContext.traceFlags) || 0;
    return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: (flags & 0xff).toString(16).padStart(2, '0'),
    };
}

function sameValue(a, b) {
    if (a === b) return true;
    return (
        typeof a === 'object' &&
        typeof b === 'object' &&
        JSON.stringify(a) === JSON.stringify(b)
    );
}

function byteLength(record) {
    return Buffer.byteLength(JSON.stringify(record));
}

function isDroppedKey(key, dropPayloads) {
    return (
        OWNED_KEYS.has(key) ||
        RESERVED_KEYS.has(key) ||
        (dropPayloads && PAYLOAD_KEYS.has(key))
    );
}

// Filters and serializes one source. `error` is serialized on its own, once
// (or taken from `preSerializedError`), and never walked by serializeValue.
function prepareSource(source, dropPayloads, preSerializedError) {
    const accepted = {};
    const keys = [];
    const dropped = [];
    let rawError;
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined || value === null) continue;
        if (isDroppedKey(key, dropPayloads)) {
            dropped.push(key);
            continue;
        }
        keys.push(key);
        if (key === 'error') rawError = value;
        else accepted[key] = value;
    }
    // One pass over the object, so key rules (denied keys, digests,
    // headers, OAuth shapes) apply to top-level fields too.
    const safe = serializeValue(accepted);
    const entries = [];
    for (const key of keys) {
        const value =
            key === 'error'
                ? preSerializedError ?? serializeError(rawError)
                : safe?.[key];
        if (value !== undefined && value !== null) entries.push([key, value]);
    }
    return { entries, dropped };
}

// The scope object is frozen and shared by every record of one scope.
const preparedScopes = new WeakMap();

function prepareScope(scope, dropPayloads) {
    if (!scope || typeof scope !== 'object') return { entries: [], dropped: [] };
    let byLevel = preparedScopes.get(scope);
    if (!byLevel) {
        byLevel = {};
        preparedScopes.set(scope, byLevel);
    }
    const slot = dropPayloads ? 'info' : 'debug';
    if (!byLevel[slot]) byLevel[slot] = prepareSource(scope, dropPayloads);
    return byLevel[slot];
}

function buildRecord({
    level,
    logger,
    message,
    fields,
    bindings,
    scope,
    spanContext,
    resource = {},
    now = new Date(),
} = {}) {
    const dropPayloads = LEVELS[level] >= LEVELS.INFO;
    // log.error('msg', err): own props of an Error (axios config, request) must not become fields.
    const callSite = readFields(isError(fields) ? { error: fields } : fields);
    const built = buildMessage(message, callSite);
    const record = {
        timestamp: now.toISOString(),
        level,
        message: built.text,
        logger: typeof logger === 'string' && logger ? logger : DEFAULT_LOGGER_NAME,
    };
    for (const key of RESOURCE_KEYS) {
        if (typeof resource[key] === 'string' && resource[key]) {
            record[key] = resource[key];
        }
    }
    Object.assign(record, traceFields(spanContext));

    const dropped = new Set();
    const callSiteKeys = [];
    const place = ({ entries, dropped: droppedHere }, isCallSite) => {
        for (const key of droppedHere) dropped.add(key);
        for (const [key, value] of entries) {
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                if (
                    key === INVOCATION_KEY &&
                    isPlainObject(record[key]) &&
                    isPlainObject(value)
                ) {
                    record[key] = extendInvocation(record[key], value);
                } else if (!sameValue(record[key], value)) {
                    // A repeat of the winning value is no conflict.
                    dropped.add(key);
                }
                continue;
            }
            record[key] = value;
            if (isCallSite) callSiteKeys.push(key);
        }
    };
    place(prepareScope(scope, dropPayloads), false);
    place(prepareSource(bindings || {}, dropPayloads), false);
    place(prepareSource(callSite, dropPayloads, built.error), true);

    const setDroppedKeys = () => {
        delete record[DROPPED_KEYS_FIELD];
        if (dropped.size) record[DROPPED_KEYS_FIELD] = [...dropped];
    };
    setDroppedKeys();
    let size = byteLength(record);

    if (size > MAX_RECORD_BYTES) {
        const bySize = callSiteKeys
            .filter((key) => key !== 'error')
            .map((key) => [key, Buffer.byteLength(JSON.stringify(record[key]))])
            .sort((a, b) => b[1] - a[1]);
        for (const [key] of bySize) {
            delete record[key];
            dropped.add(key);
            setDroppedKeys();
            size = byteLength(record);
            if (size <= MAX_RECORD_BYTES) break;
        }
    }
    for (const part of ['stack', 'cause']) {
        if (
            size > MAX_RECORD_BYTES &&
            record.error &&
            typeof record.error === 'object' &&
            record.error[part] !== undefined
        ) {
            const { [part]: _removed, ...rest } = record.error;
            record.error = rest;
            size = byteLength(record);
        }
    }

    return deepFreeze(record);
}

module.exports = {
    buildRecord,
    deepFreeze,
    MAX_RECORD_BYTES,
    RESERVED_KEYS,
    PAYLOAD_KEYS,
    DEFAULT_LOGGER_NAME,
};
