const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');
const { NoOpTelemetry } = require('../telemetry/no-op-telemetry');
const { createTelemetryEventBus } = require('../telemetry/telemetry-event-bus');
const { bindTelemetryContext } = require('../telemetry/bind-telemetry-context');

function fakeInstance(events) {
    const bus = createTelemetryEventBus();
    // Compose telemetry as production does: a bound wrapper carrying the
    // instance context, which is what instrumentHandler reads.
    const telemetry = bindTelemetryContext(new NoOpTelemetry({ bus }), () => ({
        integrationId: 'i1',
        integrationType: 'hubspot',
        userId: 'u1',
        version: '1.0.0',
    }));
    const metrics = [];
    bus.on('metric', (m) => metrics.push(m));
    const instance = {
        telemetry,
        events,
        constructor: { Definition: { name: 'hubspot' } },
    };
    return { instance, metrics };
}

describe('IntegrationEventDispatcher — auto-instrumentation (ADR-011 P6)', () => {
    it('dispatchJob emits a handler-invocation metric keyed by event type', async () => {
        const { instance, metrics } = fakeInstance({
            PROCESS_BATCH: { type: 'QUEUE', handler: async () => 'handled' },
        });
        const dispatcher = new IntegrationEventDispatcher(instance);

        const result = await dispatcher.dispatchJob({
            event: 'PROCESS_BATCH',
            data: {},
            context: {},
        });

        expect(result).toBe('handled');
        expect(metrics).toContainEqual(
            expect.objectContaining({
                name: 'frigg.handler.invocations',
                value: 1,
                attributes: {
                integration_type: 'hubspot',
                event: 'QUEUE',
                status: 'ok',
            },
            })
            );
    });

    it('dispatchHttp emits with WEBHOOK event type and tags error status on throw', async () => {
        const { instance, metrics } = fakeInstance({
            ON_WEBHOOK: {
                type: 'WEBHOOK',
                handler: async () => {
                    throw new Error('bad webhook');
                },
            },
        });
        const dispatcher = new IntegrationEventDispatcher(instance);

        await expect(
            dispatcher.dispatchHttp({ event: 'ON_WEBHOOK', req: {}, res: {} })
        ).rejects.toThrow('bad webhook');

        expect(metrics).toContainEqual(
            expect.objectContaining({
                name: 'frigg.handler.invocations',
                value: 1,
                attributes: {
                integration_type: 'hubspot',
                event: 'WEBHOOK',
                status: 'error',
            },
            })
            );
    });

    it('still throws for an unregistered event', async () => {
        const { instance } = fakeInstance({});
        const dispatcher = new IntegrationEventDispatcher(instance);
        await expect(
            dispatcher.dispatchJob({ event: 'MISSING', data: {} })
        ).rejects.toThrow(/not registered/);
    });
});
