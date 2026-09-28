const { Requester } = require('./requester');
const { FetchError, RateLimitError } = require('../../errors');
const { createMemorySink } = require('../../logs');

class TestRequester extends Requester {
    async addAuthHeaders(headers) {
        return headers;
    }
}

const url = 'https://example.com/limited';

const response = (status, headers = {}) => ({
    status,
    bodyUsed: false,
    headers: new Map(
        Object.entries({ 'Content-Type': 'application/json', ...headers })
    ),
    json: async () => ({ ok: true }),
    text: async () => '{"ok":true}',
});
const throttled = (headers) => response(429, headers);
const ok = response(200);

const fetchReturning = (...responses) => {
    const queue = [...responses];
    return jest.fn(async () => queue.shift());
};

const makeDelegate = (receiveNotification = jest.fn()) => ({
    name: 'hubspot',
    receiveNotification,
});

const makeRequester = (fetch, params = {}, RequesterClass = TestRequester) =>
    new RequesterClass({ fetch, requestTimeoutMs: 0, ...params });

const withPolicy = (rateLimit) =>
    class PolicyRequester extends TestRequester {
        static rateLimit = rateLimit;
    };

let sink;

beforeEach(() => {
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, _delay, ...args) =>
        realSetTimeout(fn, 0, ...args)
    );
    sink = createMemorySink();
});

afterEach(() => jest.restoreAllMocks());

const notifyFailedRecords = () =>
    sink.records.filter(
        (record) =>
            record.eventName === 'module.hubspot.rate_limit_notify_failed'
    );

describe('Requester RATE_LIMITED delegate', () => {
    it('declares the delegate type', () => {
        const requester = makeRequester(jest.fn());

        expect(requester.DLGT_RATE_LIMITED).toBe('RATE_LIMITED');
        expect(requester.delegateTypes).toContain('RATE_LIMITED');
    });

    describe('when a wait is too long to sleep', () => {
        it('notifies the delegate once with the error it then throws', async () => {
            const delegate = makeDelegate();
            const fetch = fetchReturning(throttled({ 'Retry-After': '400' }));
            const requester = makeRequester(fetch, { delegate });

            const error = await requester._get({ url }).catch((e) => e);

            expect(error).toBeInstanceOf(RateLimitError);
            expect(delegate.receiveNotification).toHaveBeenCalledTimes(1);
            const [notifier, delegateString, payload] =
                delegate.receiveNotification.mock.calls[0];
            expect(notifier).toBe(requester);
            expect(delegateString).toBe('RATE_LIMITED');
            expect(payload).toBe(error);
        });

        it('notifies for a limit that classify named on a 403', async () => {
            const delegate = makeDelegate();
            const Api = withPolicy({
                classify: () => ({ reason: 'daily', waitMs: 400_000 }),
            });
            const fetch = fetchReturning(response(403));

            const error = await makeRequester(fetch, { delegate }, Api)
                ._get({ url })
                .catch((e) => e);

            expect(delegate.receiveNotification).toHaveBeenCalledTimes(1);
            expect(delegate.receiveNotification.mock.calls[0][2]).toBe(error);
            expect(error).toMatchObject({ reason: 'daily', statusCode: 403 });
        });

        it('waits for the delegate before it throws', async () => {
            const order = [];
            const delegate = makeDelegate(
                jest.fn(async () => {
                    await Promise.resolve();
                    order.push('notified');
                })
            );
            const fetch = fetchReturning(throttled({ 'Retry-After': '400' }));

            await makeRequester(fetch, { delegate })
                ._get({ url })
                .catch(() => order.push('thrown'));

            expect(order).toEqual(['notified', 'thrown']);
        });

        it('throws the same error and writes one WARN when the notification fails', async () => {
            const delegate = makeDelegate(
                jest.fn().mockRejectedValue(new Error('db down'))
            );
            const fetch = fetchReturning(throttled({ 'Retry-After': '400' }));

            const error = await makeRequester(fetch, { delegate })
                ._get({ url })
                .catch((e) => e);

            expect(error).toBeInstanceOf(RateLimitError);
            expect(error).toMatchObject({
                isRateLimited: true,
                statusCode: 429,
                waitMs: 400_000,
            });
            expect(notifyFailedRecords()).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    statusCode: 429,
                    error: expect.objectContaining({ message: 'db down' }),
                }),
            ]);
        });

        it('throws the error without a WARN when no delegate is wired', async () => {
            const fetch = fetchReturning(throttled({ 'Retry-After': '400' }));

            const error = await makeRequester(fetch)
                ._get({ url })
                .catch((e) => e);

            expect(error).toBeInstanceOf(RateLimitError);
            expect(notifyFailedRecords()).toEqual([]);
        });
    });

    describe('when the request goes on or fails for another reason', () => {
        it('does not notify for a wait that fits, which is slept and retried', async () => {
            const delegate = makeDelegate();
            const fetch = fetchReturning(throttled({ 'Retry-After': '5' }), ok);

            const result = await makeRequester(fetch, { delegate })._get({
                url,
            });

            expect(result).toEqual({ ok: true });
            expect(delegate.receiveNotification).not.toHaveBeenCalled();
        });

        it('does not notify for a bare 429 that used the whole ladder', async () => {
            const delegate = makeDelegate();
            const fetch = fetchReturning(...Array(7).fill(throttled()));

            const error = await makeRequester(fetch, { delegate })
                ._get({ url })
                .catch((e) => e);

            expect(error).toBeInstanceOf(FetchError);
            expect(error.isRateLimited).toBeUndefined();
            expect(delegate.receiveNotification).not.toHaveBeenCalled();
        });

        it('does not notify for a 403 that classify does not recognise', async () => {
            const delegate = makeDelegate();
            const Api = withPolicy({ classify: () => null });
            const fetch = fetchReturning(response(403));

            const error = await makeRequester(fetch, { delegate }, Api)
                ._get({ url })
                .catch((e) => e);

            expect(error).toBeInstanceOf(FetchError);
            expect(delegate.receiveNotification).not.toHaveBeenCalled();
        });

        it('does not notify for a 5xx that outlasts the ladder', async () => {
            const delegate = makeDelegate();
            const fetch = fetchReturning(...Array(7).fill(response(500)));

            const error = await makeRequester(fetch, { delegate })
                ._get({ url })
                .catch((e) => e);

            expect(error).toBeInstanceOf(FetchError);
            expect(delegate.receiveNotification).not.toHaveBeenCalled();
        });
    });
});
