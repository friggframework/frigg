const {
    BUILT_IN_PARSERS,
    hintFromRetryAt,
    hintFromWait,
} = require('./parsers');

const DEFAULT_PARSERS = ['retryAfter', 'resetHeaders', 'ietf'];
const DEFAULT_MAX_IN_PROCESS_WAIT_MS = 300_000;
const MIN_HINTED_WAIT_MS = 1_000;
const JITTER_MAX_MS = 1_000;
const JITTER_RATIO = 0.1;

const REASONS = new Set([
    'burst',
    'daily',
    'monthly',
    'concurrency',
    'unknown',
]);
const CLASSIFY_SOURCES = new Set(['header', 'body', 'static']);
const SCOPES = new Set(['credential', 'entity', 'app']);

const normalizedPolicies = new WeakSet();
const policiesByClass = new WeakMap();

const isObject = (value) => value !== null && typeof value === 'object';

function isPlainObject(value) {
    if (!isObject(value) || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function definedOnly(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) result[key] = value;
    }
    return result;
}

function readParsers(raw, owner) {
    if (!Array.isArray(raw.parsers)) return [...DEFAULT_PARSERS];
    for (const name of raw.parsers) {
        if (!Object.hasOwn(BUILT_IN_PARSERS, name)) {
            throw new TypeError(
                `${owner}.rateLimit.parsers: unknown parser "${String(
                    name
                )}"; known: ${Object.keys(BUILT_IN_PARSERS).join(', ')}`
            );
        }
    }
    return [...raw.parsers];
}

function normalizePolicy(raw, owner) {
    if (!isPlainObject(raw)) return undefined;

    const policy = {
        scope:
            SCOPES.has(raw.scope) || typeof raw.scope === 'function'
                ? raw.scope
                : 'entity',
        parsers: readParsers(raw, owner),
    };
    if (typeof raw.classify === 'function') {
        policy.classify = (signal) => raw.classify(signal);
    }
    for (const key of ['minRetryAfterMs', 'maxInProcessWaitMs']) {
        if (Number.isFinite(raw[key]) && raw[key] >= 0) policy[key] = raw[key];
    }
    if (Number.isInteger(raw.maxConcurrency) && raw.maxConcurrency > 0) {
        policy.maxConcurrency = raw.maxConcurrency;
    }
    if (Array.isArray(raw.windows)) policy.windows = raw.windows;
    if (isPlainObject(raw.userHints)) policy.userHints = raw.userHints;

    normalizedPolicies.add(policy);
    return policy;
}

function readRateLimitPolicy(ctor) {
    if (typeof ctor !== 'function') return undefined;
    if (policiesByClass.has(ctor)) return policiesByClass.get(ctor);
    const policy = normalizePolicy(ctor.rateLimit, ctor.name || 'Requester');
    policiesByClass.set(ctor, policy);
    return policy;
}

function asPolicy(value) {
    if (!isObject(value)) return undefined;
    if (normalizedPolicies.has(value)) return value;
    return normalizePolicy(value, 'policy');
}

