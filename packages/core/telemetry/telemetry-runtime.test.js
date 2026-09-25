jest.mock('../handlers/app-definition-loader', () => ({
    loadAppDefinition: jest.fn(() => ({ telemetry: {}, integrations: [] })),
}));

const {
    getTelemetry,
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
} = require('./telemetry-runtime');
const { getLogger, createMemorySink, resetLoggerForTests } = require('../logs');

const SPAN = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
const fakeTelemetry = () => ({ isEnabled: () => false, getActiveSpanContext: () => SPAN });

describe('telemetry-runtime registers the span-context provider with the logger', () => {
    let sink;
    beforeEach(() => {
        resetTelemetryRuntimeForTests();
        sink = createMemorySink();
    });
    afterEach(() => resetTelemetryRuntimeForTests());

    it('getTelemetry registers it, so records carry trace ids', () => {
        const { loadAppDefinition } = require('../handlers/app-definition-loader');
        const telemetry = getTelemetry();
        telemetry.getActiveSpanContext = () => SPAN;
        getLogger('integration.test').info('x');
        expect(loadAppDefinition).toHaveBeenCalled();
        expect(sink.records[0]).toMatchObject({ trace_id: SPAN.traceId, span_id: SPAN.spanId });
    });

    it('re-registers on the next getTelemetry after resetLoggerForTests', () => {
        setTelemetryForTests(fakeTelemetry());
        resetLoggerForTests({ level: 'TRACE', sinks: [sink] });
        getLogger('integration.test').info('before');
        getTelemetry();
        getLogger('integration.test').info('after');
        expect(sink.records[0]).not.toHaveProperty('trace_id');
        expect(sink.records[1].trace_id).toBe(SPAN.traceId);
    });

    it('setTelemetryForTests registers it', () => {
        setTelemetryForTests(fakeTelemetry());
        getLogger('integration.test').info('x');
        expect(sink.records[0].trace_flags).toBe('01');
    });

    it('reads the current service, not the one seen at registration', () => {
        setTelemetryForTests({ isEnabled: () => false, getActiveSpanContext: () => null });
        setTelemetryForTests(fakeTelemetry());
        getLogger('integration.test').info('x');
        expect(sink.records[0].trace_id).toBe(SPAN.traceId);
    });
});
