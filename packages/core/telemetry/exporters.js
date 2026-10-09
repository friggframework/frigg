// Telemetry exporters — build the OTel { traceExporter, metricExporter } pair
// for one destination. OTel SDK packages are require'd lazily INSIDE the
// builders, so loading this module pulls in zero OTel (cold-start invariant).

function joinPath(base, path) {
    return `${String(base).replace(/\/$/, '')}${path}`;
}

/**
 * Normalize a descriptor to an OTLP target { endpoint, headers }, folding in
 * vendor presets (Honeycomb). Pure — no OTel required — so it stays unit-testable.
 */
function otlpTarget({ type, endpoint, headers, apiKey } = {}) {
    if (type === 'honeycomb') {
        return {
            endpoint: endpoint || 'https://api.honeycomb.io',
            headers: apiKey ? { 'x-honeycomb-team': apiKey } : headers,
        };
    }
    return { endpoint, headers };
}

function buildOtlp(descriptor = {}) {
    const {
        OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http');
    const {
        OTLPMetricExporter,
    } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { endpoint, headers } = otlpTarget(descriptor);
    // With no endpoint the SDK falls back to OTEL_EXPORTER_OTLP_ENDPOINT, so
    // leave `url` unset in that case.
    const options = (path) => ({
        ...(endpoint ? { url: joinPath(endpoint, path) } : {}),
        ...(headers ? { headers } : {}),
    });
    return {
        traceExporter: new OTLPTraceExporter(options('/v1/traces')),
        metricExporter: new OTLPMetricExporter(options('/v1/metrics')),
    };
}

function buildConsole() {
    const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
    const { ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
    return {
        traceExporter: new ConsoleSpanExporter(),
        metricExporter: new ConsoleMetricExporter(),
    };
}

// type → builder. Add a destination = add one entry. Datadog ingests OTLP/HTTP
// natively; Honeycomb is an OTLP preset resolved in otlpTarget.
const EXPORTERS = {
    otlp: buildOtlp,
    datadog: buildOtlp,
    honeycomb: buildOtlp,
    console: buildConsole,
};

/**
 * Resolve a telemetry descriptor to its { traceExporter, metricExporter } pair.
 * Pre-built instances (tests / advanced adopters) win over `type`; an unknown or
 * absent type falls back to plain OTLP (which itself falls back to the standard
 * OTLP env var). The own-property check keeps a `type` matching an
 * Object.prototype member ('constructor', 'toString', …) from resolving an
 * inherited key.
 */
function resolveExporter(descriptor = {}) {
    if (descriptor.traceExporter || descriptor.metricExporter) {
        return {
            traceExporter: descriptor.traceExporter || null,
            metricExporter: descriptor.metricExporter || null,
        };
    }
    const build = Object.prototype.hasOwnProperty.call(
        EXPORTERS,
        descriptor.type
    )
        ? EXPORTERS[descriptor.type]
        : buildOtlp;
    return build(descriptor);
}

module.exports = { resolveExporter, EXPORTERS, otlpTarget, joinPath };
