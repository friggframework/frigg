const { createTelemetryEventBus } = require('./telemetry-event-bus');
const {
    runWithTelemetryContext,
    mergeTelemetryContext,
} = require('./telemetry-context');

/**
 * No-op telemetry adapter: the default when no exporter is configured, so
 * telemetry "rides for free". Imports **zero** OpenTelemetry packages (guarded by
 * a require-graph test) — the no-op path never loads the OTel SDK, protecting
 * Lambda cold-start. The internal event bus is still active: `count`/`event` are
 * mirrored onto it so the durable usage rollup + plugin taps work even with
 * export off (emitting to a bus with no subscribers is cheap).
 */
class NoOpTelemetry {
    constructor({ bus = createTelemetryEventBus() } = {}) {
        this._bus = bus;
    }

    count(name, value = 1, attributes = {}, context) {
        const merged = mergeTelemetryContext(context);
        const payload = { name, value, attributes };
        if (merged) payload.context = merged;
        this._bus.emit('metric', payload);
    }

    event(name, attributes = {}, context) {
        const merged = mergeTelemetryContext(context);
        const payload = { name, attributes };
        if (merged) payload.context = merged;
        this._bus.emit('event', payload);
    }

    async span(_name, fn) {
        return typeof fn === 'function' ? fn() : undefined;
    }

    startSpan() {
        return {
            setAttributes() {},
            setAttribute() {},
            recordException() {},
            setStatus() {},
            end() {},
        };
    }

    async withContext(context, fn) {
        return runWithTelemetryContext(context, () =>
            typeof fn === 'function' ? fn() : undefined
        );
    }

    on(eventType, callback) {
        return this._bus.on(eventType, callback);
    }

    async forceFlush() {}

    async shutdown() {}

    isEnabled() {
        return false;
    }
}

module.exports = { NoOpTelemetry };
