const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createTelemetry } = require('./telemetry-service');

describe('createTelemetry — no-op default', () => {
    it('loads zero @opentelemetry modules on the no-op path (cold-start guard)', () => {
        const servicePath = path.join(__dirname, 'telemetry-service.js');
        const probe = `
            const { createTelemetry } = require(${JSON.stringify(servicePath)});
            const t = createTelemetry();
            t.count('records.synced', 1, { entity: 'contact' });
            t.event('workflow_invoked', {});
            t.startSpan('x').end();
            const loaded = Object.keys(require.cache).filter((k) => k.includes('@opentelemetry'));
            process.stdout.write(loaded.length ? 'DIRTY:' + loaded.join(',') : 'CLEAN');
        `;
        const out = execFileSync(process.execPath, ['-e', probe], {
            encoding: 'utf8',
        });
        expect(out).toBe('CLEAN');
    });

    it('never throws and runs span callbacks when no exporter is configured', async () => {
        const telemetry = createTelemetry();

        expect(() =>
            telemetry.count('records.synced', 1, { entity: 'contact' })
        ).not.toThrow();
        expect(() =>
            telemetry.event('workflow_invoked', { workflow: 'lead_route' })
        ).not.toThrow();

        const result = await telemetry.span('delta_sync', async () => 42);
        expect(result).toBe(42);

        await expect(telemetry.forceFlush()).resolves.not.toThrow();
    });
});

describe('createTelemetry — real (OTel-backed) path', () => {
    const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
    const {
        InMemoryMetricExporter,
        AggregationTemporality,
    } = require('@opentelemetry/sdk-metrics');

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

    it('records a named span reaching the exporter after flush', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();

        const result = await telemetry.span('delta_sync', async () => 7);
        await telemetry.forceFlush();

        expect(result).toBe(7);
        expect(traceExporter.getFinishedSpans().map((s) => s.name)).toContain(
            'delta_sync'
        );
    });

    it('records a counter with bounded attributes reaching the exporter after flush', async () => {
        const { telemetry, metricExporter } = buildInMemoryTelemetry();

        telemetry.count('frigg.handler.invocations', 1, {
            integration_type: 'hubspot',
            event: 'USER_ACTION',
        });
        await telemetry.forceFlush();

        const metrics = metricExporter.getMetrics();
        const metric = metrics[0]?.scopeMetrics[0]?.metrics[0];
        expect(metric?.descriptor.name).toBe('frigg.handler.invocations');
        expect(metric?.dataPoints[0].value).toBe(1);
        expect(metric?.dataPoints[0].attributes).toEqual({
            integration_type: 'hubspot',
            event: 'USER_ACTION',
        });
    });

    it('nests child spans under the active parent (context manager registered)', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();

        await telemetry.span('parent', async () => {
            await telemetry.span('child', async () => {});
        });
        await telemetry.forceFlush();

        const spans = traceExporter.getFinishedSpans();
        const parent = spans.find((s) => s.name === 'parent');
        const child = spans.find((s) => s.name === 'child');
        expect(child.parentSpanContext?.spanId).toBe(
            parent.spanContext().spanId
        );
    });

    it('marks the span as error and re-throws when the callback throws', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();
        const boom = new Error('sync failed');

        await expect(
            telemetry.span('delta_sync', async () => {
                throw boom;
            })
        ).rejects.toBe(boom);
        await telemetry.forceFlush();

        const span = traceExporter
            .getFinishedSpans()
            .find((s) => s.name === 'delta_sync');
        // OTel SpanStatusCode.ERROR === 2
        expect(span?.status.code).toBe(2);
        expect(span?.events.map((e) => e.name)).toContain('exception');
    });
});

describe('createTelemetry — always-on event tap (ADR-011 Decision 6/7)', () => {
    it('mirrors count() onto the event bus even on the no-op path', () => {
        const telemetry = createTelemetry();
        const seen = [];
        telemetry.on('metric', (p) => seen.push(p));

        telemetry.count('records.synced', 3, { entity: 'contact' });

        expect(seen).toEqual([
            {
                name: 'records.synced',
                value: 3,
                attributes: { entity: 'contact' },
            },
        ]);
    });

    it('mirrors event() onto the event bus', () => {
        const telemetry = createTelemetry();
        const seen = [];
        telemetry.on('event', (p) => seen.push(p));

        telemetry.event('workflow_invoked', { workflow: 'lead_route' });

        expect(seen).toEqual([
            {
                name: 'workflow_invoked',
                attributes: { workflow: 'lead_route' },
            },
        ]);
    });

    it('mirrors count() onto the event bus on the OTel-backed path', () => {
        const {
            InMemorySpanExporter,
        } = require('@opentelemetry/sdk-trace-base');
        const telemetry = createTelemetry({
            exporter: {
                type: 'otlp',
                traceExporter: new InMemorySpanExporter(),
            },
        });
        const seen = [];
        telemetry.on('metric', (p) => seen.push(p));

        telemetry.count('api.requests', 1, { status: 200 });

        expect(seen).toEqual([
            { name: 'api.requests', value: 1, attributes: { status: 200 } },
        ]);
    });
});
