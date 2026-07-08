const { OtlpExporter } = require('./otlp-exporter');

/** Honeycomb: an OTLP preset — default endpoint + `x-honeycomb-team` from apiKey. */
class HoneycombExporter extends OtlpExporter {
    constructor({ endpoint, apiKey, headers } = {}) {
        super({
            endpoint: endpoint || 'https://api.honeycomb.io',
            headers: apiKey ? { 'x-honeycomb-team': apiKey } : headers,
        });
    }
}

module.exports = { HoneycombExporter };
