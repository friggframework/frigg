const {
    TelemetryExporterInterface,
} = require('./telemetry-exporter-interface');

/**
 * Adopter/test-supplied exporter instances, used as-is (e.g. in-memory exporters
 * in tests, or an advanced adopter wiring its own OTel exporter). Pre-built
 * instances win over a `type`.
 */
class PassthroughExporter extends TelemetryExporterInterface {
    constructor({ traceExporter = null, metricExporter = null } = {}) {
        super();
        this.traceExporter = traceExporter;
        this.metricExporter = metricExporter;
    }

    build() {
        return {
            traceExporter: this.traceExporter,
            metricExporter: this.metricExporter,
        };
    }
}

module.exports = { PassthroughExporter };
