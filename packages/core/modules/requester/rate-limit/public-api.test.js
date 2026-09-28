const core = require('../../../index');
const { RateLimitError } = require('../../../errors');
const rateLimit = require('./index');
const deadline = require('../../../core/invocation-deadline');

describe('rate-limit public API', () => {
    it('exports the error class from the package root', () => {
        expect(core.RateLimitError).toBe(RateLimitError);
    });

    it.each([
        'classifyRateLimit',
        'parseRetryAfter',
        'parseResetHeaders',
        'parseIetfRateLimit',
    ])('exports %s from the package root', (name) => {
        expect(core[name]).toBe(rateLimit[name]);
    });

    it.each(['runWithInvocationDeadline', 'remainingInvocationMs'])(
        'exports %s from the package root',
        (name) => {
            expect(core[name]).toBe(deadline[name]);
        }
    );
});
