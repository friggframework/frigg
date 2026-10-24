const { instrumentHandler } = require('./instrument-handler');
const { NoOpTelemetry } = require('./no-op-telemetry');
const { createTelemetryEventBus } = require('./telemetry-event-bus');
const { bindTelemetryContext } = require('./bind-telemetry-context');

const CTX = {
    integrationId: 'int_1',
    integrationType: 'hubspot',
    userId: 'user_9',
    version: '1.0.0',
};

// Compose telemetry the way production does — a bound wrapper carrying the
// instance context — so instrumentHandler reads context from it.
function harness() {
    const bus = createTelemetryEventBus();
    const telemetry = bindTelemetryContext(new NoOpTelemetry({ bus }), () => CTX);
    const metrics = [];
    bus.on('metric', (m) => metrics.push(m));
    return { telemetry, metrics };
}

describe('instrumentHandler (ADR-011 P6)', () => {
    it('runs the handler and returns its result', async () => {
        const { telemetry } = harness();
        const result = await instrumentHandler(
            telemetry,
            { event: 'GET_CONFIG_OPTIONS', eventType: 'LIFE_CYCLE_EVENT' },
            async () => 'done'
        );
        expect(result).toBe('done');
    });

    it('emits frigg.handler.invocations keyed by bounded event TYPE with ok status', async () => {
        const { telemetry, metrics } = harness();

        await instrumentHandler(
            telemetry,
            { event: 'my_custom_action', eventType: 'USER_ACTION' },
            async () => 'ok'
        );

        expect(metrics).toContainEqual(
            expect.objectContaining({
                name: 'frigg.handler.invocations',
                value: 1,
                attributes: {
                    integration_type: 'hubspot',
                    event: 'USER_ACTION',
                    status: 'ok',
                },
            })
        );
    });

    it('emits error status and re-throws when the handler throws', async () => {
        const { telemetry, metrics } = harness();
        const boom = new Error('handler failed');

        await expect(
            instrumentHandler(
                telemetry,
                { event: 'x', eventType: 'QUEUE' },
                async () => {
                    throw boom;
                }
            )
        ).rejects.toBe(boom);

        expect(metrics).toContainEqual(
            expect.objectContaining({
                name: 'frigg.handler.invocations',
                value: 1,
                attributes: {
                    integration_type: 'hubspot',
                    event: 'QUEUE',
                    status: 'error',
                },
            })
        );
    });

    it('does not put high-cardinality ids on the metric attributes', async () => {
        const { telemetry, metrics } = harness();
        await instrumentHandler(
            telemetry,
            { event: 'a', eventType: 'CRON' },
            async () => 'ok'
        );
        const attrs = metrics[0].attributes;
        expect(attrs).not.toHaveProperty('integrationId');
        expect(attrs).not.toHaveProperty('userId');
    });

    it('degrades to integration_type "unknown" for a raw (unbound) telemetry', async () => {
        const bus = createTelemetryEventBus();
        const telemetry = new NoOpTelemetry({ bus }); // unbound: no getContext
        const metrics = [];
        bus.on('metric', (m) => metrics.push(m));

        await instrumentHandler(
            telemetry,
            { event: 'x', eventType: 'USER_ACTION' },
            async () => 'ok'
        );

        expect(metrics[0].attributes.integration_type).toBe('unknown');
    });

    it('still runs the handler when telemetry is absent', async () => {
        const result = await instrumentHandler(
            null,
            { event: 'x', eventType: 'USER_ACTION' },
            async () => 'ran'
        );
        expect(result).toBe('ran');
    });
});

