const { NoOpTelemetry } = require('./no-op-telemetry');
const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
const { createTelemetry } = require('./telemetry-service');

describe('ambient telemetry context propagation (ADR-011 attribution fix)', () => {
    it('attaches the handler context to a deep emission that passes only its own fields (no-op path)', async () => {
        const telemetry = new NoOpTelemetry();
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
        const telemetry = new NoOpTelemetry();
        const metrics = [];
        telemetry.on('metric', (m) => metrics.push(m));

        telemetry.count('m', 1, {});

        expect(metrics[0].context).toBeUndefined();
    });
});

describe('OTel baggage from withContext (ADR-048 §7)', () => {
    const otelApi = require('@opentelemetry/api');
    const { runInContext } = require('../logs/context');

    it('holds only primitive ids: no logger keys, no requestId, no [object Object]', async () => {
        const telemetry = createTelemetry({
            exporter: { type: 'otlp', traceExporter: new InMemorySpanExporter() },
        });
        let entries;
        await runInContext({ log: { requestId: 'r-1' } }, () =>
            telemetry.withContext(
                {
                    integrationId: 'int_1',
                    version: 2,
                    log: { requestId: 'r-2' },
                    nested: { a: 1 },
                    fn: () => {},
                },
                async () => {
                    const baggage = otelApi.propagation.getBaggage(otelApi.context.active());
                    entries = Object.fromEntries(
                        baggage.getAllEntries().map(([key, entry]) => [key, entry.value])
                    );
                }
            )
        );
        expect(entries).toEqual({ integrationId: 'int_1', version: '2' });
        expect(JSON.stringify(entries)).not.toContain('[object Object]');
    });
});
