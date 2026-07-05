const { bindTelemetryContext } = require('./bind-telemetry-context');

function baseSpy() {
    return {
        count: jest.fn(),
        event: jest.fn(),
        span: jest.fn((_n, fn) => fn && fn()),
        startSpan: jest.fn(),
        withContext: jest.fn((_c, fn) => fn && fn()),
        on: jest.fn(() => () => {}),
        forceFlush: jest.fn(),
        isEnabled: jest.fn(() => true),
    };
}

describe('bindTelemetryContext', () => {
    it('injects integration_type into count attributes from the bound context', () => {
        const base = baseSpy();
        const bound = bindTelemetryContext(base, () => ({
            integrationType: 'hubspot',
            integrationId: 'int_1',
        }));

        bound.count('records.synced', 3, { entity: 'contact' });

        expect(base.count).toHaveBeenCalledWith(
            'records.synced',
            3,
            { integration_type: 'hubspot', entity: 'contact' },
            undefined
        );
    });

    it('does not clobber an explicitly provided integration_type', () => {
        const base = baseSpy();
        const bound = bindTelemetryContext(base, () => ({
            integrationType: 'hubspot',
        }));

        bound.count('m', 1, { integration_type: 'override' });

        expect(base.count.mock.calls[0][2]).toEqual({
            integration_type: 'override',
        });
    });

    it('leaves attributes untouched when no integration type is available', () => {
        const base = baseSpy();
        const bound = bindTelemetryContext(base, () => ({}));
        bound.count('m', 1, { a: 1 });
        expect(base.count.mock.calls[0][2]).toEqual({ a: 1 });
    });

    it('delegates span/withContext/on/forceFlush/isEnabled to the base', () => {
        const base = baseSpy();
        const bound = bindTelemetryContext(base, () => ({}));

        bound.span('s', () => {});
        bound.on('metric', () => {});
        bound.forceFlush();
        expect(base.span).toHaveBeenCalled();
        expect(base.on).toHaveBeenCalledWith('metric', expect.any(Function));
        expect(base.forceFlush).toHaveBeenCalled();
        expect(bound.isEnabled()).toBe(true);
    });

    it('returns a falsy base unchanged', () => {
        expect(bindTelemetryContext(null)).toBeNull();
    });
});
