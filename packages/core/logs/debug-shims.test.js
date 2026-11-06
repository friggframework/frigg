const { debug, initDebugLog, flushDebugLog } = require('./debug-shims');
const { createMemorySink } = require('./sinks');
const runtime = require('./logger-runtime');
const { runInContext } = require('./context');
const { withEnv } = require('./__fixtures__/with-env');
const { httpApiV2Event } = require('./__fixtures__/events');
const { SECRETS } = require('./__fixtures__/secrets');
const { toContainNoSecretWindow } = require('./__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

describe('logs/debug-shims', () => {
    let sink;
    let consoleSpies;

    beforeEach(() => {
        sink = createMemorySink({ install: false });
        runtime.resetLoggerForTests({ level: 'TRACE', sinks: [sink] });
        consoleSpies = ['log', 'debug', 'info', 'warn', 'error'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
    });

    afterEach(() => {
        for (const spy of consoleSpies) {
            expect(spy).not.toHaveBeenCalled();
        }
        jest.restoreAllMocks();
    });

    describe('debug', () => {
        it('formats a string with a % directive', () => {
            debug('Count: %d', 5);
            expect(sink.records).toHaveLength(1);
            expect(sink.records[0]).toMatchObject({
                level: 'DEBUG',
                logger: 'frigg.legacy',
                message: 'Count: 5',
            });
            expect(sink.records[0]).not.toHaveProperty('args');
        });

        it('takes the first string as the message and the rest as args', () => {
            debug('a', 'b', { or: 3 });
            expect(sink.records[0]).toMatchObject({ message: 'a', args: ['b', { or: 3 }] });
        });

        it('lets the first string win even when it is not the first argument', () => {
            debug({ id: 1 }, 'the message', 2);
            expect(sink.records[0]).toMatchObject({ message: 'the message', args: [{ id: 1 }, 2] });
        });

        it('writes an empty message with args when no argument is a string', () => {
            debug({ id: 1 });
            expect(sink.records[0]).toMatchObject({ message: '', args: [{ id: 1 }] });
        });

        it('writes nothing without arguments', () => {
            debug();
            expect(sink.records).toHaveLength(0);
        });

        it('redacts args', () => {
            debug('token dump', { access_token: SECRETS.accessToken });
            expect(sink.records).toContainNoSecretWindow([SECRETS.accessToken]);
        });

        it('writes nothing below DEBUG and flushDebugLog replays nothing', () => {
            withEnv({ FRIGG_LOG_LEVEL: 'info' }, (s) => {
                debug('hidden');
                debug('hidden too');
                flushDebugLog(new Error('boom'));
                expect(s.records).toHaveLength(1);
                expect(s.records[0].level).toBe('ERROR');
            });
        });

        it('writes immediately with DEBUG_VERBOSE=1', () => {
            withEnv({ DEBUG_VERBOSE: '1', FRIGG_LOG_LEVEL: undefined, STAGE: 'prod' }, (s) => {
                debug('now');
                expect(s.records.map((r) => r.message)).toEqual(['now']);
            });
        });
    });

    describe('initDebugLog', () => {
        it('writes one DEBUG record with the redacted invocation outside a scope', () => {
            initDebugLog('Event', httpApiV2Event());
            expect(sink.records).toHaveLength(1);
            const record = sink.records[0];
            expect(record).toMatchObject({
                level: 'DEBUG',
                logger: 'frigg.legacy',
                invocation: {
                    source: 'http',
                    method: 'GET',
                    route: '/api/authorize',
                    path: '/api/authorize',
                    headerNames: expect.arrayContaining(['authorization']),
                },
            });
            expect(record).not.toHaveProperty('headerNames');
            expect(record.invocation).not.toHaveProperty('body');
            expect(record.invocation).not.toHaveProperty('headers');
            expect(record).toContainNoSecretWindow(SECRETS);
        });

        it('uses source other for a non-event argument', () => {
            initDebugLog('Test Event', { test: true });
            expect(sink.records[0].invocation).toEqual({ source: 'other' });
            initDebugLog();
            expect(sink.records[1].invocation).toEqual({ source: 'other' });
        });

        it('writes nothing inside an invocation scope', async () => {
            const { runInvocationScope } = require('../core/invocation-scope');
            await runInvocationScope({ requestId: 'r-1' }, async () => {
                initDebugLog('Event', httpApiV2Event());
            });
            expect(sink.records).toHaveLength(0);
        });

        it('writes nothing inside a scope', () => {
            runInContext({ log: { requestId: 'r-1' } }, () => {
                initDebugLog('Event', httpApiV2Event());
            });
            expect(sink.records).toHaveLength(0);
        });
    });

    describe('flushDebugLog', () => {
        it('writes one ERROR with the serialized error', () => {
            flushDebugLog(new TypeError('it broke'));
            expect(sink.records).toHaveLength(1);
            expect(sink.records[0]).toMatchObject({
                level: 'ERROR',
                logger: 'frigg.legacy',
                eventName: 'frigg.legacy.error',
                error: { type: 'TypeError', message: 'it broke' },
            });
            expect(runtime.takeViolationsForTests()).toEqual([]);
        });

        it('uses a fixed error without an argument', () => {
            flushDebugLog();
            expect(sink.records[0].error.message).toBe('flushDebugLog called with empty error');
        });

        it('writes one record per call and replays no debug lines', () => {
            debug('one');
            flushDebugLog(new Error('first'));
            flushDebugLog(new Error('second'));
            expect(sink.records.map((r) => r.level)).toEqual(['DEBUG', 'ERROR', 'ERROR']);
        });

        it('puts a cause chain under error.cause', () => {
            const error = new Error('top');
            error.cause = new Error('middle');
            error.cause.cause = new Error('bottom');
            flushDebugLog(error);
            expect(sink.records).toHaveLength(1);
            expect(sink.records[0].error.cause).toMatchObject({
                message: 'middle',
                cause: { message: 'bottom' },
            });
        });

        it('sanitizes the error text', () => {
            flushDebugLog(new Error(`GET https://h/p?api_key=${SECRETS.apiKeyQuery} Authorization: Bearer ${SECRETS.bearer}`));
            expect(sink.records).toContainNoSecretWindow([SECRETS.apiKeyQuery, SECRETS.bearer]);
        });

        it('carries the scope when called inside one', () => {
            runInContext({ log: { requestId: 'r-9', invocation: { source: 'sqs', recordCount: 1 } } }, () => {
                flushDebugLog(new Error('x'));
            });
            expect(sink.records[0]).toMatchObject({
                requestId: 'r-9',
                invocation: { source: 'sqs', recordCount: 1 },
            });
        });
    });
});
