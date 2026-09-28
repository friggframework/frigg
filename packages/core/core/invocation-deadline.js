const { AsyncLocalStorage } = require('node:async_hooks');

const STORE_KEY = Symbol.for('@friggframework/core.invocation-deadline');

function storage() {
    if (!globalThis[STORE_KEY]) {
        globalThis[STORE_KEY] = new AsyncLocalStorage();
    }
    return globalThis[STORE_KEY];
}

/**
 * Runs fn with the time the invocation ends, as epoch milliseconds. A nested
 * scope can shorten the deadline and never extend it. A deadline that is not
 * a finite number runs fn with no limit.
 */
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

/**
 * The end of a Lambda invocation, from its context. Undefined when the
 * context cannot tell.
 */
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

/**
 * Milliseconds left in the invocation. Infinity outside a deadline scope
 * (tests, `frigg start`, scripts).
 */
function remainingInvocationMs(now = Date.now()) {
    const store = storage().getStore();
    return store ? Math.max(0, store.deadlineAt - now) : Infinity;
}

module.exports = {
    deadlineFromContext,
    remainingInvocationMs,
    runWithInvocationDeadline,
};