describe('instrumentHandler and the logger scope (ADR-048 §7)', () => {
    const otelApi = require('@opentelemetry/api');
    const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
    const { createTelemetry } = require('./telemetry-service');
    const { getLogger, createMemorySink } = require('../logs');
    const { runInContext } = require('../logs/context');

    it('puts integrationEvent into the logger scope; the bus payload stays as before', async () => {
        const sink = createMemorySink();
        const { telemetry, metrics } = harness();
        await instrumentHandler(
            telemetry,
            { event: 'ON_WEBHOOK', eventType: 'WEBHOOK' },
            async () => getLogger('integration.hubspot').info('inside')
        );
        expect(sink.records[0]).toMatchObject({ ...CTX, integrationEvent: 'ON_WEBHOOK' });
        const m = metrics.find((x) => x.name === 'frigg.handler.invocations');
        expect(m.context).toStrictEqual({ ...CTX, event_name: 'ON_WEBHOOK' });
    });

    function otelHarness() {
        const traceExporter = new InMemorySpanExporter();
        const base = createTelemetry({ exporter: { type: 'otlp', traceExporter } });
        return { traceExporter, telemetry: bindTelemetryContext(base, () => CTX) };
    }

    it('keeps logger keys out of the baggage', async () => {
        const { telemetry } = otelHarness();
        let keys;
        await runInContext({ log: { requestId: 'r-1' } }, () =>
            instrumentHandler(telemetry, { event: 'E', eventType: 'QUEUE' }, async () => {
                const baggage = otelApi.propagation.getBaggage(otelApi.context.active());
                keys = baggage.getAllEntries().map(([key]) => key).sort();
            })
        );
        expect(keys).toEqual(['integrationId', 'integrationType', 'userId', 'version']);
    });

    it('sets requestId and messageId from the scope on the handler span', async () => {
        const { telemetry, traceExporter } = otelHarness();
        await runInContext({ log: { requestId: 'r-1', messageId: 'm-1' } }, () =>
            instrumentHandler(telemetry, { event: 'E', eventType: 'QUEUE' }, async () => 'ok')
        );
        await telemetry.forceFlush();
        const span = traceExporter.getFinishedSpans().find((s) => s.name === 'frigg.handler.QUEUE');
        expect(span.attributes).toMatchObject({ requestId: 'r-1', messageId: 'm-1' });
    });

    it('sets no id attributes outside a scope', async () => {
        const { telemetry, traceExporter } = otelHarness();
        await instrumentHandler(telemetry, { event: 'E', eventType: 'CRON' }, async () => 'ok');
        await telemetry.forceFlush();
        const span = traceExporter.getFinishedSpans().find((s) => s.name === 'frigg.handler.CRON');
        expect(span.attributes).not.toHaveProperty('requestId');
        expect(span.attributes).not.toHaveProperty('messageId');
    });
});

describe('instrumentHandler with a custom telemetry service', () => {
    const { getLogger, createMemorySink } = require('../logs');

    function customTelemetry() {
        const contexts = [];
        return {
            contexts,
            getContext: () => CTX,
            span: async (_name, fn) => fn({ setAttributes() {} }),
            count() {},
            withContext: async (context, fn) => {
                contexts.push(context);
                return fn();
            },
        };
    }

    it('never passes the logger sub-object to withContext', async () => {
        const telemetry = customTelemetry();
        await instrumentHandler(telemetry, { event: 'ON_WEBHOOK', eventType: 'WEBHOOK' }, async () => 'ok');
        expect(telemetry.contexts).toEqual([
            {
                integrationId: CTX.integrationId,
                userId: CTX.userId,
                integrationType: CTX.integrationType,
                version: CTX.version,
            },
        ]);
    });

    it('still puts integrationEvent on records, with or without withContext', async () => {
        const sink = createMemorySink();
        const telemetry = customTelemetry();
        await instrumentHandler(telemetry, { event: 'ON_WEBHOOK', eventType: 'WEBHOOK' }, async () =>
            getLogger('integration.hubspot').info('with')
        );
        delete telemetry.withContext;
        await instrumentHandler(telemetry, { event: 'ON_CRON', eventType: 'CRON' }, async () =>
            getLogger('integration.hubspot').info('without')
        );
        expect(sink.records.map((r) => r.integrationEvent)).toEqual(['ON_WEBHOOK', 'ON_CRON']);
    });
});
