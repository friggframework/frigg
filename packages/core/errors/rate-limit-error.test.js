const util = require('node:util');
const { BaseError } = require('./base-error');
const { FetchError } = require('./fetch-error');
const errors = require('./index');
const { RateLimitError } = require('./rate-limit-error');
const { serializeError } = require('../logs');
const { SECRETS } = require('../logs/__fixtures__/secrets');
const { toContainNoSecretWindow } = require('../logs/__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

const NOW = Date.parse('2026-09-28T12:00:00.000Z');

const secretUrl = `https://user:${SECRETS.password}@api.example.com/v1/items?api_key=${SECRETS.apiKeyQuery}&page=2`;
const sanitizedUrl =
    'https://api.example.com/v1/items?api_key=REDACTED&page=REDACTED';

function secretInit() {
    return {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRETS.bearer}` },
        body: `client_secret=${SECRETS.clientSecret}`,
    };
}

function throttledResponse(overrides = {}) {
    return {
        status: 429,
        bodyUsed: false,
        text: jest.fn(async () => `{"access_token":"${SECRETS.accessToken}"}`),
        ...overrides,
    };
}

const hint = {
    waitMs: 5_000,
    retryAt: new Date(NOW + 5_000),
    reason: 'daily',
    policy: 'DAILY',
    source: 'header',
};

describe('RateLimitError', () => {
    it('is a FetchError and a BaseError named RateLimitError', () => {
        const error = new RateLimitError({ hint, now: NOW });
        expect(error).toBeInstanceOf(FetchError);
        expect(error).toBeInstanceOf(BaseError);
        expect(error.name).toBe('RateLimitError');
    });

    it('is exported from the errors index', () => {
        expect(errors.RateLimitError).toBe(RateLimitError);
    });

    it('can be built with no arguments', () => {
        const error = new RateLimitError();
        expect(error.isRateLimited).toBe(true);
        expect(error.waitMs).toBe(0);
        expect(error.reason).toBe('unknown');
        expect(error.source).toBe('unknown');
    });

    it('flags itself as rate limited', () => {
        expect(new RateLimitError({ hint }).isRateLimited).toBe(true);
    });

    describe('retryAt and waitMs', () => {
        it('counts a given waitMs from now', () => {
            const error = new RateLimitError({ hint, waitMs: 8_000, now: NOW });
            expect(error.waitMs).toBe(8_000);
            expect(error.retryAt).toEqual(new Date(NOW + 8_000));
        });

        it('keeps the retryAt of the hint when no waitMs is given', () => {
            const error = new RateLimitError({ hint, now: NOW + 1_000 });
            expect(error.retryAt).toEqual(hint.retryAt);
            expect(error.waitMs).toBe(4_000);
        });

        it('waits 0 ms when the retryAt of the hint has passed', () => {
            const error = new RateLimitError({ hint, now: NOW + 60_000 });
            expect(error.retryAt).toEqual(hint.retryAt);
            expect(error.waitMs).toBe(0);
        });

        it('uses the waitMs of a hint that has no retryAt', () => {
            const error = new RateLimitError({
                hint: { waitMs: 2_000 },
                now: NOW,
            });
            expect(error.waitMs).toBe(2_000);
            expect(error.retryAt).toEqual(new Date(NOW + 2_000));
        });

        it('ignores a retryAt that is not a valid date', () => {
            const error = new RateLimitError({
                hint: { retryAt: 'never', waitMs: 3_000 },
                now: NOW,
            });
            expect(error.waitMs).toBe(3_000);
            expect(error.retryAt).toEqual(new Date(NOW + 3_000));
        });

        it('reads the clock when no time is given', () => {
            const before = Date.now();
            const error = new RateLimitError({ waitMs: 1_000 });
            expect(error.retryAt.getTime()).toBeGreaterThanOrEqual(
                before + 1_000
            );
        });
    });

    describe('fields', () => {
        it('carries the reason, policy, source, module and scope key', async () => {
            const error = await RateLimitError.create({
                resource: secretUrl,
                init: secretInit(),
                response: throttledResponse(),
                hint,
                waitMs: 5_000,
                module: 'hubspot',
                scopeKey: 'hubspot:entity:7',
            });
            expect(error).toMatchObject({
                isRateLimited: true,
                statusCode: 429,
                method: 'POST',
                url: sanitizedUrl,
                waitMs: 5_000,
                reason: 'daily',
                policy: 'DAILY',
                source: 'header',
                module: 'hubspot',
                scopeKey: 'hubspot:entity:7',
            });
            expect(error.retryAt).toBeInstanceOf(Date);
            expect(error.message).toBe(`POST ${sanitizedUrl} 429`);
        });

        it('does not put the hint in the enumerable fields', () => {
            const error = new RateLimitError({ hint });
            expect(Object.keys(error)).not.toContain('hint');
            expect(Object.keys(error)).not.toContain('hints');
        });
    });

    describe('create()', () => {
        it('reads the body once and keeps it out of the enumerable fields', async () => {
            const response = throttledResponse();
            const error = await RateLimitError.create({
                resource: 'https://h.example',
                response,
                hint,
            });
            expect(response.text).toHaveBeenCalledTimes(1);
            expect(error).toBeInstanceOf(RateLimitError);
            expect(error.body).toContain('access_token');
            expect(Object.keys(error)).not.toContain('body');
        });

        it('does not read the stream when the body was read already', async () => {
            const response = throttledResponse();
            const error = await RateLimitError.create({
                resource: 'https://h.example',
                response,
                responseBody: '{"policyName":"DAILY"}',
                hint,
            });
            expect(response.text).not.toHaveBeenCalled();
            expect(error.body).toBe('{"policyName":"DAILY"}');
        });
    });

    describe('secrets', () => {
        it('leaves no secret in the message, the stack, util.inspect or JSON', async () => {
            const error = await RateLimitError.create({
                resource: secretUrl,
                init: secretInit(),
                response: throttledResponse(),
                hint,
                module: 'hubspot',
            });
            expect(error.message).toContainNoSecretWindow(SECRETS);
            expect(error.stack).toContainNoSecretWindow(SECRETS);
            expect(util.inspect(error, { depth: 5 })).toContainNoSecretWindow(
                SECRETS
            );
            expect(JSON.stringify(error)).toContainNoSecretWindow(SECRETS);
        });
    });

    describe('logging', () => {
        it('serializes with its own type and the status', async () => {
            const error = await RateLimitError.create({
                resource: 'https://h.example',
                response: throttledResponse(),
                hint,
            });
            expect(serializeError(error)).toMatchObject({
                type: 'RateLimitError',
                status: 429,
            });
        });
    });
});
