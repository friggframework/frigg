const { debug, initDebugLog, flushDebugLog } = require('./logger');
const chai = require('chai');
const sinon = require('sinon');
const {
    mockEnvironment,
    restoreEnvironment,
} = require('../../test/utils/mockEnvironment');

const { expect } = chai;

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

        expect(console.debug).to.have.property('callCount', 2);
        expect(console.error).to.have.property('callCount', 1);
    });

    it('logs immediately when environment variable set', () => {
        mockEnvironment({ DEBUG_VERBOSE: '1' });

        debug('Add a message', 'or two', { or: 3 });
        debug('And another');

        expect(console.debug).to.have.property('callCount', 2);
        expect(console.error).to.have.property('callCount', 0);
    });

    it('is resilient to missing parameters', () => {
        initDebugLog();
        debug();
        flushDebugLog();

        expect(console.debug).to.have.property('callCount', 0);
        expect(console.error).to.have.property('callCount', 1);
    });

    it('outputs parent errors', () => {
        initDebugLog();

        const error = new Error();
        error.cause = new Error();
        error.cause.cause = new Error();
        error.cause.cause.cause = new Error();

        flushDebugLog(error);

        expect(console.debug).to.have.property('callCount', 0);
        expect(console.error).to.have.property('callCount', 7); // 1 + 2 for each cause
    });

    it('adds a debug message if more than 1 error encountered', () => {
        initDebugLog();
        flushDebugLog(new Error());

        expect(console.debug).to.have.property('callCount', 0);
        expect(console.error).to.have.property('callCount', 1);

        flushDebugLog(new Error());

        expect(console.debug).to.have.property('callCount', 1);
        expect(console.error).to.have.property('callCount', 2);
    });
});
