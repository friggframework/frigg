/**
 * Telemetry service port. Application code uses this contract via `this.telemetry`;
 * adapters implement it — `OtelTelemetry` (real OTLP export) and `NoOpTelemetry`
 * (default, zero OTel). Kept free of OpenTelemetry imports so the no-op path
 * loads no OTel modules.
 *
 * `count`/`event` mirror onto the internal event bus (for the usage rollup +
 * plugin taps); `span`/`startSpan`/`withContext` handle tracing + context
 * propagation; `forceFlush`/`shutdown` drain before the Lambda container freezes.
 */
class TelemetryServiceInterface {
    count(/* name, value, attributes, context */) {
        throw new Error('count must be implemented by subclass');
    }

    event(/* name, attributes, context */) {
        throw new Error('event must be implemented by subclass');
    }

    startSpan(/* name, options */) {
        throw new Error('startSpan must be implemented by subclass');
    }

    async span(/* name, fn, options */) {
        throw new Error('span must be implemented by subclass');
    }

    async withContext(/* attributes, fn */) {
        throw new Error('withContext must be implemented by subclass');
    }

    on(/* eventType, callback */) {
        throw new Error('on must be implemented by subclass');
    }

    async forceFlush() {
        throw new Error('forceFlush must be implemented by subclass');
    }

    async shutdown() {
        throw new Error('shutdown must be implemented by subclass');
    }

    isEnabled() {
        throw new Error('isEnabled must be implemented by subclass');
    }
}

module.exports = { TelemetryServiceInterface };
