const {
    runInvocationScope,
    runMessageScope,
    withDeadline,
    flushTelemetry,
    flushUsageRollup,
    FLUSH_MARGIN_MS,
    DEFAULT_FLUSH_TIMEOUT_MS,
} = require('./invocation-scope');
const { getLogger, createMemorySink } = require('../logs');
const { setSinks } = require('../logs/logger-runtime');
const { getLoggerScope } = require('../logs/context');
const { mergeTelemetryContext } = require('../telemetry/telemetry-context');
const { NoOpTelemetry } = require('../telemetry/no-op-telemetry');
const { createUsageRollupSubscriber } = require('../telemetry/usage-rollup-subscriber');

const enabledTelemetry = (forceFlush) => ({ isEnabled: () => true, forceFlush });
const flushingSink = (flush) => ({ name: 'dest', write() {}, flush });
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('core/invocation-scope', () => {
    let sink;
    beforeEach(() => {
        sink = createMemorySink();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('exports the flush constants', () => {
        expect(FLUSH_MARGIN_MS).toBe(50);
        expect(DEFAULT_FLUSH_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it("returns fn's value and rethrows fn's rejection", async () => {
        await expect(runInvocationScope({}, async () => 'ok')).resolves.toBe('ok');
        const boom = new Error('boom');
        await expect(runInvocationScope({}, async () => { throw boom; })).rejects.toBe(boom);
    });

    it('puts the fields into the logger scope, visible deep inside fn', async () => {
        const fields = {
            requestId: 'r-1',
            handlerName: 'MyHandler',
            method: 'GET',
            route: '/api/x',
            invocation: { source: 'http', method: 'GET', route: '/api/x', queryKeys: [], headerNames: [] },
        };
        await runInvocationScope(fields, async () => {
            await tick();
            await Promise.resolve().then(() => getLogger('integration.test').info('deep'));
        });
        expect(sink.records[0]).toMatchObject(fields);
    });

    it('keeps the bus payload unchanged inside the scope', async () => {
        await runInvocationScope({ requestId: 'r-1' }, async () => {
            expect(mergeTelemetryContext()).toBeUndefined();
        });
    });

    it('drops undefined fields, so an absent context sets no requestId', async () => {
        await runInvocationScope({ requestId: undefined, handlerName: 'H' }, async () => {
            expect(getLoggerScope()).toEqual({ handlerName: 'H' });
        });
        await expect(runInvocationScope(undefined, async () => 'ok')).resolves.toBe('ok');
    });

    it('runs the usage rollup in parallel with telemetry and sinks: all start before any finishes', async () => {
        const started = [];
        const finished = [];
        const startedBeforeFirstFinish = [];
        const gate = (name) => new Promise((resolve) => {
            started.push(name);
            setTimeout(() => {
                if (!finished.length) startedBeforeFirstFinish.push(...started);
                finished.push(name);
                resolve();
            }, 5);
        });
        const usageRollup = { flush: jest.fn(() => gate('usage')), discard: jest.fn() };
        const telemetry = enabledTelemetry(() => gate('telemetry'));
        setSinks([sink, flushingSink(() => gate('sink'))]);

        await runInvocationScope({}, async () => 'ok', { telemetry, usageRollup, flushTimeoutMs: 1000 });
        expect(startedBeforeFirstFinish.sort()).toEqual(['sink', 'telemetry', 'usage']);
        expect(finished).toHaveLength(3);
    });

    it('still flushes telemetry when the usage rollup outlasts the remaining time', async () => {
        const forceFlush = jest.fn(async () => {});
        let remaining = 300;
        const usageRollup = {
            flush: jest.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                remaining = 0;
            }),
            discard: jest.fn(),
        };
        await runInvocationScope({}, async () => 'ok', {
            telemetry: enabledTelemetry(forceFlush),
            usageRollup,
            flushTimeoutMs: 100,
            context: { getRemainingTimeInMillis: () => remaining },
        });
        expect(usageRollup.flush).toHaveBeenCalledTimes(1);
        expect(forceFlush).toHaveBeenCalledTimes(1);
    });

    it('waits for a usage rollup that takes longer than the deadline', async () => {
        let usageDone = false;
        const usageRollup = {
            flush: async () => {
                await new Promise((resolve) => setTimeout(resolve, 60));
                usageDone = true;
            },
            discard() {},
        };
        await runInvocationScope({}, async () => 'ok', {
            telemetry: enabledTelemetry(async () => {}),
            usageRollup,
            flushTimeoutMs: 10,
        });
        expect(usageDone).toBe(true);
    });

    it('lets a forceFlush that resolves after 30 ms complete under flushTimeoutMs 100', async () => {
        let done = false;
        const telemetry = enabledTelemetry(() => new Promise((resolve) => setTimeout(() => {
            done = true;
            resolve();
        }, 30)));
        await runInvocationScope({}, async () => 'ok', { telemetry, flushTimeoutMs: 100 });
        expect(done).toBe(true);
    });

    it('keeps the result when forceFlush or a sink flush hangs', async () => {
        jest.useFakeTimers();
        const telemetry = enabledTelemetry(() => new Promise(() => {}));
        setSinks([sink, flushingSink(() => new Promise(() => {}))]);
        const pending = runInvocationScope({}, async () => 'ok', { telemetry, flushTimeoutMs: 20 });
        await jest.advanceTimersByTimeAsync(20);
        await expect(pending).resolves.toBe('ok');
    });

    it('never lets a throwing flush reach the caller', async () => {
        const telemetry = enabledTelemetry(() => { throw new Error('sync'); });
        const usageRollup = { flush: async () => { throw new Error('usage'); }, discard() {} };
        setSinks([sink, flushingSink(() => { throw new Error('sink'); })]);
        await expect(
            runInvocationScope({}, async () => 'ok', { telemetry, usageRollup })
        ).resolves.toBe('ok');
    });

    describe('deadline', () => {
        const spyTimeout = () => jest.spyOn(global, 'setTimeout');

        it('uses min(flushTimeoutMs, remaining - 50)', async () => {
            const spy = spyTimeout();
            const telemetry = enabledTelemetry(async () => {});
            await runInvocationScope({}, async () => 'ok', {
                telemetry,
                flushTimeoutMs: 500,
                context: { getRemainingTimeInMillis: () => 250 },
            });
            expect(spy.mock.calls.map((c) => c[1])).toContain(200);
            spy.mockClear();
            await runInvocationScope({}, async () => 'ok', {
                telemetry,
                flushTimeoutMs: 100,
                context: { getRemainingTimeInMillis: () => 10000 },
            });
            expect(spy.mock.calls.map((c) => c[1])).toContain(100);
            spy.mockRestore();
        });

        it('uses flushTimeoutMs when getRemainingTimeInMillis is absent or throws', async () => {
            const spy = spyTimeout();
            const telemetry = enabledTelemetry(async () => {});
            await runInvocationScope({}, async () => 'ok', { telemetry, flushTimeoutMs: 77, context: {} });
            await runInvocationScope({}, async () => 'ok', {
                telemetry,
                flushTimeoutMs: 78,
                context: { getRemainingTimeInMillis: () => { throw new Error('x'); } },
            });
            expect(spy.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([77, 78]));
            spy.mockRestore();
        });

        it('skips the bounded flush when remaining time is 40 ms', async () => {
            const forceFlush = jest.fn(async () => {});
            const usageRollup = { flush: jest.fn(async () => {}), discard: jest.fn() };
            await runInvocationScope({}, async () => 'ok', {
                telemetry: enabledTelemetry(forceFlush),
                usageRollup,
                context: { getRemainingTimeInMillis: () => 40 },
            });
            expect(usageRollup.flush).toHaveBeenCalledTimes(1);
            expect(forceFlush).not.toHaveBeenCalled();
        });

        it('adds no wait and no timer when nothing needs a flush', async () => {
            jest.useFakeTimers();
            const spy = jest.spyOn(global, 'setTimeout');
            await expect(
                runInvocationScope({}, async () => 'ok', { telemetry: new NoOpTelemetry() })
            ).resolves.toBe('ok');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    it('turns a late rejection into no unhandled rejection', async () => {
        jest.useFakeTimers();
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        try {
            let rejectLate;
            const telemetry = enabledTelemetry(() => new Promise((_r, reject) => { rejectLate = reject; }));
            const pending = runInvocationScope({}, async () => 'ok', { telemetry, flushTimeoutMs: 10 });
            await jest.advanceTimersByTimeAsync(10);
            await expect(pending).resolves.toBe('ok');
            rejectLate(new Error('late'));
            jest.useRealTimers();
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setImmediate(resolve));
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });

    it('keeps usage attribution for nested integration contexts', async () => {
        const telemetry = new NoOpTelemetry();
        const increments = [];
        const usageRollup = createUsageRollupSubscriber({
            telemetry,
            usageRepository: { increment: jest.fn(async (args) => increments.push(args)) },
            trackedMetrics: new Set(['records.synced']),
            now: () => new Date('2026-07-05T14:23:00.000Z'),
        });
        await runInvocationScope({ requestId: 'r-1' }, async () => {
            await telemetry.withContext({ integrationId: 'int_1', integrationType: 'hubspot' }, async () => {
                await telemetry.withContext({ integrationId: undefined, userId: 'u-1' }, async () => {
                    telemetry.count('records.synced', 2, {});
                });
            });
        }, { telemetry, usageRollup });
        expect(increments).toContainEqual(expect.objectContaining({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            metric: 'records.synced',
            window: 'day:2026-07-05',
            value: 2,
        }));
    });

    describe('withDeadline', () => {
        it('resolves when the work settles and clears its timer', async () => {
            const clear = jest.spyOn(global, 'clearTimeout');
            await expect(withDeadline(1000, async () => 'x')).resolves.toBeUndefined();
            expect(clear).toHaveBeenCalled();
            clear.mockRestore();
        });

        it('aborts the signal at the deadline', async () => {
            jest.useFakeTimers();
            let signal;
            const pending = withDeadline(15, (s) => {
                signal = s;
                return new Promise(() => {});
            });
            await jest.advanceTimersByTimeAsync(15);
            await pending;
            expect(signal.aborted).toBe(true);
        });

        it('never rejects', async () => {
            await expect(withDeadline(10, () => { throw new Error('sync'); })).resolves.toBeUndefined();
            await expect(withDeadline(10, async () => { throw new Error('async'); })).resolves.toBeUndefined();
        });
    });

    describe('flushTelemetry', () => {
        it('flushes only enabled telemetry and never throws', async () => {
            const forceFlush = jest.fn(async () => {});
            await flushTelemetry({ isEnabled: () => false, forceFlush });
            expect(forceFlush).not.toHaveBeenCalled();
            await flushTelemetry(enabledTelemetry(forceFlush), { signal: new AbortController().signal });
            expect(forceFlush).toHaveBeenCalledTimes(1);
            await expect(flushTelemetry(enabledTelemetry(async () => { throw new Error('x'); }))).resolves.toBeUndefined();
            await expect(flushTelemetry(null)).resolves.toBeUndefined();
        });
    });

    describe('flushUsageRollup', () => {
        const rollup = () => ({ flush: jest.fn(async () => {}), discard: jest.fn() });

        it('discards when every SQS record is a redelivery, else flushes', async () => {
            const a = rollup();
            await flushUsageRollup(a, { records: [{ receiveCount: '2' }, { receiveCount: '3' }] }, true);
            expect(a.discard).toHaveBeenCalled();
            const b = rollup();
            await flushUsageRollup(b, { records: [{ receiveCount: '2' }, { receiveCount: '1' }] }, true);
            expect(b.flush).toHaveBeenCalled();
        });

        it('discards for a DB-free handler', async () => {
            const a = rollup();
            await flushUsageRollup(a, {}, false);
            expect(a.discard).toHaveBeenCalled();
            expect(a.flush).not.toHaveBeenCalled();
        });
    });
});

describe('runInvocationScope exports', () => {
    it('is exported from core/index.js and the package root', () => {
        const { runInvocationScope: fromScope } = require('./invocation-scope');
        expect(require('./index').runInvocationScope).toBe(fromScope);
        expect(require('../index').runInvocationScope).toBe(fromScope);
    });
});

describe('runMessageScope', () => {
    const { getLoggerScope } = require('../logs/context');
    const { mergeTelemetryContext } = require('../telemetry/telemetry-context');

    it('puts messageId, receiveCount and the body ids into the logger scope', async () => {
        const record = {
            messageId: 'm-1',
            attributes: { ApproximateReceiveCount: '3' },
            body: JSON.stringify({ event: 'E', data: { processId: 'p-1', integrationId: 'i-1', token: 'x' } }),
        };
        const scope = await runMessageScope(record, async () => getLoggerScope());
        expect(scope).toEqual({
            messageId: 'm-1',
            receiveCount: 3,
            integrationEvent: 'E',
            processId: 'p-1',
            integrationId: 'i-1',
        });
    });

    it('returns fn\'s value, adds no bus context and tolerates bad records', async () => {
        expect(runMessageScope({ body: 'not json' }, () => mergeTelemetryContext())).toBeUndefined();
        expect(runMessageScope(undefined, () => getLoggerScope())).toEqual({});
        expect(runMessageScope({ messageId: 'm', attributes: { ApproximateReceiveCount: 'x' } }, () => getLoggerScope())).toEqual({ messageId: 'm' });
    });
});

describe('withDeadline clamp', () => {
    it('clamps a timeout above 2^31-1 so it does not fire at once', async () => {
        jest.useFakeTimers();
        try {
            const spy = jest.spyOn(global, 'setTimeout');
            let settled = false;
            withDeadline(2 ** 31 + 1000, () => new Promise(() => {})).then(() => {
                settled = true;
            });
            expect(spy.mock.calls[0][1]).toBe(2 ** 31 - 1);
            await jest.advanceTimersByTimeAsync(10);
            expect(settled).toBe(false);
        } finally {
            jest.clearAllTimers();
            jest.useRealTimers();
        }
    });
});
