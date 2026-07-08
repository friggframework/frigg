const {
    TelemetryExporterInterface,
} = require('./telemetry-exporter-interface');

/** Console span/metric exporters — local-dev visibility, no network. */
class ConsoleExporter extends TelemetryExporterInterface {
    build() {
        const {
            ConsoleSpanExporter,
        } = require('@opentelemetry/sdk-trace-base');
        const { ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
        return {
            traceExporter: new ConsoleSpanExporter(),
            metricExporter: new ConsoleMetricExporter(),
        };
    }
}

module.exports = { ConsoleExporter };
