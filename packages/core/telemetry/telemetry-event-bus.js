/**
 * TelemetryEventBus — the internal event stream telemetry flows onto
 * (ADR-011 Decision 6). Plugins/extensions and the built-in usage rollup
 * subscribe here; it is deliberately independent of OTel export (Decision 7),
 * so usage counters persist even when the OTel exporter is a no-op.
 *
 * This is intentionally a **synchronous** in-process fan-out (Frigg runs one
 * invocation per Lambda container): a plain subscriber list with per-subscriber
 * `try/catch` so a misbehaving subscriber can never break emission or its
 * siblings. No queue/backpressure machinery — emission volume is bounded by a
 * single invocation's work.
 *
 * ## Public event contract (semver-stable)
 * Event types and their payload shapes:
 *   - `'metric'` → `{ name: string, value: number, attributes: object, context?: object }`
 *   - `'event'`  → `{ name: string, attributes: object, context?: object }`
 * `attributes` are the bounded OTel metric labels. `context` (present when an
 * ambient telemetry context is active) carries the high-cardinality identifiers
 * — {integrationId, integrationType, userId, version, ...} plus per-call extras
 * like a request `url` — which the usage rollup reads for attribution. Those ids
 * NEVER appear in `attributes` (Cardinality note).
 */
function createTelemetryEventBus() {
    /** @type {Map<string, Set<Function>>} */
    const subscribers = new Map();

    function on(eventType, callback) {
        if (!subscribers.has(eventType)) {
            subscribers.set(eventType, new Set());
        }
        const set = subscribers.get(eventType);
        set.add(callback);
        return function off() {
            set.delete(callback);
        };
    }

    function emit(eventType, payload) {
        const set = subscribers.get(eventType);
        if (!set || set.size === 0) return;
        for (const callback of set) {
            try {
                callback(payload);
            } catch (error) {
                // A subscriber must never break emission or its siblings.
                console.warn(
                    `[Frigg][telemetry] subscriber for "${eventType}" threw: ${
                        error && error.message
                    }`
                );
            }
        }
    }

    return { on, emit };
}

module.exports = { createTelemetryEventBus };
