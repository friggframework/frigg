const { FetchError } = require('./fetch-error');

function resolveTiming({ hint, waitMs, now }) {
    if (waitMs !== undefined) {
        return { waitMs, retryAt: new Date(now + waitMs) };
    }
    if (hint?.retryAt) {
        const retryAt = new Date(hint.retryAt);
        if (!Number.isNaN(retryAt.getTime())) {
            return { waitMs: Math.max(0, retryAt.getTime() - now), retryAt };
        }
    }
    const fallbackWaitMs = hint?.waitMs ?? 0;
    return { waitMs: fallbackWaitMs, retryAt: new Date(now + fallbackWaitMs) };
}

class RateLimitError extends FetchError {
    constructor({
        hint,
        waitMs,
        module,
        scopeKey,
        now = Date.now(),
        ...fetchErrorArgs
    } = {}) {
        super(fetchErrorArgs);

        const timing = resolveTiming({ hint, waitMs, now });
        this.isRateLimited = true;
        this.waitMs = timing.waitMs;
        this.retryAt = timing.retryAt;
        this.reason = hint?.reason ?? 'unknown';
        this.policy = hint?.policy;
        this.source = hint?.source ?? 'unknown';
        this.module = module;
        this.scopeKey = scopeKey;
    }
}

module.exports = { RateLimitError };
