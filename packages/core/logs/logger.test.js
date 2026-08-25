const {
    debug,
    initDebugLog,
    flushDebugLog,
    redactSensitive,
} = require('./logger');
const sinon = require('sinon');
const {
    overrideEnvironment,
    restoreEnvironment,
} = require('@friggframework/test');

/* eslint-disable no-console */

describe('Logger', () => {
    beforeEach(() => {
        sinon.stub(console, 'debug');
        sinon.stub(console, 'error');
    });

    afterEach(() => {
        console.debug.restore();
        console.error.restore();
        restoreEnvironment();
    });

    it('runs', () => {
        initDebugLog('Test Event', { test: true });
        debug('Add a message', 'or two', { or: 3 });
        flushDebugLog(new Error());

        expect(console.debug).toHaveProperty('callCount', 2);
        expect(console.error).toHaveProperty('callCount', 1);
    });

    it('logs immediately when environment variable set', () => {
        overrideEnvironment({ DEBUG_VERBOSE: '1' });

        debug('Add a message', 'or two', { or: 3 });
        debug('And another');

        expect(console.debug).toHaveProperty('callCount', 2);
        expect(console.error).toHaveProperty('callCount', 0);
    });

    it('is resilient to missing parameters', () => {
        initDebugLog();
        debug();
        flushDebugLog();

        expect(console.debug).toHaveProperty('callCount', 0);
        expect(console.error).toHaveProperty('callCount', 1);
    });

    it('outputs parent errors', () => {
        initDebugLog();

        const error = new Error();
        error.cause = new Error();
        error.cause.cause = new Error();
        error.cause.cause.cause = new Error();

        flushDebugLog(error);

        expect(console.debug).toHaveProperty('callCount', 0);
        expect(console.error).toHaveProperty('callCount', 7); // 1 + 2 for each cause
    });

    it('adds a debug message if more than 1 error encountered', () => {
        initDebugLog();
        flushDebugLog(new Error());

        expect(console.debug).toHaveProperty('callCount', 0);
        expect(console.error).toHaveProperty('callCount', 1);

        flushDebugLog(new Error());

        expect(console.debug).toHaveProperty('callCount', 1);
        expect(console.error).toHaveProperty('callCount', 2);
    });

    const printedDebug = () =>
        console.debug
            .getCalls()
            .map((c) => c.args.join(' '))
            .join('\n');

    describe('request-body redaction (ADR-034 §4)', () => {
        it('masks a JSON body apiKey buffered in the Lambda event, then dumped on error', () => {
            const event = {
                httpMethod: 'POST',
                path: '/user/login',
                headers: { authorization: 'Bearer sk_live_leak_me' },
                body: JSON.stringify({
                    apiKey: 'super-secret-key-value',
                    module: 'reevo',
                }),
            };

            initDebugLog('User', event);
            flushDebugLog(new Error('boom'));

            const printed = printedDebug();
            expect(printed).not.toContain('super-secret-key-value');
            expect(printed).not.toContain('sk_live_leak_me');
            expect(printed).toContain('[REDACTED]');
            // Non-sensitive fields survive.
            expect(printed).toContain('reevo');
        });

        it('masks a password body too (protects the friggToken path)', () => {
            initDebugLog('User', {
                body: JSON.stringify({
                    username: 'alice',
                    password: 'hunter2',
                }),
            });
            flushDebugLog(new Error());

            const printed = printedDebug();
            expect(printed).not.toContain('hunter2');
            expect(printed).toContain('alice');
            expect(printed).toContain('[REDACTED]');
        });

        it('redacts under DEBUG_VERBOSE=1 (immediate console path)', () => {
            overrideEnvironment({ DEBUG_VERBOSE: '1' });

            initDebugLog('User', {
                body: JSON.stringify({ apiKey: 'verbose-secret' }),
            });

            const printed = printedDebug();
            expect(printed).not.toContain('verbose-secret');
            expect(printed).toContain('[REDACTED]');
        });

        it('never throws on a non-JSON / form-urlencoded body, and still masks it', () => {
            expect(() => {
                initDebugLog('User', {
                    body: 'not-json&apiKey=urlencoded-leak&x=1',
                });
                flushDebugLog(new Error());
            }).not.toThrow();

            const printed = printedDebug();
            expect(printed).not.toContain('urlencoded-leak');
        });

        it('never throws on a circular event object', () => {
            const event = { body: JSON.stringify({ apiKey: 'x' }) };
            event.self = event; // circular
            expect(() => {
                initDebugLog('User', event);
                flushDebugLog(new Error());
            }).not.toThrow();
        });
    });

    describe('redactSensitive (unit)', () => {
        it('masks denylisted keys anywhere in the structure and does not mutate the input', () => {
            const input = {
                access_token: 'a',
                nested: { refresh_token: 'r', keep: 'ok' },
                list: [{ token: 't' }],
            };
            const out = redactSensitive(input);

            expect(out.access_token).toBe('[REDACTED]');
            expect(out.nested.refresh_token).toBe('[REDACTED]');
            expect(out.nested.keep).toBe('ok');
            expect(out.list[0].token).toBe('[REDACTED]');
            // Original is untouched (deep clone).
            expect(input.access_token).toBe('a');
        });

        it('passes non-object values through unchanged', () => {
            expect(redactSensitive('User')).toBe('User');
            expect(redactSensitive(42)).toBe(42);
            expect(redactSensitive(null)).toBe(null);
        });
    });
});
