const {
    runWithTelemetryContext,
    getTelemetryContextStore,
    mergeTelemetryContext,
} = require('./telemetry-context');
const { runInContext, getContext, getLoggerScope } = require('../logs/context');
const { NoOpTelemetry } = require('./no-op-telemetry');

const inLoggerScope = (fn) =>
    runInContext(
        { log: { requestId: 'r-1', invocation: { source: 'http', method: 'GET' } } },
        fn
    );

describe('telemetry-context (delegates to logs/context)', () => {
    it('shares the one store with the logger', () => {
        runWithTelemetryContext({ integrationId: 'i-1' }, () => {
            expect(getContext()).toEqual({ integrationId: 'i-1' });
            expect(getLoggerScope()).toEqual({ integrationId: 'i-1' });
        });
    });

    it('merges: inner undefined keeps outer, explicit null is stored as null', () => {
        runWithTelemetryContext({ integrationId: 'i-1', userId: 'u-1' }, () => {
            runWithTelemetryContext({ integrationId: undefined, userId: null }, () => {
                expect(mergeTelemetryContext()).toStrictEqual({
                    integrationId: 'i-1',
                    userId: null,
                });
            });
        });
    });

    it('keeps outer ids when an inner withContext passes undefined ids (replace became merge)', async () => {
        const telemetry = new NoOpTelemetry();
        const metrics = [];
        telemetry.on('metric', (m) => metrics.push(m));
        await telemetry.withContext({ integrationId: 'i-outer', userId: 'u-outer' }, () =>
            telemetry.withContext({ integrationId: undefined, version: '2' }, () =>
                telemetry.count('m', 1, {})
            )
        );
        expect(metrics[0].context).toStrictEqual({
            integrationId: 'i-outer',
            userId: 'u-outer',
            version: '2',
        });
    });

    describe('bus payload stays byte-stable', () => {
        it('is undefined outside any scope', () => {
            expect(mergeTelemetryContext()).toBeUndefined();
            expect(getTelemetryContextStore()).toBeNull();
        });

        it('is undefined inside a logger-only scope with no explicit context', () => {
            inLoggerScope(() => {
                expect(mergeTelemetryContext()).toBeUndefined();
                expect(getTelemetryContextStore()).toBeNull();
            });
        });

        it('returns only the explicit context inside a logger-only scope', () => {
            inLoggerScope(() => {
                expect(mergeTelemetryContext({ url: 'https://x' })).toStrictEqual({
                    url: 'https://x',
                });
            });
        });

        it('keeps an explicit null id in the payload', async () => {
            const telemetry = new NoOpTelemetry();
            const metrics = [];
            telemetry.on('metric', (m) => metrics.push(m));
            await inLoggerScope(() =>
                telemetry.withContext({ integrationId: null, userId: 'u-1' }, () =>
                    telemetry.count('m', 1, {})
                )
            );
            expect(metrics[0].context).toStrictEqual({ integrationId: null, userId: 'u-1' });
        });

        it('keeps an empty withContext as an empty object, as before', () => {
            runWithTelemetryContext({}, () => {
                expect(mergeTelemetryContext()).toStrictEqual({});
            });
        });

        it('never exposes log, requestId or invocation', () => {
            inLoggerScope(() => {
                runWithTelemetryContext({ integrationId: 'i-1' }, () => {
                    const merged = mergeTelemetryContext({ url: 'u' });
                    expect(merged).toStrictEqual({ integrationId: 'i-1', url: 'u' });
                    expect(getTelemetryContextStore()).toStrictEqual({ integrationId: 'i-1' });
                });
            });
        });
    });

    it('keeps the logger sub-object through NoOpTelemetry.withContext', async () => {
        const telemetry = new NoOpTelemetry();
        await inLoggerScope(() =>
            telemetry.withContext({ integrationId: 'i-1' }, () => {
                expect(getLoggerScope()).toEqual({
                    integrationId: 'i-1',
                    requestId: 'r-1',
                    invocation: { source: 'http', method: 'GET' },
                });
            })
        );
    });

    it('returns a copy the caller may not mutate into the store', () => {
        runWithTelemetryContext({ integrationId: 'i-1' }, () => {
            const merged = mergeTelemetryContext();
            merged.integrationId = 'changed';
            expect(mergeTelemetryContext().integrationId).toBe('i-1');
        });
    });
});
