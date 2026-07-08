const { OtlpExporter } = require('./otlp-exporter');

/**
 * Datadog ingests OTLP/HTTP directly, so today it behaves exactly like
 * `OtlpExporter` (endpoint + headers). It is its own class so Datadog-specific
 * presets (e.g. a default `DD-API-KEY` header) can be added later without
 * touching the OTLP exporter or the registry.
 */
class DatadogExporter extends OtlpExporter {}

module.exports = { DatadogExporter };
