const { FetchError } = require('./fetch-error');
const { SECRETS } = require('../logs/__fixtures__/secrets');
const { toContainNoSecretWindow } = require('../logs/__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

function withStage(stage, fn) {
    const previous = process.env.STAGE;
    if (stage === undefined) delete process.env.STAGE;
    else process.env.STAGE = stage;
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            if (previous === undefined) delete process.env.STAGE;
            else process.env.STAGE = previous;
        });
}

function secretResponse(status = 500) {
    return {
        status,
        statusText: 'Space aliens!',
        headers: Object.entries({
            'set-cookie': `session=${SECRETS.cookie}`,
            'x-request-id': 'abc',
        }),
        text: async () => `{"access_token":"${SECRETS.accessToken}"}`,
    };
}

function secretInit() {
    return {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRETS.bearer}` },
        body: `client_secret=${SECRETS.clientSecret}`,
    };
}

const secretUrl = `https://user:${SECRETS.password}@api.example.com/v1/items?api_key=${SECRETS.apiKeyQuery}&page=2`;

describe('FetchError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new FetchError();
        expect(error).toHaveProperty('message');
        expect(error).not.toHaveProperty('cause');
    });

    it('can be created asynchronously with default values', async () => {
        const error = await FetchError.create();
        expect(error).toHaveProperty('message');
        expect(error).not.toHaveProperty('cause');
    });

    it.each(['dev', 'prod', 'local', undefined])(
        'builds the message from method, sanitized URL and status (STAGE=%s)',
        (stage) =>
            withStage(stage, async () => {
                const error = await FetchError.create({
                    resource: secretUrl,
                    init: secretInit(),
                    response: secretResponse(500),
                });

                expect(error.message).toBe(
                    'POST https://api.example.com/v1/items?api_key=REDACTED&page=REDACTED 500'
                );
                expect(error.message).toContainNoSecretWindow(SECRETS);
                expect(error.stack).toContainNoSecretWindow(SECRETS);
                expect(error.message).not.toContain('x-request-id');
                expect(error.message).not.toContain('Space aliens');
            })
    );

    it('defaults the method to GET', () => {
        const error = new FetchError({
            resource: 'http://example.com',
            response: { status: 404 },
        });
        expect(error.message).toBe('GET http://example.com 404');
    });

    it('has no trailing status when there is no response', () => {
        const error = new FetchError({ resource: 'https://h.example/p' });
        expect(error.message).toBe('GET https://h.example/p');
    });

    it('uses the cause code, or the cause name, when there is no response', () => {
        const reset = Object.assign(new Error('socket hang up'), {
            code: 'ECONNRESET',
        });
        const aborted = new Error('aborted');
        aborted.name = 'AbortError';

        expect(
            new FetchError({ resource: 'https://h.example/p', cause: reset })
                .message
        ).toBe('GET https://h.example/p ECONNRESET');
        expect(
            new FetchError({ resource: 'https://h.example/p', cause: aborted })
                .message
        ).toBe('GET https://h.example/p AbortError');
    });

    it('keeps the cause on error.cause', () => {
        const cause = new Error(`request to ${secretUrl} failed`);
        const error = new FetchError({ resource: secretUrl, cause });
        expect(error.cause).toBe(cause);
    });

    it('makes response and body non-enumerable but readable', async () => {
        const response = secretResponse(401);
        const error = await FetchError.create({
            resource: secretUrl,
            init: secretInit(),
            response,
        });

        expect(error.response).toBe(response);
        expect(error.body).toBe(`{"access_token":"${SECRETS.accessToken}"}`);
        expect(Object.keys(error)).not.toContain('response');
        expect(Object.keys(error)).not.toContain('body');
        expect(Object.keys(error)).toEqual(
            expect.arrayContaining(['statusCode', 'method', 'url'])
        );
        expect(error.method).toBe('POST');
        expect(error.url).toBe(
            'https://api.example.com/v1/items?api_key=REDACTED&page=REDACTED'
        );
        expect({ ...error }).toContainNoSecretWindow(SECRETS);
        expect(JSON.stringify(error)).toContainNoSecretWindow(SECRETS);
    });

    it('has no responseBody or init own property', () => {
        const error = new FetchError({
            resource: secretUrl,
            init: secretInit(),
            responseBody: 'x',
        });
        expect(Object.getOwnPropertyNames(error)).not.toContain('responseBody');
        expect(Object.getOwnPropertyNames(error)).not.toContain('init');
        expect(error.body).toBe('x');
    });

    it('accepts body as an alias of responseBody', () => {
        expect(new FetchError({ body: { ok: false } }).body).toEqual({
            ok: false,
        });
    });

    it('does not mutate init.body URLSearchParams', () => {
        const params = new URLSearchParams({
            client_secret: SECRETS.clientSecret,
        });
        const init = { method: 'POST', body: params };
        const error = new FetchError({ resource: 'https://h.example', init });
        expect(init.body).toBe(params);
        expect(error.message).toContainNoSecretWindow(SECRETS);
    });

    it.each([
        ['Headers', () => new Headers({ a: 'b' })],
        ['entries array', () => [['a', 'b']]],
        ['plain object', () => ({ a: 'b' })],
        ['get-only object', () => ({ get: () => 'b' })],
        ['undefined', () => undefined],
    ])('constructs with response headers as %s', (_label, makeHeaders) => {
        const error = new FetchError({
            resource: 'https://h.example',
            response: { status: 500, headers: makeHeaders() },
        });
        expect(error.message).toBe('GET https://h.example 500');
    });

    it('create() reads the body when unused and stores it non-enumerable', async () => {
        const text = jest.fn(async () => 'provider said no');
        const error = await FetchError.create({
            resource: 'https://h.example',
            response: { status: 400, bodyUsed: false, text },
        });
        expect(text).toHaveBeenCalledTimes(1);
        expect(error.body).toBe('provider said no');
        expect(Object.keys(error)).not.toContain('body');
    });

    it('create() skips a used body and falls back to options.body', async () => {
        const text = jest.fn();
        const error = await FetchError.create({
            response: { status: 400, bodyUsed: true, text },
            body: 'fallback',
        });
        expect(text).not.toHaveBeenCalled();
        expect(error.body).toBe('fallback');
    });

    it('create() propagates a rejected body read', async () => {
        const aborted = new Error('aborted mid-body');
        aborted.name = 'AbortError';
        await expect(
            FetchError.create({
                response: { status: 500, text: () => Promise.reject(aborted) },
            })
        ).rejects.toBe(aborted);
    });

    it('exposes statusCode property from response.status', async () => {
        const response = {
            status: 401,
            statusText: 'Unauthorized',
            headers: Object.entries({ 'content-type': 'application/json' }),
            text: async () => '{"error": "Invalid token"}',
        };

        const error = await FetchError.create({
            resource: 'https://api.example.com/data',
            init: { method: 'GET' },
            response,
        });

        expect(error).toHaveProperty('statusCode');
        expect(error.statusCode).toBe(401);
        expect(error.statusCode).toBe(error.response.status);
    });

    it('statusCode is undefined when response is null', async () => {
        const error = await FetchError.create({
            resource: 'https://api.example.com/data',
            init: { method: 'GET' },
            response: null,
        });

        expect(error.statusCode).toBeUndefined();
    });
});
