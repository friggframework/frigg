const { AsyncLocalStorage } = require('node:async_hooks');

const STORE_KEY = Symbol.for('@friggframework/core.invocation-deadline');

function storage() {
    if (!globalThis[STORE_KEY]) {
        globalThis[STORE_KEY] = new AsyncLocalStorage();
    }
    return globalThis[STORE_KEY];
}

const MAX_IN_PROCESS_WAIT_MS = Object.freeze({
    outsideInvocation: 300_000,
    http: 10_000,
    queueWorker: 60_000,
});

const validDeadline = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const validWait = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;

const lower = (outer, next) =>
    outer === undefined
        ? next
        : next === undefined
        ? outer
        : Math.min(outer, next);

function runWithInvocationDeadline(
    { deadlineAt, maxInProcessWaitMs } = {},
    fn
) {
    const outer = storage().getStore();
    const effectiveDeadline = lower(
        outer?.deadlineAt,
        validDeadline(deadlineAt)
    );
    const effectiveWait = lower(
        outer?.maxInProcessWaitMs,
        validWait(maxInProcessWaitMs)
    );
    if (effectiveDeadline === undefined && effectiveWait === undefined) {
        return fn();
    }
    return storage().run(
        Object.freeze({
            deadlineAt: effectiveDeadline ?? Infinity,
            maxInProcessWaitMs: effectiveWait,
        }),
        fn
    );
}

function remainingTimeMs(context) {
    try {
        const remaining = context?.getRemainingTimeInMillis?.();
        return typeof remaining === 'number' ? remaining : Infinity;
    } catch (_) {
        return Infinity;
    }
}

function deadlineFromContext(context) {
    const remaining = remainingTimeMs(context);
    return Number.isFinite(remaining) ? Date.now() + remaining : undefined;
}

function remainingInvocationMs(now = Date.now()) {
    const store = storage().getStore();
    return store ? Math.max(0, store.deadlineAt - now) : Infinity;
}

function invocationMaxInProcessWaitMs() {
    return (
        storage().getStore()?.maxInProcessWaitMs ??
        MAX_IN_PROCESS_WAIT_MS.outsideInvocation
    );
}

module.exports = {
    MAX_IN_PROCESS_WAIT_MS,
    deadlineFromContext,
    invocationMaxInProcessWaitMs,
    remainingInvocationMs,
    remainingTimeMs,
    runWithInvocationDeadline,
};
