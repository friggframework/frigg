const { PassthroughExporter } = require('./passthrough-exporter');
const { ConsoleExporter } = require('./console-exporter');
const { OtlpExporter } = require('./otlp-exporter');
const { HoneycombExporter } = require('./honeycomb-exporter');
const { DatadogExporter } = require('./datadog-exporter');

// type → exporter adapter. Add a destination by adding a class + one entry.
const EXPORTERS = {
    console: ConsoleExporter,
    otlp: OtlpExporter,
    datadog: DatadogExporter,
    honeycomb: HoneycombExporter,
};

/**
 * Resolve the exporter adapter for a telemetry descriptor. Pre-built exporter
 * instances (tests / advanced adopters) win over `type`; an unknown or absent
 * type falls back to plain OTLP (which itself falls back to the standard OTLP
 * env var). Replaces the former switch-based factory with polymorphic adapters.
 *
 * @returns {import('./telemetry-exporter-interface').TelemetryExporterInterface}
 */
function resolveExporter(descriptor = {}) {
    if (descriptor.traceExporter || descriptor.metricExporter) {
        return new PassthroughExporter(descriptor);
    }
    // Own-property check so a `type` matching an Object.prototype member
    // ('constructor', 'toString', …) can't resolve an inherited key — unknown
    // types must fall through to plain OTLP.
    const Exporter = Object.prototype.hasOwnProperty.call(
        EXPORTERS,
        descriptor.type
    )
        ? EXPORTERS[descriptor.type]
        : OtlpExporter;
    return new Exporter(descriptor);
}

module.exports = { resolveExporter, EXPORTERS };
