const { LEVELS } = require('./levels');
const { serializeValue, serializeError } = require('./serialize');

const MAX_RECORD_BYTES = 16 * 1024;
const REQUIRED_KEYS = ['timestamp', 'level', 'message', 'logger'];
const RESOURCE_KEYS = ['appName', 'stage'];
const TRACE_KEYS = ['trace_id', 'span_id', 'trace_flags'];
const DROPPED_KEYS_FIELD = 'droppedKeys';
const OWNED_KEYS = new Set([
    ...REQUIRED_KEYS,
    ...RESOURCE_KEYS,
    ...TRACE_KEYS,
    DROPPED_KEYS_FIELD,
]);
const RESERVED_KEYS = new Set([
    'tenantId',
    'type',
    'time',
    'record',
    'errorType',
    'errorMessage',
    'stackTrace',
    'service',
    'env',
    'host',
    'source',
    'status',
    'severity',
]);
const PAYLOAD_KEYS = new Set(['body', 'rawBody', 'payload', 'response']);
const DEFAULT_LOGGER_NAME = 'frigg.unknown';

function isError(value) {
    return (
        value instanceof Error ||
        Object.prototype.toString.call(value) === '[object Error]'
    );
}

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

function buildMessage(message, callSite) {
    if (typeof message === 'string') {
        return serializeValue(message);
    }
    if (message === undefined || message === null) return '';
    if (isError(message)) {
        const error = serializeError(message);
        if (callSite.error === undefined) callSite.error = message;
        return typeof error?.message === 'string' ? error.message : '';
    }
    if (callSite.value === undefined) callSite.value = message;
    return '[non-string message]';
}

const INVOCATION_KEY = 'invocation';

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        Object.getPrototypeOf(value) === Object.prototype
    );
}

// A boundary adds request detail to the scope's invocation; scope keys win.
function extendInvocation(scoped, detail, dropped) {
    const merged = { ...scoped };
    for (const [key, value] of Object.entries(detail)) {
        if (!Object.prototype.hasOwnProperty.call(scoped, key)) {
            merged[key] = value;
        } else if (JSON.stringify(scoped[key]) !== JSON.stringify(value)) {
            dropped.add(`${INVOCATION_KEY}.${key}`);
        }
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

function byteLength(record) {
    return Buffer.byteLength(JSON.stringify(record));
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
    const record = {
        timestamp: now.toISOString(),
        level,
        message: buildMessage(message, callSite),
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
    const place = (source, isCallSite) => {
        const accepted = {};
        for (const [key, value] of Object.entries(source)) {
            if (value === undefined || value === null) continue;
            if (
                OWNED_KEYS.has(key) ||
                RESERVED_KEYS.has(key) ||
                (dropPayloads && PAYLOAD_KEYS.has(key)) ||
                (Object.prototype.hasOwnProperty.call(record, key) &&
                    !canExtendInvocation(key, value))
            ) {
                dropped.add(key);
                continue;
            }
            accepted[key] = value;
        }
        // One pass over the object, so key rules (denied keys, digests,
        // headers, OAuth shapes) apply to top-level fields too.
        const safe = serializeValue(accepted);
        for (const key of Object.keys(accepted)) {
            const value =
                key === 'error' ? serializeError(accepted[key]) : safe?.[key];
            if (value === undefined || value === null) continue;
            if (key === INVOCATION_KEY && isPlainObject(record[key])) {
                record[key] = extendInvocation(record[key], value, dropped);
                continue;
            }
            record[key] = value;
            if (isCallSite) callSiteKeys.push(key);
        }
    };
    const canExtendInvocation = (key, value) =>
        key === INVOCATION_KEY &&
        isPlainObject(record[key]) &&
        isPlainObject(value);
    place(readFields(scope), false);
    place(readFields(bindings), false);
    place(callSite, true);

    const measure = () => {
        delete record[DROPPED_KEYS_FIELD];
        if (dropped.size) record[DROPPED_KEYS_FIELD] = [...dropped];
        return byteLength(record);
    };

    if (measure() > MAX_RECORD_BYTES) {
        const bySize = callSiteKeys
            .filter((key) => key !== 'error')
            .map((key) => [key, Buffer.byteLength(JSON.stringify(record[key]))])
            .sort((a, b) => b[1] - a[1]);
        for (const [key] of bySize) {
            delete record[key];
            dropped.add(key);
            if (measure() <= MAX_RECORD_BYTES) break;
        }
    }
    for (const part of ['stack', 'cause']) {
        if (
            record.error &&
            typeof record.error === 'object' &&
            record.error[part] !== undefined &&
            measure() > MAX_RECORD_BYTES
        ) {
            const { [part]: _removed, ...rest } = record.error;
            record.error = rest;
        }
    }
    measure();

    return deepFreeze(record);
}

module.exports = {
    buildRecord,
    MAX_RECORD_BYTES,
    RESERVED_KEYS,
    PAYLOAD_KEYS,
    DEFAULT_LOGGER_NAME,
};
