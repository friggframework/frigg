const { createTelemetryEventBus } = require('./telemetry-event-bus');
const {
    runWithTelemetryContext,
    mergeTelemetryContext,
} = require('./telemetry-context');

/**
 * No-op telemetry implementation.
 *
 * This is the default when no OTel exporter is configured, so telemetry "rides
 * for free" (ADR-011): integration code can call `this.telemetry.*`
 * unconditionally and it costs nothing on the OTel side. Critically, this module
 * imports **zero** OpenTelemetry packages — the no-op path never loads the OTel
 * SDK (guarded by a require-graph test), protecting Lambda cold-start.
 *
 * The internal event bus is still active here (Decision 7): `count`/`event` are
 * mirrored onto it so the durable usage rollup and plugin/extension taps work
 * even with OTel export disabled. Emitting to a bus with no subscribers is a
 * cheap no-op.
 *
 * @param {object} [options]
 * @param {object} [options.bus] Event bus to mirror emissions onto.
 */
function createNoOpTelemetry({ bus = createTelemetryEventBus() } = {}) {
    const noop = {
        count(name, value = 1, attributes = {}, context) {
            const merged = mergeTelemetryContext(context);
            const payload = { name, value, attributes };
            if (merged) payload.context = merged;
            bus.emit('metric', payload);
        },
        event(name, attributes = {}, context) {
            const merged = mergeTelemetryContext(context);
            const payload = { name, attributes };
            if (merged) payload.context = merged;
            bus.emit('event', payload);
        },
        async span(_name, fn) {
            return typeof fn === 'function' ? fn() : undefined;
        },
        startSpan() {
            return {
                setAttributes() {},
                setAttribute() {},
                recordException() {},
                setStatus() {},
                end() {},
            };
        },
        async withContext(context, fn) {
            return runWithTelemetryContext(context, () =>
                typeof fn === 'function' ? fn() : undefined
            );
        },
        on(eventType, callback) {
            return bus.on(eventType, callback);
        },
        async forceFlush() {},
        isEnabled() {
            return false;
        },
    };
    return noop;
}

module.exports = { createNoOpTelemetry };
