const { AsyncLocalStorage } = require('node:async_hooks');

const STORE_KEY = Symbol.for('@friggframework/core.invocation-deadline');

function storage() {
    if (!globalThis[STORE_KEY]) {
        globalThis[STORE_KEY] = new AsyncLocalStorage();
    }
    return globalThis[STORE_KEY];
}

function runWithInvocationDeadline(deadlineAt, fn) {
    if (typeof deadlineAt !== 'number' || !Number.isFinite(deadlineAt)) {
        return fn();
    }
    const outer = storage().getStore();
    const effective = outer
        ? Math.min(outer.deadlineAt, deadlineAt)
        : deadlineAt;
    return storage().run(Object.freeze({ deadlineAt: effective }), fn);
}

function deadlineFromContext(context) {
    try {
        const remaining = context?.getRemainingTimeInMillis?.();
        return typeof remaining === 'number' && Number.isFinite(remaining)
            ? Date.now() + remaining
            : undefined;
    } catch {
        return undefined;
    }
}

function remainingInvocationMs(now = Date.now()) {
    const store = storage().getStore();
    return store ? Math.max(0, store.deadlineAt - now) : Infinity;
}

module.exports = {
    deadlineFromContext,
    remainingInvocationMs,
    runWithInvocationDeadline,
};
