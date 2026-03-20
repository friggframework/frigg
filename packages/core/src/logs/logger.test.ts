import { debug, initDebugLog, flushDebugLog } from './logger';
import sinon from 'sinon';
import {
    overrideEnvironment,
    restoreEnvironment,
} from '@friggframework/test';

/* eslint-disable no-console */

describe('Logger', () => {
    beforeEach(() => {
        sinon.stub(console, 'debug');
        sinon.stub(console, 'error');
    });

    afterEach(() => {
        (console.debug as sinon.SinonStub).restore();
        (console.error as sinon.SinonStub).restore();
        restoreEnvironment();
    });

    it('runs', () => {
        initDebugLog('Test Event', { test: true });
        debug('Add a message', 'or two', { or: 3 });
        flushDebugLog(new Error());

        expect((console.debug as sinon.SinonStub).callCount).toBe(2);
        expect((console.error as sinon.SinonStub).callCount).toBe(1);
    });

    it('logs immediately when environment variable set', () => {
        overrideEnvironment({ DEBUG_VERBOSE: '1' });

        debug('Add a message', 'or two', { or: 3 });
        debug('And another');

        expect((console.debug as sinon.SinonStub).callCount).toBe(2);
        expect((console.error as sinon.SinonStub).callCount).toBe(0);
    });

    it('is resilient to missing parameters', () => {
        initDebugLog();
        debug();
        flushDebugLog();

        expect((console.debug as sinon.SinonStub).callCount).toBe(0);
        expect((console.error as sinon.SinonStub).callCount).toBe(1);
    });

    it('outputs parent errors', () => {
        initDebugLog();

        const error = new Error();
        error.cause = new Error();
        (error.cause as Error).cause = new Error();
        ((error.cause as Error).cause as Error).cause = new Error();

        flushDebugLog(error);

        expect((console.debug as sinon.SinonStub).callCount).toBe(0);
        expect((console.error as sinon.SinonStub).callCount).toBe(7); // 1 + 2 for each cause
    });

    it('adds a debug message if more than 1 error encountered', () => {
        initDebugLog();
        flushDebugLog(new Error());

        expect((console.debug as sinon.SinonStub).callCount).toBe(0);
        expect((console.error as sinon.SinonStub).callCount).toBe(1);

        flushDebugLog(new Error());

        expect((console.debug as sinon.SinonStub).callCount).toBe(1);
        expect((console.error as sinon.SinonStub).callCount).toBe(2);
    });
});
