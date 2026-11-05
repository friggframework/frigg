const { NoOpTelemetry } = require('./no-op-telemetry');
const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
const {
    InMemoryMetricExporter,
    AggregationTemporality,
} = require('@opentelemetry/sdk-metrics');
const { createTelemetry } = require('./telemetry-service');
const { instrumentHandler } = require('./instrument-handler');
const { bindTelemetryContext } = require('./bind-telemetry-context');

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
            exporter: {
                type: 'otlp',
                traceExporter: new InMemorySpanExporter(),
            },
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
                    const baggage = otelApi.propagation.getBaggage(
                        otelApi.context.active()
                    );
                    entries = Object.fromEntries(
                        baggage
                            .getAllEntries()
                            .map(([key, entry]) => [key, entry.value])
                    );
                }
            )
        );
        expect(entries).toEqual({ integrationId: 'int_1', version: '2' });
        expect(JSON.stringify(entries)).not.toContain('[object Object]');
    });
});

describe('baggage → span attributes (ADR-011 §2 / D-SCHEM-3)', () => {
    const CTX = {
        integrationId: 'int_123',
        userId: 'usr_456',
        integrationType: 'hubspot',
        version: '1.2.0',
    };
    const EXPECTED_SPAN_ATTRS = {
        'frigg.integration_id': 'int_123',
        'frigg.user_id': 'usr_456',
        integration_type: 'hubspot',
        'frigg.version': '1.2.0',
    };
    const FORBIDDEN_METRIC_KEYS = [
        'frigg.user_id',
        'userId',
        'frigg.integration_id',
        'integrationId',
    ];

    function buildInMemoryTelemetry() {
        const traceExporter = new InMemorySpanExporter();
        const metricExporter = new InMemoryMetricExporter(
            AggregationTemporality.CUMULATIVE
        );
        const telemetry = createTelemetry({
            exporter: { type: 'otlp', traceExporter, metricExporter },
            resource: { service: 'test-app', stage: 'test' },
        });
        return { telemetry, traceExporter, metricExporter };
    }

    it('stamps frigg.* attribution onto parent handler and nested child spans', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();
        const bound = bindTelemetryContext(telemetry, () => CTX);

        await instrumentHandler(
            bound,
            { event: 'SYNC_CONTACTS', eventType: 'USER_ACTION' },
            async () => {
                await telemetry.span('frigg.apimodule.request', async () => {});
            }
        );
        await telemetry.forceFlush();

        const spans = traceExporter.getFinishedSpans();
        const parent = spans.find(
            (s) => s.name === 'frigg.handler.USER_ACTION'
        );
        const child = spans.find((s) => s.name === 'frigg.apimodule.request');
        expect(parent).toBeDefined();
        expect(child).toBeDefined();
        expect(parent.attributes).toMatchObject(EXPECTED_SPAN_ATTRS);
        expect(child.attributes).toMatchObject(EXPECTED_SPAN_ATTRS);
    });

    it('stamps the same attrs onto adopter telemetry.span() inside withContext', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();

        await telemetry.withContext(CTX, async () => {
            await telemetry.span('adopter.custom', async () => {});
        });
        await telemetry.forceFlush();

        const span = traceExporter
            .getFinishedSpans()
            .find((s) => s.name === 'adopter.custom');
        expect(span.attributes).toMatchObject(EXPECTED_SPAN_ATTRS);
    });

    it('does not overwrite an attribute already set explicitly on the span', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();

        await telemetry.withContext(CTX, async () => {
            await telemetry.span('explicit', async () => {}, {
                attributes: { 'frigg.user_id': 'explicit_user' },
            });
        });
        await telemetry.forceFlush();

        const span = traceExporter
            .getFinishedSpans()
            .find((s) => s.name === 'explicit');
        expect(span.attributes['frigg.user_id']).toBe('explicit_user');
        expect(span.attributes['frigg.integration_id']).toBe('int_123');
    });

    it('never copies high-cardinality ids onto exported OTel metric attributes (ADR-011)', async () => {
        const { telemetry, metricExporter } = buildInMemoryTelemetry();

        await telemetry.withContext(CTX, async () => {
            telemetry.count('frigg.handler.invocations', 1, {
                integration_type: 'hubspot',
                event: 'USER_ACTION',
                status: 'ok',
            });
            await telemetry.span('frigg.apimodule.request', async () => {
                telemetry.count('frigg.apimodule.requests', 1, {
                    module: 'hubspotApi',
                    method: 'GET',
                    status: 'ok',
                });
            });
        });
        await telemetry.forceFlush();

        const metrics = metricExporter.getMetrics();
        const dataPoints = metrics.flatMap((resourceMetrics) =>
            (resourceMetrics.scopeMetrics || []).flatMap((scope) =>
                (scope.metrics || []).flatMap((m) => m.dataPoints || [])
            )
        );
        expect(dataPoints.length).toBeGreaterThan(0);
        for (const point of dataPoints) {
            const attrs = point.attributes || {};
            for (const key of FORBIDDEN_METRIC_KEYS) {
                expect(attrs).not.toHaveProperty(key);
            }
        }
    });
});
