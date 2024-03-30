const { debug, initDebugLog, flushDebugLog } = require('./logger');
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
});
