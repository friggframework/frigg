/**
 * Builds OpenTelemetry span/metric exporters from an app-definition descriptor
 * (ADR-011 Decision 1). All OTel packages are lazy-`require`d here so the no-op
 * path (which never calls this) loads zero OTel modules.
 *
 * Supported descriptor `type`s:
 *   - 'console'            → ConsoleSpanExporter / ConsoleMetricExporter (local dev)
 *   - 'otlp'               → OTLP/HTTP to descriptor.endpoint (+ headers)
 *   - 'honeycomb'          → OTLP preset (api.honeycomb.io, x-honeycomb-team header)
 *   - 'datadog'            → OTLP preset (descriptor.endpoint required)
 *
 * A descriptor may also carry pre-built exporter instances
 * (`traceExporter` / `metricExporter`) — used by tests (in-memory exporters) and
 * advanced adopters. Instances win over `type`.
 *
 * @returns {{ traceExporter: object|null, metricExporter: object|null }}
 */
function buildExporters(descriptor = {}) {
    if (descriptor.traceExporter || descriptor.metricExporter) {
        return {
            traceExporter: descriptor.traceExporter || null,
            metricExporter: descriptor.metricExporter || null,
        };
    }

    const type = descriptor.type;

    if (type === 'console') {
        const {
            ConsoleSpanExporter,
        } = require('@opentelemetry/sdk-trace-base');
        const { ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
        return {
            traceExporter: new ConsoleSpanExporter(),
            metricExporter: new ConsoleMetricExporter(),
        };
    }

    const { endpoint, headers } = resolveOtlpTarget(descriptor);
    const {
        OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http');
    const {
        OTLPMetricExporter,
    } = require('@opentelemetry/exporter-metrics-otlp-http');

    // When no endpoint is set the exporters fall back to the standard
    // OTEL_EXPORTER_OTLP_ENDPOINT env var, so leave `url` undefined in that case.
    return {
        traceExporter: new OTLPTraceExporter({
            ...(endpoint ? { url: joinPath(endpoint, '/v1/traces') } : {}),
            ...(headers ? { headers } : {}),
        }),
        metricExporter: new OTLPMetricExporter({
            ...(endpoint ? { url: joinPath(endpoint, '/v1/metrics') } : {}),
            ...(headers ? { headers } : {}),
        }),
    };
}

/** Resolve endpoint + headers for OTLP and its vendor presets. */
function resolveOtlpTarget(descriptor) {
    if (descriptor.type === 'honeycomb') {
        return {
            endpoint: descriptor.endpoint || 'https://api.honeycomb.io',
            headers: descriptor.apiKey
                ? { 'x-honeycomb-team': descriptor.apiKey }
                : descriptor.headers,
        };
    }
    // 'otlp' and 'datadog' both use a plain OTLP endpoint + optional headers.
    return { endpoint: descriptor.endpoint, headers: descriptor.headers };
}

function joinPath(base, path) {
    return `${String(base).replace(/\/$/, '')}${path}`;
}

module.exports = { buildExporters };
