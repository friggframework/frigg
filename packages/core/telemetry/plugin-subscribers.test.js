const { createNoOpTelemetry } = require('./no-op-telemetry');
const { wireTelemetrySubscribers } = require('./plugin-subscribers');

describe('wireTelemetrySubscribers (ADR-011 Decision 6 — plugin/extension taps)', () => {
    it('delivers metric emissions to a declarative { event, handler } subscriber', () => {
        const telemetry = createNoOpTelemetry();
        const seen = [];

        wireTelemetrySubscribers({
            telemetry,
            subscribers: [{ event: 'metric', handler: (p) => seen.push(p) }],
        });

        telemetry.count('records.synced', 3, { entity: 'contact' });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ name: 'records.synced', value: 3 });
    });

    it('lets a factory subscriber register itself against the telemetry service', () => {
        const telemetry = createNoOpTelemetry();
        const seen = [];

        wireTelemetrySubscribers({
            telemetry,
            subscribers: [(t) => t.on('event', (p) => seen.push(p))],
        });

        telemetry.event('workflow_invoked', { workflow: 'lead_route' });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ name: 'workflow_invoked' });
    });

    it('isolates a throwing subscriber so siblings still receive events', () => {
        const telemetry = createNoOpTelemetry();
        const seen = [];

        wireTelemetrySubscribers({
            telemetry,
            subscribers: [
                {
                    event: 'metric',
                    handler: () => {
                        throw new Error('boom');
                    },
                },
                { event: 'metric', handler: (p) => seen.push(p) },
            ],
        });

        expect(() => telemetry.count('records.synced', 1)).not.toThrow();
        expect(seen).toHaveLength(1);
    });
});