function computeScopeKey(policy, requester) {
    const label = requester?._telemetryModuleLabel?.() ?? 'unknown';
    const scope = policy?.scope ?? 'entity';
    const delegate = requester?.delegate;

    if (scope === 'app') return `${label}:app`;
    if (scope === 'entity') {
        const id = delegate?.entity?.id;
        return id === undefined || id === null
            ? undefined
            : `${label}:entity:${id}`;
    }
    if (scope === 'credential') {
        const credential = delegate?.credential;
        const id =
            credential?.id ??
            (typeof credential === 'string' ? credential : undefined);
        return id === undefined || id === null
            ? undefined
            : `${label}:credential:${id}`;
    }
    if (typeof scope === 'function') {
        try {
            const value = scope(requester);
            return value === undefined || value === null
                ? undefined
                : `${label}:custom:${String(value)}`;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function normalizeClassified(raw, now) {
    if (!isObject(raw)) return null;

    const extra = {
        reason: REASONS.has(raw.reason) ? raw.reason : 'unknown',
        policy: typeof raw.policy === 'string' ? raw.policy : undefined,
        remaining: Number.isFinite(raw.remaining) ? raw.remaining : undefined,
        source: CLASSIFY_SOURCES.has(raw.source) ? raw.source : 'body',
    };

    let hint = null;
    if (raw.retryAt !== undefined && raw.retryAt !== null) {
        const date =
            raw.retryAt instanceof Date ? raw.retryAt : new Date(raw.retryAt);
        hint = hintFromRetryAt(date, now, extra);
    }
    if (!hint && Number.isFinite(raw.waitMs)) {
        hint = hintFromWait(raw.waitMs, now, extra);
    }
    return {
        reason: extra.reason,
        policy: extra.policy,
        remaining: extra.remaining,
        hint,
    };
}

function runClassify(policy, signal, now, onClassifyError) {
    if (typeof policy?.classify !== 'function') return null;
    let raw;
    try {
        raw = policy.classify({
            status: signal.status,
            headers: signal.headers,
            body: signal.body,
        });
    } catch (error) {
        if (!onClassifyError) throw error;
        onClassifyError(error);
        return null;
    }
    return normalizeClassified(raw, now);
}

function parsedHint(policy, headers, now) {
    for (const name of policy?.parsers ?? DEFAULT_PARSERS) {
        const hint = BUILT_IN_PARSERS[name](headers, { now });
        if (hint) return hint;
    }
    return null;
}

function staticHint(policy, reason, now) {
    const window = policy?.windows?.find(
        (candidate) =>
            candidate &&
            candidate.name === reason &&
            Number.isFinite(candidate.perMs) &&
            candidate.perMs > 0
    );
    const waitMs = Math.max(window?.perMs ?? 0, policy?.minRetryAfterMs ?? 0);
    return waitMs > 0 ? hintFromWait(waitMs, now, { source: 'static' }) : null;
}

function withClassified(hint, classified) {
    return {
        ...hint,
        reason: classified?.reason ?? 'unknown',
        ...definedOnly({
            policy: classified?.policy ?? hint.policy,
            remaining: classified?.remaining ?? hint.remaining,
        }),
    };
}

function resolveCandidates(policy, signal, { now, onClassifyError }) {
    const classified = runClassify(policy, signal, now, onClassifyError);
    if (signal.status !== 429 && !classified) return { hint: null, classified };
    if (classified?.hint) return { hint: classified.hint, classified };

    const parsed = parsedHint(policy, signal.headers, now);
    if (parsed) return { hint: withClassified(parsed, classified), classified };

    const fromPolicy = staticHint(policy, classified?.reason, now);
    if (fromPolicy) {
        return { hint: withClassified(fromPolicy, classified), classified };
    }
    return { hint: null, classified };
}

function classifyRateLimit(policy, signal, options = {}) {
    const { now = Date.now(), onClassifyError } = options;
    return resolveCandidates(asPolicy(policy), signal, { now, onClassifyError })
        .hint;
}

function resolveRateLimitHint(policy, signal, options = {}) {
    const {
        attempt = 0,
        backOff = [],
        now = Date.now(),
        onClassifyError,
    } = options;
    const { hint, classified } = resolveCandidates(asPolicy(policy), signal, {
        now,
        onClassifyError,
    });
    if (hint) return hint;
    if (signal.status !== 429 && !classified) return null;

    const waitMs =
        attempt < backOff.length ? Number(backOff[attempt]) * 1000 || 0 : 0;
    return {
        waitMs,
        retryAt: new Date(now + waitMs),
        reason: classified?.reason ?? 'unknown',
        ...definedOnly({
            policy: classified?.policy,
            remaining: classified?.remaining,
        }),
        source: 'backoff',
    };
}

function computeWaitMs({ hint, policy, budgetMs, random = Math.random }) {
    const base = Math.max(
        hint.waitMs,
        policy?.minRetryAfterMs ?? 0,
        MIN_HINTED_WAIT_MS
    );
    if (base > budgetMs) return { waitMs: base, fits: false };

    const jitter = Math.floor(
        random() * Math.min(JITTER_MAX_MS, base * JITTER_RATIO)
    );
    return { waitMs: Math.min(base + jitter, budgetMs), fits: true };
}

function inProcessBudgetMs({
    policy,
    requestTimeoutMs = 0,
    remainingMs = Infinity,
    waitedMs = 0,
} = {}) {
    const cap = policy?.maxInProcessWaitMs ?? DEFAULT_MAX_IN_PROCESS_WAIT_MS;
    return Math.max(
        0,
        Math.min(cap - waitedMs, remainingMs - (requestTimeoutMs || 0))
    );
}

module.exports = {
    DEFAULT_MAX_IN_PROCESS_WAIT_MS,
    DEFAULT_PARSERS,
    JITTER_MAX_MS,
    MIN_HINTED_WAIT_MS,
    classifyRateLimit,
    computeScopeKey,
    computeWaitMs,
    inProcessBudgetMs,
    readRateLimitPolicy,
    resolveRateLimitHint,
};
