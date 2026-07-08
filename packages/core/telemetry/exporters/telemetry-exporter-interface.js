/**
 * Port for a telemetry exporter: builds the OTel trace + metric exporter
 * instances for one destination. Adapters (console, otlp, honeycomb, datadog, a
 * passthrough for pre-built instances) implement `build()`. OpenTelemetry SDK
 * packages are `require`d lazily inside `build()` so merely loading an adapter
 * pulls in no OTel modules.
 */
class TelemetryExporterInterface {
    /** @returns {{ traceExporter: object|null, metricExporter: object|null }} */
    build() {
        throw new Error(
            'build() must be implemented by a TelemetryExporter subclass'
        );
    }
}

module.exports = { TelemetryExporterInterface };
