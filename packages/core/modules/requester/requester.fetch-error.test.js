const util = require('node:util');
const { Requester } = require('./requester');
const { FetchError } = require('../../errors');
const { SECRETS } = require('../../logs/__fixtures__/secrets');
const { toContainNoSecretWindow } = require('../../logs/__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

class TestRequester extends Requester {
    async addAuthHeaders(headers) {
        return { ...headers, Authorization: `Bearer ${SECRETS.bearer}` };
    }
}

const url = `https://api.example.com/v1/items?api_key=${SECRETS.apiKeyQuery}`;
const sanitizedUrl = 'https://api.example.com/v1/items?api_key=REDACTED';

function jsonResponse({ status = 200, json, text } = {}) {
    return {
        status,
        bodyUsed: false,
        headers: {
            get: () => 'application/json',
            [Symbol.iterator]: function* () {
                yield ['content-type', 'application/json'];
            },
        },
        json: json ?? (async () => ({})),
        text:
            text ??
            (async () => `{"access_token":"${SECRETS.accessToken}"}`),
    };
}

function nodeFetchError(message, type, extra = {}) {
    const err = new Error(message);
    err.name = 'FetchError';
    err.type = type;
    return Object.assign(err, extra);
}

function makeRequester(fetch, params = {}) {
    return new TestRequester({
        backOff: [],
        requestTimeoutMs: 0,
        fetch,
        ...params,
    });
}

describe('Requester FetchError boundary', () => {
    it('wraps a network error in a sanitized FetchError with the cause', async () => {
        const cause = nodeFetchError(
            `request to ${url} failed, reason: socket hang up`,
            'system',
            { code: 'ECONNRESET', errno: 'ECONNRESET' }
        );
        const requester = makeRequester(jest.fn().mockRejectedValue(cause));

        const error = await requester._get({ url }).catch((e) => e);

        expect(error).toBeInstanceOf(FetchError);
        expect(error.cause).not.toBe(cause);
        expect(error.cause).toMatchObject({
            name: 'FetchError',
            code: 'ECONNRESET',
            errno: 'ECONNRESET',
            type: 'system',
        });
        expect(error.cause.message).toBe(
            `request to ${sanitizedUrl} failed, reason: socket hang up`
        );
        expect(error.message).toBe(`GET ${sanitizedUrl} ECONNRESET`);
        expect(error.statusCode).toBeUndefined();
        expect(error.message).toContainNoSecretWindow(SECRETS);
    });

    it('leaks no secret through util.inspect or the stack', async () => {
        const cause = nodeFetchError(
            `request to ${url} failed, reason: Authorization: Bearer ${SECRETS.bearer}`,
            'system',
            { code: 'ECONNRESET' }
        );
        const requester = makeRequester(jest.fn().mockRejectedValue(cause));

        const error = await requester._get({ url }).catch((e) => e);

        expect(util.inspect(error, { depth: 10 })).toContainNoSecretWindow(SECRETS);
        expect(String(error.stack)).toContainNoSecretWindow(SECRETS);
        expect(String(error.cause.stack)).toContainNoSecretWindow(SECRETS);
        expect(error.stack.split('\n')[0]).toContain(sanitizedUrl);
    });

    it('keeps isTimeout and timeoutMs on a header-phase timeout', async () => {
        jest.useFakeTimers();
        try {
            const fetch = jest.fn(
                (_u, options) =>
                    new Promise((_resolve, reject) => {
                        options.signal.addEventListener('abort', () => {
                            const err = new Error('The user aborted a request.');
                            err.name = 'AbortError';
                            reject(err);
                        });
                    })
            );
            const requester = makeRequester(fetch, { requestTimeoutMs: 100 });
            const p = requester._get({ url });
            p.catch(() => {});
            await jest.advanceTimersByTimeAsync(101);
            const error = await p.catch((e) => e);

            expect(error).toBeInstanceOf(FetchError);
            expect(error).toMatchObject({ isTimeout: true, timeoutMs: 100 });
            expect(error.message).toBe(`GET ${sanitizedUrl} AbortError`);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps the status on a 4xx and does not wrap twice', async () => {
        const requester = makeRequester(
            jest.fn().mockResolvedValue(jsonResponse({ status: 404 }))
        );

        const error = await requester._get({ url }).catch((e) => e);

        expect(error).toBeInstanceOf(FetchError);
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe(`GET ${sanitizedUrl} 404`);
        expect(error.cause).toBeUndefined();
        expect(error.message).toContainNoSecretWindow(SECRETS);
    });

    it('gives the invalid-auth delegate the sanitized FetchError', async () => {
        const delegate = { receiveNotification: jest.fn() };
        const requester = makeRequester(
            jest.fn().mockResolvedValue(jsonResponse({ status: 401 })),
            { delegate }
        );

        const error = await requester._get({ url }).catch((e) => e);

        expect(delegate.receiveNotification).toHaveBeenCalledWith(
            requester,
            requester.DLGT_INVALID_AUTH,
            error
        );
        expect(error).toBeInstanceOf(FetchError);
        expect(error.message).toBe(`GET ${sanitizedUrl} 401`);
        expect(error.message).toContainNoSecretWindow(SECRETS);
    });

    it('rethrows a node-fetch error from parsedBody as a FetchError with the cause', async () => {
        const cause = nodeFetchError(
            `invalid json response body at ${url} reason: Unexpected token`,
            'invalid-json'
        );
        const requester = makeRequester(
            jest.fn().mockResolvedValue(
                jsonResponse({ json: () => Promise.reject(cause) })
            )
        );

        const error = await requester._get({ url }).catch((e) => e);

        expect(error).toBeInstanceOf(FetchError);
        expect(error.cause).toMatchObject({ name: 'FetchError', type: 'invalid-json' });
        expect(util.inspect(error, { depth: 10 })).toContainNoSecretWindow(SECRETS);
        expect(error.message).toBe(`GET ${sanitizedUrl} FetchError`);
        expect(error.message).toContainNoSecretWindow(SECRETS);
        expect(error.isTimeout).toBeUndefined();
    });

    it('keeps isTimeout when the abort fires during the body read', async () => {
        jest.useFakeTimers();
        try {
            const fetch = jest.fn(async (_u, options) =>
                jsonResponse({
                    json: () =>
                        new Promise((_resolve, reject) => {
                            options.signal.addEventListener('abort', () => {
                                const err = new Error('aborted mid-body');
                                err.name = 'AbortError';
                                err.type = 'aborted';
                                reject(err);
                            });
                        }),
                })
            );
            const requester = makeRequester(fetch, { requestTimeoutMs: 100 });
            const p = requester._get({ url });
            p.catch(() => {});
            await jest.advanceTimersByTimeAsync(150);
            const error = await p.catch((e) => e);

            expect(error).toBeInstanceOf(FetchError);
            expect(error).toMatchObject({ isTimeout: true, timeoutMs: 100 });
            expect(error.cause.name).toBe('AbortError');
            expect(error.message).toBe(`GET ${sanitizedUrl} AbortError`);
        } finally {
            jest.useRealTimers();
        }
    });

    it('passes a non-fetch error from the body read through unchanged', async () => {
        const boom = new TypeError('parser bug');
        const requester = makeRequester(
            jest.fn().mockResolvedValue(
                jsonResponse({ json: () => Promise.reject(boom) })
            )
        );

        await expect(requester._get({ url })).rejects.toBe(boom);
    });
});
