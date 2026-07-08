const { NoOpTelemetry } = require('./no-op-telemetry');
const { createTelemetryEventBus } = require('./telemetry-event-bus');

/**
 * Determine whether an exporter descriptor means "emit nothing".
 * Absent config or `{ type: 'none' }` (or `'noop'`) → no-op.
 */
function isNoOpExporter(exporter) {
    if (!exporter) return true;
    const type = exporter.type;
    return !type || type === 'none' || type === 'noop';
}

/**
 * Create the vendor-neutral telemetry service — the adapter selector. Integration
 * code uses the returned instance (`this.telemetry`) and never imports a backend
 * SDK. With no exporter configured it returns `NoOpTelemetry` (loads zero OTel);
 * a real exporter lazily constructs `OtelTelemetry`.
 *
 * @param {object} [options]
 * @param {object} [options.exporter] Exporter descriptor, e.g. `{ type: 'otlp', endpoint }`.
 * @param {object} [options.resource] Resource attributes, e.g. `{ service, stage }`.
 * @param {number} [options.sampleRatio] Parent-based sampling ratio (0..1).
 * @param {object} [options.bus] Event bus to reuse (defaults to a fresh one).
 */
function createTelemetry(options = {}) {
    // The internal event stream is always on and independent of OTel export:
    // the usage rollup + plugin taps must work even when
    // the OTel exporter is a no-op. The bus is pure JS, so this does not load
    // any OTel module on the no-op path.
    const bus = options.bus || createTelemetryEventBus();

    if (isNoOpExporter(options.exporter)) {
        return new NoOpTelemetry({ bus });
    }

    // Lazy-required so the no-op path never loads the OTel SDK.
    const { OtelTelemetry } = require('./otel-telemetry');
    return new OtelTelemetry({ ...options, bus });
}

module.exports = { createTelemetry, isNoOpExporter };
