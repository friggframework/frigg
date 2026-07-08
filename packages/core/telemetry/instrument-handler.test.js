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
