const {
    TelemetryExporterInterface,
} = require('./telemetry-exporter-interface');

/**
 * OTLP/HTTP exporter to a configured endpoint (+ optional headers). With no
 * endpoint the OTel SDK falls back to the standard `OTEL_EXPORTER_OTLP_ENDPOINT`
 * env var, so `url` is left unset in that case.
 */
class OtlpExporter extends TelemetryExporterInterface {
    constructor({ endpoint, headers } = {}) {
        super();
        this.endpoint = endpoint;
        this.headers = headers;
    }

    build() {
        const {
            OTLPTraceExporter,
        } = require('@opentelemetry/exporter-trace-otlp-http');
        const {
            OTLPMetricExporter,
        } = require('@opentelemetry/exporter-metrics-otlp-http');
        return {
            traceExporter: new OTLPTraceExporter(this._options('/v1/traces')),
            metricExporter: new OTLPMetricExporter(this._options('/v1/metrics')),
        };
    }

    _options(path) {
        return {
            ...(this.endpoint ? { url: joinPath(this.endpoint, path) } : {}),
            ...(this.headers ? { headers: this.headers } : {}),
        };
    }
}

function joinPath(base, path) {
    return `${String(base).replace(/\/$/, '')}${path}`;
}

module.exports = { OtlpExporter };
