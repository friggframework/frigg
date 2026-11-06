jest.mock('../handlers/app-definition-loader', () => ({
    loadAppDefinition: jest.fn(() => ({ telemetry: {}, integrations: [] })),
}));

const {
    getTelemetry,
    setTelemetryForTests,
    resetTelemetryRuntimeForTests,
} = require('./telemetry-runtime');
const { getLogger, createMemorySink, resetLoggerForTests } = require('../logs');
const { resolveTelemetryConfig } = require('./telemetry-config');

const SPAN = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
const fakeTelemetry = () => ({
    isEnabled: () => false,
    getActiveSpanContext: () => SPAN,
});

describe('telemetry-runtime registers the span-context provider with the logger', () => {
    let sink;
    beforeEach(() => {
        resetTelemetryRuntimeForTests();
        sink = createMemorySink();
    });
    afterEach(() => resetTelemetryRuntimeForTests());

    it('getTelemetry registers it, so records carry trace ids', () => {
        const {
            loadAppDefinition,
        } = require('../handlers/app-definition-loader');
        const telemetry = getTelemetry();
        telemetry.getActiveSpanContext = () => SPAN;
        getLogger('integration.test').info('x');
        expect(loadAppDefinition).toHaveBeenCalled();
        expect(sink.records[0]).toMatchObject({
            trace_id: SPAN.traceId,
            span_id: SPAN.spanId,
        });
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
        setTelemetryForTests({
            isEnabled: () => false,
            getActiveSpanContext: () => null,
        });
        setTelemetryForTests(fakeTelemetry());
        getLogger('integration.test').info('x');
        expect(sink.records[0].trace_id).toBe(SPAN.traceId);
    });
});

describe('getTelemetry — OTEL_EXPORTER_OTLP_ENDPOINT zero-code activation', () => {
    const ENDPOINT = 'https://watchtower.example/api/v1/watchtower/otel';
    const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const originalStage = process.env.STAGE;
    const { loadAppDefinition } = require('../handlers/app-definition-loader');

    beforeEach(() => {
        resetTelemetryRuntimeForTests();
        process.env.STAGE = 'production';
        loadAppDefinition.mockReset();
        loadAppDefinition.mockImplementation(() => ({
            telemetry: {},
            integrations: [],
        }));
    });

    afterEach(() => {
        resetTelemetryRuntimeForTests();
        if (originalEndpoint === undefined) {
            delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
        } else {
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
        }
        if (originalStage === undefined) {
            delete process.env.STAGE;
        } else {
            process.env.STAGE = originalStage;
        }
        loadAppDefinition.mockReset();
        loadAppDefinition.mockImplementation(() => ({
            telemetry: {},
            integrations: [],
        }));
    });

    it('enables OTel when Definition has no telemetry and the endpoint env is set', () => {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;
        expect(
            resolveTelemetryConfig({}, { stage: 'production' }).exporter
        ).toEqual({ type: 'otlp' });
        expect(getTelemetry().isEnabled()).toBe(true);
    });

    it('stays NoOp on production when the endpoint env is unset', () => {
        delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
        expect(getTelemetry().isEnabled()).toBe(false);
    });

    it('respects an explicit exporter: { type: none } even when the endpoint is set', () => {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ENDPOINT;
        loadAppDefinition.mockImplementation(() => ({
            telemetry: resolveTelemetryConfig(
                { telemetry: { exporter: { type: 'none' } } },
                { stage: 'production' }
            ),
            integrations: [],
        }));
        expect(getTelemetry().isEnabled()).toBe(false);
    });
});
