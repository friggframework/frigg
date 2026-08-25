/**
 * Minimal, dependency-free, in-process fixed-window rate limiter for the
 * unauthenticated login route (ADR-034 §Security requirement 3).
 *
 * Two independent windows are enforced per call:
 *   - per key (typically the client IP), and
 *   - a global counter across all keys.
 *
 * Purpose is to blunt use of the endpoint as a key-validation oracle against the
 * upstream provider. In a multi-instance serverless deployment each container
 * holds its own counters, so this is a floor, not a global guarantee — pair it
 * with an infra-level limit (API Gateway / WAF) for a hard ceiling. It is
 * deliberately self-contained and unit-testable.
 *
 * @class FixedWindowRateLimiter
 */
class FixedWindowRateLimiter {
    /**
     * @param {Object} [options]
     * @param {number} [options.windowMs=60000] - Window length in milliseconds.
     * @param {number} [options.maxPerKey=10] - Max attempts per key per window.
     * @param {number} [options.maxGlobal=1000] - Max attempts across all keys per window.
     * @param {() => number} [options.now] - Clock (injectable for tests).
     */
    constructor({
        windowMs = 60000,
        maxPerKey = 10,
        maxGlobal = 1000,
        now = () => Date.now(),
    } = {}) {
        this.windowMs = windowMs;
        this.maxPerKey = maxPerKey;
        this.maxGlobal = maxGlobal;
        this.now = now;
        this.buckets = new Map(); // key -> { count, windowStart }
        this.global = { count: 0, windowStart: 0 };
    }

    _rollGlobal(ts) {
        if (ts - this.global.windowStart >= this.windowMs) {
            this.global = { count: 0, windowStart: ts };
        }
    }

    _rollKey(bucket, ts) {
        if (!bucket || ts - bucket.windowStart >= this.windowMs) {
            return { count: 0, windowStart: ts };
        }
        return bucket;
    }

    /**
     * Record an attempt for `key` and report whether it is allowed.
     * @param {string} key - Identity for the per-key window (e.g. client IP).
     * @returns {{ allowed: boolean, scope?: 'key'|'global' }}
     */
    check(key) {
        const ts = this.now();
        const bucketKey = key || 'unknown';

        this._rollGlobal(ts);
        if (this.global.count >= this.maxGlobal) {
            return { allowed: false, scope: 'global' };
        }

        let bucket = this._rollKey(this.buckets.get(bucketKey), ts);
        if (bucket.count >= this.maxPerKey) {
            this.buckets.set(bucketKey, bucket);
            return { allowed: false, scope: 'key' };
        }

        bucket = { count: bucket.count + 1, windowStart: bucket.windowStart };
        this.buckets.set(bucketKey, bucket);
        this.global = {
            count: this.global.count + 1,
            windowStart: this.global.windowStart,
        };

        // Opportunistic cleanup so the Map cannot grow unbounded across windows.
        if (this.buckets.size > 10000) {
            for (const [k, b] of this.buckets) {
                if (ts - b.windowStart >= this.windowMs) this.buckets.delete(k);
            }
        }

        return { allowed: true };
    }
}

module.exports = { FixedWindowRateLimiter };
