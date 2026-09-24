const { buildRecord, MAX_RECORD_BYTES } = require('./record');
const { getLogger } = require('./logger');
const { createMemorySink } = require('./sinks');
const runtime = require('./logger-runtime');
const { runInContext } = require('./context');
const { withEnv } = require('./__fixtures__/with-env');

const base = (overrides = {}) =>
    buildRecord({ level: 'INFO', logger: 'integration.test', message: 'm', ...overrides });

describe('logs/record', () => {
    let sink;

    beforeEach(() => {
        sink = createMemorySink({ install: false });
        runtime.resetLoggerForTests({ level: 'TRACE', sinks: [sink] });
    });

    describe('required fields', () => {
        it('writes timestamp as RFC 3339 UTC with milliseconds', () => {
            const record = base({ now: new Date(Date.UTC(2026, 8, 24, 1, 2, 3, 4)) });
            expect(record.timestamp).toBe('2026-09-24T01:02:03.004Z');
            expect(base().timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });

        it('writes the level upper-case, the message as a string and the logger name', () => {
            getLogger('integration.hubspot').warn('Contact skipped');
            expect(sink.records[0]).toMatchObject({
                level: 'WARN',
                message: 'Contact skipped',
                logger: 'integration.hubspot',
            });
            expect(Object.keys(sink.records[0]).slice(0, 4)).toEqual([
                'timestamp',
                'level',
                'message',
                'logger',
            ]);
        });

        it.each([[undefined], ['']])('uses frigg.unknown for getLogger(%p)', (name) => {
            getLogger(name).info('x');
            expect(sink.records[0].logger).toBe('frigg.unknown');
        });

        it('deep-freezes the record', () => {
            const record = base({ fields: { nested: { a: [1] } } });
            expect(Object.isFrozen(record)).toBe(true);
            expect(Object.isFrozen(record.nested.a)).toBe(true);
        });
    });

    describe('message', () => {
        it('turns an Error message into a sanitized message plus error', () => {
            const error = new TypeError('Bad thing');
            error.code = 'E_BAD';
            getLogger('integration.test').error(error);
            const record = sink.records[0];
            expect(record.message).toBe('Bad thing');
            expect(record.error).toMatchObject({ type: 'TypeError', message: 'Bad thing', code: 'E_BAD' });
        });

        it('keeps a call-site error when the message is also an Error', () => {
            getLogger('integration.test').error(new Error('as message'), { error: new Error('as field') });
            expect(sink.records[0].message).toBe('as message');
            expect(sink.records[0].error.message).toBe('as field');
        });

        it('turns an object message into [non-string message] plus value', () => {
            getLogger('integration.test').info({ count: 3 });
            expect(sink.records[0]).toMatchObject({ message: '[non-string message]', value: { count: 3 } });
        });

        it.each([[undefined], [null]])('turns %p into an empty message', (message) => {
            getLogger('integration.test').info(message);
            expect(sink.records[0].message).toBe('');
            expect(sink.records[0]).not.toHaveProperty('value');
        });

        it('scrubs the message', () => {
            getLogger('integration.test').info('Authorization: Bearer fakeBearerToken7Q2w9XzLm4Pv8Rt3');
            expect(sink.records[0].message).not.toContain('fakeBearerToken7Q2w9XzLm4Pv8Rt3');
        });

        it('cuts a long message', () => {
            getLogger('integration.test').info('word '.repeat(1000));
            expect(sink.records[0].message.length).toBeLessThan(2100);
        });
    });

    describe('resource fields', () => {
        it('takes appName and stage from env and omits them when absent', () => {
            withEnv({ FRIGG_STACK: 'acme', STAGE: 'prod' }, (s) => {
                getLogger('integration.test').info('x');
                expect(s.records[0]).toMatchObject({ appName: 'acme', stage: 'prod' });
            });
            withEnv({ FRIGG_STACK: undefined, STAGE: undefined }, (s) => {
                getLogger('integration.test').info('x');
                expect(s.records[0]).not.toHaveProperty('appName');
                expect(s.records[0]).not.toHaveProperty('stage');
            });
        });
    });

    describe('precedence', () => {
        it.each(['requestId', 'level', 'timestamp', 'logger', 'message'])(
            'drops a call-site %s that loses to the logger or the scope',
            (key) => {
                runInContext({ log: { requestId: 'r-scope' } }, () => {
                    getLogger('integration.test').info('real', { [key]: 'call-site' });
                });
                const record = sink.records[0];
                expect(record[key]).not.toBe('call-site');
                expect(record.droppedKeys).toEqual([key]);
            }
        );

        it('lets scope beat child bindings and child bindings beat call-site fields', () => {
            runInContext({ log: { requestId: 'r-scope' } }, () => {
                getLogger('integration.test')
                    .child({ requestId: 'r-child', processId: 'p-child' })
                    .info('x', { processId: 'p-call', externalId: 'e-call' });
            });
            expect(sink.records[0]).toMatchObject({
                requestId: 'r-scope',
                processId: 'p-child',
                externalId: 'e-call',
            });
            expect(sink.records[0].droppedKeys).toEqual(['requestId', 'processId']);
        });

        it('keeps a child requestId when no scope sets one', () => {
            getLogger('integration.test').child({ requestId: 'r-child' }).info('x');
            expect(sink.records[0].requestId).toBe('r-child');
            expect(sink.records[0]).not.toHaveProperty('droppedKeys');
        });

        it('drops resource and trace keys from call sites even when the logger has none', () => {
            withEnv({ FRIGG_STACK: undefined, STAGE: undefined }, (s) => {
                getLogger('integration.test').info('x', { stage: 'fake', trace_id: 'fake', droppedKeys: ['x'] });
                expect(s.records[0]).not.toHaveProperty('stage');
                expect(s.records[0]).not.toHaveProperty('trace_id');
                expect(s.records[0].droppedKeys).toEqual(['stage', 'trace_id', 'droppedKeys']);
            });
        });

        it('omits null and undefined fields', () => {
            getLogger('integration.test').info('x', { a: null, b: undefined, c: 0, d: false });
            expect(sink.records[0]).not.toHaveProperty('a');
            expect(sink.records[0]).not.toHaveProperty('b');
            expect(sink.records[0]).toMatchObject({ c: 0, d: false });
        });

        it('omits a scope id stored as null', () => {
            runInContext({ integrationId: null }, () => getLogger('integration.test').info('x'));
            expect(sink.records[0]).not.toHaveProperty('integrationId');
        });
    });

    describe('reserved keys', () => {
        it.each([
            'tenantId',
            'type',
            'time',
            'record',
            'errorType',
            'errorMessage',
            'stackTrace',
            'service',
            'env',
            'host',
            'source',
            'status',
            'severity',
        ])('never writes %s at the top level', (key) => {
            getLogger('integration.test').child({ [key]: 'b' }).info('x', { [key]: 'c' });
            expect(sink.records[0]).not.toHaveProperty(key);
            expect(sink.records[0].droppedKeys).toContain(key);
        });

        it('allows nested error.status and invocation.source', () => {
            const error = Object.assign(new Error('nope'), { statusCode: 404 });
            runInContext({ log: { invocation: { source: 'http', method: 'GET' } } }, () => {
                getLogger('integration.test').warn('x', { error });
            });
            expect(sink.records[0].error.status).toBe(404);
            expect(sink.records[0].invocation).toEqual({ source: 'http', method: 'GET' });
        });
    });

    describe('trace fields', () => {
        it('adds trace_id, span_id and a 2-char trace_flags when the provider returns a context', () => {
            runtime.setSpanContextProvider(() => ({
                traceId: 'a'.repeat(32),
                spanId: 'b'.repeat(16),
                traceFlags: 1,
            }));
            getLogger('integration.test').info('x');
            expect(sink.records[0]).toMatchObject({
                trace_id: 'a'.repeat(32),
                span_id: 'b'.repeat(16),
                trace_flags: '01',
            });
        });

        it.each([
            ['no provider', undefined],
            ['a null context', () => null],
            ['a throwing provider', () => { throw new Error('x'); }],
            ['an invalid context', () => ({ traceId: 5 })],
        ])('omits trace keys with %s', (_label, provider) => {
            if (provider) runtime.setSpanContextProvider(provider);
            getLogger('integration.test').info('x');
            for (const key of ['trace_id', 'span_id', 'trace_flags']) {
                expect(sink.records[0]).not.toHaveProperty(key);
            }
        });
    });

    describe('payload keys', () => {
        const fields = () => ({
            body: 'b',
            rawBody: 'rb',
            payload: { a: 1 },
            response: { status: 200 },
            error: Object.assign(new Error('x'), { response: { status: 500 } }),
        });

        it.each(['INFO', 'WARN', 'ERROR', 'FATAL'])('drops body, rawBody, payload and response at %s', (level) => {
            getLogger('integration.test')[level.toLowerCase()]('x', fields());
            const record = sink.records[0];
            for (const key of ['body', 'rawBody', 'payload', 'response']) {
                expect(record).not.toHaveProperty(key);
            }
            expect(record.droppedKeys).toEqual(['body', 'rawBody', 'payload', 'response']);
            expect(record.error.status).toBe(500);
        });

        it.each(['TRACE', 'DEBUG'])('keeps them at %s', (level) => {
            getLogger('integration.test')[level.toLowerCase()]('x', fields());
            expect(sink.records[0]).toMatchObject({ body: 'b', rawBody: 'rb', payload: { a: 1 } });
            expect(sink.records[0].response).toEqual({ status: 200 });
        });
    });

    describe('redaction of fields', () => {
        it('redacts denied keys in call-site fields and bindings', () => {
            getLogger('integration.test')
                .child({ apiKey: 'fakeFriggHeaderKey3Jm7Tq9Vx2Np' })
                .info('x', { access_token: 'fakeAccessToken1Kx7Ns4Gv9Rb2', nested: { password: 'fakeLoginPassword4Tg7Bn2Vc9Ls' } });
            const text = JSON.stringify(sink.records[0]);
            expect(text).not.toContain('fakeFriggHeaderKey3Jm7Tq9Vx2Np');
            expect(text).not.toContain('fakeAccessToken1Kx7Ns4Gv9Rb2');
            expect(text).not.toContain('fakeLoginPassword4Tg7Bn2Vc9Ls');
        });

        it('replaces a throwing field getter and keeps the other fields', () => {
            const fields = { ok: 1 };
            Object.defineProperty(fields, 'bad', { enumerable: true, get: () => { throw new Error('x'); } });
            getLogger('integration.test').info('x', fields);
            expect(sink.records[0].ok).toBe(1);
            expect(sink.records[0].bad).toBe('[Getter threw]');
        });
    });

    describe('size cap', () => {
        const chunk = (n) => 'lorem ipsum '.repeat(Math.ceil(n / 12)).slice(0, n);

        it('drops call-site fields largest-first until the record fits', () => {
            const fields = {};
            for (let i = 0; i < 12; i += 1) fields[`f${i}`] = chunk(2000);
            fields.small = 'keep me';
            getLogger('integration.test').info('big', fields);
            const record = sink.records[0];
            expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(MAX_RECORD_BYTES);
            expect(record.small).toBe('keep me');
            expect(record.droppedKeys.length).toBeGreaterThan(0);
            expect(record.droppedKeys.every((k) => k.startsWith('f'))).toBe(true);
        });

        const makeHuge = (depth) => {
            const error = new Error(chunk(2000));
            error.stack = `Error: x\n${'    at frame (file.js:1:1)\n'.repeat(600)}`;
            if (depth > 0) error.cause = makeHuge(depth - 1);
            return error;
        };

        it('then drops error.stack when the call-site fields are gone', () => {
            getLogger('integration.test')
                .child({ note: chunk(1500) })
                .error('huge', { error: makeHuge(3), extra: chunk(2000) });
            const record = sink.records[0];
            expect(record.message).toBe('huge');
            expect(record.droppedKeys).toEqual(['extra']);
            expect(record.error).not.toHaveProperty('stack');
            expect(record.error).toHaveProperty('cause');
            expect(record.error.type).toBe('Error');
            expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(MAX_RECORD_BYTES);
        });

        it('then drops error.cause, and always emits the record', () => {
            getLogger('integration.test')
                .child({ a: chunk(2000), b: chunk(2000), c: chunk(2000) })
                .error('huge', { error: makeHuge(3) });
            const record = sink.records[0];
            expect(record.error).not.toHaveProperty('stack');
            expect(record.error).not.toHaveProperty('cause');
            expect(record.error.message.length).toBeGreaterThan(0);
        });

        it('emits an over-cap record when bindings alone exceed the cap', () => {
            const bindings = {};
            for (let i = 0; i < 10; i += 1) bindings[`b${i}`] = chunk(2000);
            getLogger('integration.test').child(bindings).info('still here');
            expect(sink.records).toHaveLength(1);
            expect(sink.records[0].message).toBe('still here');
        });

        it('keeps scope and bindings over call-site fields when it cuts', () => {
            runInContext({ log: { requestId: 'r-1' } }, () => {
                getLogger('integration.test').child({ processId: 'p-1' }).info('x', {
                    a: chunk(2000), b: chunk(2000), c: chunk(2000), d: chunk(2000),
                    e: chunk(2000), f: chunk(2000), g: chunk(2000), h: chunk(2000), i: chunk(2000),
                });
            });
            expect(sink.records[0]).toMatchObject({ requestId: 'r-1', processId: 'p-1' });
        });
    });

    describe('violations', () => {
        it('writes a frigg.* WARN without eventName and returns it from takeViolationsForTests', () => {
            getLogger('frigg.core.sync').warn('missing name');
            expect(sink.records).toHaveLength(1);
            expect(runtime.takeViolationsForTests()).toHaveLength(1);
        });

        it('does not flag integration.* loggers', () => {
            getLogger('integration.hubspot').warn('fine');
            expect(runtime.takeViolationsForTests()).toEqual([]);
        });
    });
});
