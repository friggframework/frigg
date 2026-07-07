/**
 * Declarative plugin/extension telemetry taps (ADR-011 Decision 6).
 *
 * The built-in usage rollup and North Star derivation subscribe to the telemetry
 * bus in framework code; this lets an ADOPTER subscribe declaratively from the
 * app definition (`Definition.telemetry.subscribers: [...]`) — forward to a
 * custom sink, compute aggregates, persist counters — without writing wiring code.
 *
 * A subscriber is one of:
 *   - a **factory** `fn(telemetry)` that registers itself (e.g. calls
 *     `telemetry.on('metric', ...)`) and MAY return an unsubscribe function; or
 *   - a **declarative object** `{ event?: 'metric'|'event', handler(payload, eventType) }`
 *     — when `event` is omitted the handler receives both metric and event payloads.
 *
 * Every attach and every handler invocation is guarded so a misbehaving
 * subscriber can never break emission, its siblings, or a handler (mirrors the
 * bus's own per-subscriber isolation).
 *
 * @param {object} params
 * @param {object} params.telemetry Telemetry service exposing `on(eventType, cb)`.
 * @param {Array<Function|{event?: string, handler: Function}>} [params.subscribers]
 * @returns {Array<Function>} unsubscribe functions for the wired subscribers.
 */
const EVENT_TYPES = ['metric', 'event'];

function wireTelemetrySubscribers({ telemetry, subscribers = [] } = {}) {
    if (
        !telemetry ||
        typeof telemetry.on !== 'function' ||
        !Array.isArray(subscribers)
    ) {
        return [];
    }

    const unsubscribes = [];

    for (const subscriber of subscribers) {
        try {
            if (typeof subscriber === 'function') {
                const off = subscriber(telemetry);
                if (typeof off === 'function') unsubscribes.push(off);
                continue;
            }

            if (subscriber && typeof subscriber.handler === 'function') {
                const events = subscriber.event
                    ? [subscriber.event]
                    : EVENT_TYPES;
                for (const eventType of events) {
                    const off = telemetry.on(eventType, (payload) => {
                        try {
                            subscriber.handler(payload, eventType);
                        } catch (error) {
                            console.warn(
                                `[Frigg][telemetry] subscriber handler for "${eventType}" threw: ${
                                    error && error.message
                                }`
                            );
                        }
                    });
                    if (typeof off === 'function') unsubscribes.push(off);
                }
            }
        } catch (error) {
            // A single bad subscriber must never break wiring of the others.
            console.warn(
                `[Frigg][telemetry] failed to wire a telemetry subscriber: ${
                    error && error.message
                }`
            );
        }
    }

    return unsubscribes;
}

module.exports = { wireTelemetrySubscribers };
