const { createTelemetryEventBus } = require('./telemetry-event-bus');

describe('TelemetryEventBus', () => {
    it('delivers an emitted event to a subscriber', () => {
        const bus = createTelemetryEventBus();
        const received = [];
        bus.on('metric', (payload) => received.push(payload));

        bus.emit('metric', { name: 'records.synced', value: 3 });

        expect(received).toEqual([{ name: 'records.synced', value: 3 }]);
    });

    it('isolates a throwing subscriber so siblings still receive and emit never throws', () => {
        const bus = createTelemetryEventBus();
        const received = [];
        bus.on('metric', () => {
            throw new Error('subscriber blew up');
        });
        bus.on('metric', (payload) => received.push(payload));

        expect(() =>
            bus.emit('metric', { name: 'webhooks.received', value: 1 })
        ).not.toThrow();
        expect(received).toEqual([{ name: 'webhooks.received', value: 1 }]);
    });

    it('stops delivery after unsubscribe', () => {
        const bus = createTelemetryEventBus();
        const received = [];
        const off = bus.on('metric', (p) => received.push(p));

        bus.emit('metric', { name: 'a', value: 1 });
        off();
        bus.emit('metric', { name: 'b', value: 1 });

        expect(received).toEqual([{ name: 'a', value: 1 }]);
    });

    it('scopes subscribers to their event type', () => {
        const bus = createTelemetryEventBus();
        const metrics = [];
        const events = [];
        bus.on('metric', (p) => metrics.push(p));
        bus.on('event', (p) => events.push(p));

        bus.emit('metric', { name: 'm', value: 1 });
        bus.emit('event', { name: 'e' });

        expect(metrics).toEqual([{ name: 'm', value: 1 }]);
        expect(events).toEqual([{ name: 'e' }]);
    });
});
