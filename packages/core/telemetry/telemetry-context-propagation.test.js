const { createNoOpTelemetry } = require('./no-op-telemetry');
const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
const { createTelemetry } = require('./telemetry-service');

describe('ambient telemetry context propagation (ADR-011 attribution fix)', () => {
    it('attaches the handler context to a deep emission that passes only its own fields (no-op path)', async () => {
        const telemetry = createNoOpTelemetry();
        const metrics = [];
        telemetry.on('metric', (m) => metrics.push(m));

        await telemetry.withContext(
            {
                integrationId: 'int_1',
                integrationType: 'hubspot',
                userId: 'u1',
            },
            async () => {
                // Simulates the API-module requester deep inside a handler: it
                // knows the url but NOT the integration ids.
                telemetry.count(
                    'frigg.apimodule.requests',
                    1,
                    { module: 'hubspotApi', method: 'GET', status: 'ok' },
                    { url: 'https://api.hubapi.com/x' }
                );
            }
        );

        const m = metrics.find((x) => x.name === 'frigg.apimodule.requests');
        expect(m.context).toMatchObject({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            url: 'https://api.hubapi.com/x',
        });
    });

    it('does the same on the OTel-backed path', async () => {
        const telemetry = createTelemetry({
            exporter: {
                type: 'otlp',
                traceExporter: new InMemorySpanExporter(),
            },
        });
        const metrics = [];
        telemetry.on('metric', (m) => metrics.push(m));

        await telemetry.withContext(
            { integrationId: 'int_9', integrationType: 'salesforce' },
            async () => {
                telemetry.count('frigg.apimodule.requests', 1, {}, {});
            }
        );

        const m = metrics.find((x) => x.name === 'frigg.apimodule.requests');
        expect(m.context).toMatchObject({
            integrationId: 'int_9',
            integrationType: 'salesforce',
        });
    });

    it('leaves emissions outside any withContext scope uncontextualized', () => {
        const telemetry = createNoOpTelemetry();
        const metrics = [];
        telemetry.on('metric', (m) => metrics.push(m));

        telemetry.count('m', 1, {});

        expect(metrics[0].context).toBeUndefined();
    });
});
