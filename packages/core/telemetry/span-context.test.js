const { createTelemetry } = require('./telemetry-service');
const { SECRETS } = require('../logs/__fixtures__/secrets');
const { toContainNoSecretWindow } = require('../logs/__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

describe('span exception recording', () => {
    const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
    const {
        InMemoryMetricExporter,
        AggregationTemporality,
    } = require('@opentelemetry/sdk-metrics');

    function buildInMemoryTelemetry() {
        const traceExporter = new InMemorySpanExporter();
        const telemetry = createTelemetry({
            exporter: {
                type: 'otlp',
                traceExporter,
                metricExporter: new InMemoryMetricExporter(
                    AggregationTemporality.CUMULATIVE
                ),
            },
            resource: { service: 'test-app', stage: 'test' },
        });
        return { telemetry, traceExporter };
    }

    it('records the serialized error, so no secret reaches the exporter', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();
        const boom = new Error(
            `GET https://h.example/p?api_key=${SECRETS.apiKeyQuery} Authorization: Bearer ${SECRETS.bearer}`
        );

        await expect(
            telemetry.span('frigg.apimodule.request', async () => {
                throw boom;
            })
        ).rejects.toBe(boom);
        await telemetry.forceFlush();

        const span = traceExporter
            .getFinishedSpans()
            .find((s) => s.name === 'frigg.apimodule.request');
        const exception = span.events.find((e) => e.name === 'exception');

        expect(span.status.code).toBe(2);
        expect(exception.attributes['exception.type']).toBe('Error');
        expect(exception.attributes['exception.message']).toBe(
            `GET https://h.example/p?api_key=REDACTED Authorization: Bearer [REDACTED:${SECRETS.bearer.length}]`
        );
        expect(exception.attributes['exception.stacktrace']).toMatch(/\n\s+at /);
        expect(exception.attributes).toContainNoSecretWindow(SECRETS);
        expect(span.status.message).toContainNoSecretWindow(SECRETS);
    });

    it('keeps the error code on the exception event', async () => {
        const { telemetry, traceExporter } = buildInMemoryTelemetry();
        const boom = Object.assign(new Error('reset'), { code: 'ECONNRESET' });

        await telemetry.span('op', async () => {
            throw boom;
        }).catch(() => {});
        await telemetry.forceFlush();

        const exception = traceExporter
            .getFinishedSpans()
            .find((s) => s.name === 'op')
            .events.find((e) => e.name === 'exception');
        expect(exception.attributes['exception.type']).toBe('ECONNRESET');
    });

    it('NoOp startSpan().recordException(serialized) does not throw', () => {
        const telemetry = createTelemetry();
        const span = telemetry.startSpan('x');
        expect(() =>
            span.recordException({ name: 'Error', message: 'm', stack: 's' })
        ).not.toThrow();
        span.end();
    });
});

describe('getActiveSpanContext', () => {
    const otelApi = require('@opentelemetry/api');
    const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
    const {
        InMemoryMetricExporter,
        AggregationTemporality,
    } = require('@opentelemetry/sdk-metrics');

    function buildOtel() {
        const traceExporter = new InMemorySpanExporter();
        const telemetry = createTelemetry({
            exporter: {
                type: 'otlp',
                traceExporter,
                metricExporter: new InMemoryMetricExporter(
                    AggregationTemporality.CUMULATIVE
                ),
            },
            resource: { service: 'test-app', stage: 'test' },
        });
        return { telemetry, traceExporter };
    }

    it('NoOp returns null', async () => {
        const telemetry = createTelemetry();
        expect(telemetry.getActiveSpanContext()).toBeNull();
        await telemetry.span('x', async () => {
            expect(telemetry.getActiveSpanContext()).toBeNull();
        });
    });

    it('OTel returns the active span ids inside telemetry.span', async () => {
        const { telemetry, traceExporter } = buildOtel();
        let seen;
        await telemetry.span('op', async () => {
            seen = telemetry.getActiveSpanContext();
        });
        await telemetry.forceFlush();

        const span = traceExporter.getFinishedSpans().find((s) => s.name === 'op');
        expect(seen).toEqual({
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            traceFlags: span.spanContext().traceFlags,
        });
        expect(seen.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(seen.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('OTel returns null outside a span', () => {
        const { telemetry } = buildOtel();
        expect(telemetry.getActiveSpanContext()).toBeNull();
    });

    it('OTel returns null for an invalid span context', () => {
        const { telemetry } = buildOtel();
        const invalid = otelApi.trace.wrapSpanContext(
            otelApi.INVALID_SPAN_CONTEXT
        );
        const ctx = otelApi.trace.setSpan(otelApi.context.active(), invalid);
        const seen = otelApi.context.with(ctx, () =>
            telemetry.getActiveSpanContext()
        );
        expect(seen).toBeNull();
    });
});

describe('log records inside telemetry.span (ADR-048 §3 trace fields)', () => {
    const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
    const { getLogger, createMemorySink } = require('../logs');
    const {
        setTelemetryForTests,
        resetTelemetryRuntimeForTests,
    } = require('./telemetry-runtime');

    let sink;
    beforeEach(() => {
        sink = createMemorySink();
    });
    afterEach(() => resetTelemetryRuntimeForTests());

    it('carries trace_id, span_id and trace_flags of the active span', async () => {
        const traceExporter = new InMemorySpanExporter();
        const telemetry = createTelemetry({
            exporter: { type: 'otlp', traceExporter },
        });
        setTelemetryForTests(telemetry);

        await telemetry.span('op', async () => {
            getLogger('integration.test').info('inside');
        });
        getLogger('integration.test').info('outside');
        await telemetry.forceFlush();

        const span = traceExporter.getFinishedSpans().find((s) => s.name === 'op');
        const [inside, outside] = sink.records;
        expect(inside.trace_id).toBe(span.spanContext().traceId);
        expect(inside.trace_id).toMatch(/^[0-9a-f]{32}$/);
        expect(inside.span_id).toBe(span.spanContext().spanId);
        expect(inside.span_id).toMatch(/^[0-9a-f]{16}$/);
        expect(inside.trace_flags).toBe('01');
        for (const key of ['trace_id', 'span_id', 'trace_flags']) {
            expect(outside).not.toHaveProperty(key);
        }
    });

    it('adds no trace keys on the NoOp path', async () => {
        const telemetry = createTelemetry();
        setTelemetryForTests(telemetry);
        await telemetry.span('op', async () => {
            getLogger('integration.test').info('inside');
        });
        expect(sink.records[0]).not.toHaveProperty('trace_id');
    });

    it('adds no trace keys and does not throw for a service without getActiveSpanContext', () => {
        setTelemetryForTests({ span: async (_n, fn) => fn(), isEnabled: () => false });
        expect(() => getLogger('integration.test').info('x')).not.toThrow();
        expect(sink.records[0]).not.toHaveProperty('trace_id');
    });
});
