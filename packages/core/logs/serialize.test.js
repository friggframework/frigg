const {
    serializeValue,
    serializeError,
    toSanitizedSurrogate,
} = require('./serialize');
const { SECRETS } = require('./__fixtures__/secrets');
const { toContainNoSecretWindow } = require('./__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

function nest(levels, leaf) {
    let value = leaf;
    for (let i = 0; i < levels; i += 1) value = { next: value };
    return value;
}

describe('serializeError', () => {
    it('keeps exactly type, message, code, status, stack and cause', () => {
        const err = new Error('boom', { cause: new Error('inner') });
        err.code = 'E_X';
        err.statusCode = 502;
        err.config = { headers: { authorization: SECRETS.bearer } };
        err.requestBody = SECRETS.password;

        const out = serializeError(err);

        expect(Object.keys(out).sort()).toEqual(
            ['cause', 'code', 'message', 'stack', 'status', 'type'].sort()
        );
        expect(out).toContainNoSecretWindow(SECRETS);
    });

    it('omits code, status, stack and cause when absent', () => {
        const err = new Error('plain');
        delete err.stack;
        err.stack = undefined;
        expect(serializeError(err)).toEqual({ type: 'Error', message: 'plain' });
    });

    it('takes type from the constructor name, then name, then Error', () => {
        class ProviderError extends Error {}
        expect(serializeError(new ProviderError('x')).type).toBe(
            'ProviderError'
        );
        const aborted = new Error('x');
        aborted.name = 'AbortError';
        expect(serializeError(aborted).type).toBe('AbortError');
        const bare = Object.create(Error.prototype);
        Object.defineProperty(bare, 'constructor', { value: undefined });
        Object.defineProperty(bare, 'name', { value: '' });
        expect(serializeError(bare).type).toBe('Error');
    });

    it('reads status from statusCode, then status, then response.status', () => {
        const a = Object.assign(new Error('a'), { statusCode: 401, status: 500 });
        const b = Object.assign(new Error('b'), { status: 404 });
        const c = Object.assign(new Error('c'), { response: { status: 429 } });
        expect(serializeError(a).status).toBe(401);
        expect(serializeError(b).status).toBe(404);
        expect(serializeError(c).status).toBe(429);
    });

    it('rebuilds the stack header from the sanitized message', () => {
        const err = new Error(`GET https://h/p?api_key=${SECRETS.apiKeyQuery}`);
        const out = serializeError(err);
        expect(out.stack.split('\n')[0]).toBe(
            'Error: GET https://h/p?api_key=REDACTED'
        );
        expect(out.stack).toMatch(/\n\s+at /);
        expect(out).toContainNoSecretWindow([SECRETS.apiKeyQuery]);
    });

    it('drops a multi-line message tail from the stack header', () => {
        const err = new Error(`line one\nAuthorization: Bearer ${SECRETS.bearer}`);
        const out = serializeError(err);
        expect(out).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('follows cause to depth 3 and then writes [Depth]', () => {
        const d4 = new Error('d4');
        const d3 = new Error(`d3 Bearer ${SECRETS.bearer}`, { cause: d4 });
        const d2 = new Error('d2', { cause: d3 });
        const d1 = new Error('d1', { cause: d2 });
        const top = new Error('top', { cause: d1 });

        const out = serializeError(top);

        expect(out.cause.cause.cause.message).toBe(
            `d3 Bearer [REDACTED:${SECRETS.bearer.length}]`
        );
        expect(out.cause.cause.cause.cause).toBe('[Depth]');
    });

    it('writes [Circular] for a cause cycle', () => {
        const a = new Error('a');
        const b = new Error('b', { cause: a });
        a.cause = b;
        expect(serializeError(a).cause.cause).toBe('[Circular]');
    });

    it('normalizes non-Error causes', () => {
        const withString = new Error('x', { cause: `token ${SECRETS.jwt}` });
        const withObject = new Error('y', {
            cause: { token: SECRETS.accessToken },
        });
        expect(serializeError(withString).cause).toEqual({
            type: 'NonError',
            message: `token [REDACTED:${SECRETS.jwt.length}]`,
        });
        expect(serializeError(withObject).cause).toEqual({
            type: 'NonError',
            message: '{"token":"[REDACTED]"}',
        });
    });

    it('recurses into AggregateError.errors', () => {
        const agg = new AggregateError(
            [new Error(`one Bearer ${SECRETS.bearer}`), new TypeError('two')],
            'many'
        );
        const out = serializeError(agg);
        expect(out.type).toBe('AggregateError');
        expect(out.errors.map((e) => e.type)).toEqual(['Error', 'TypeError']);
        expect(out).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('keeps type, code and the last paragraph of a Prisma error', () => {
        class PrismaClientValidationError extends Error {}
        const err = new PrismaClientValidationError(
            `Invalid \`prisma.user.create()\` invocation:\n\n{\n  data: {\n    hashword: "${SECRETS.hashword}"\n  }\n}\n\nArgument \`email\` is missing.`
        );
        err.code = 'P2012';
        const out = serializeError(err);
        expect(out.type).toBe('PrismaClientValidationError');
        expect(out.code).toBe('P2012');
        expect(out.message).toBe('Argument `email` is missing.');
        expect(out).toContainNoSecretWindow([SECRETS.hashword]);
    });

    it.each([
        ['string', `oops Bearer ${SECRETS.bearer}`],
        ['number', 42],
        ['undefined', undefined],
        ['null', null],
    ])('turns a thrown %s into NonError', (_label, thrown) => {
        const out = serializeError(thrown);
        expect(out.type).toBe('NonError');
        expect(typeof out.message).toBe('string');
        expect(out).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('tolerates a throwing stack getter', () => {
        const err = new Error('x');
        Object.defineProperty(err, 'stack', {
            get() {
                throw new Error('no');
            },
        });
        expect(serializeError(err)).toEqual({ type: 'Error', message: 'x' });
    });
});

describe('serializeValue', () => {
    it('serializes an Error at any depth', () => {
        const out = serializeValue({ a: [{ err: new Error('deep') }] });
        expect(out.a[0].err).toMatchObject({ type: 'Error', message: 'deep' });
    });

    it('reduces a URL to its redacted form', () => {
        const url = new URL(
            `https://user:${SECRETS.password}@h.example/p?api_key=${SECRETS.apiKeyQuery}`
        );
        expect(serializeValue({ url })).toEqual({
            url: 'https://h.example/p?api_key=REDACTED',
        });
    });

    it('reduces Headers to names', () => {
        const headers = new Headers({ authorization: SECRETS.bearer, a: 'b' });
        expect(serializeValue({ h: headers })).toEqual({
            h: ['a', 'authorization'],
        });
    });

    it('reduces a Buffer to type and length', () => {
        expect(serializeValue(Buffer.from(SECRETS.password))).toEqual({
            type: 'Buffer',
            length: SECRETS.password.length,
        });
    });

    it('turns URLSearchParams into a redacted string', () => {
        const params = new URLSearchParams({
            client_secret: SECRETS.clientSecret,
            grant_type: 'x',
        });
        expect(serializeValue(params)).toBe(
            'client_secret=REDACTED&grant_type=REDACTED'
        );
    });

    it('walks Map and Set', () => {
        const out = serializeValue({
            m: new Map([
                ['token', SECRETS.accessToken],
                ['n', 1],
            ]),
            s: new Set(['a', 2]),
        });
        expect(out).toEqual({ m: { token: '[REDACTED]', n: 1 }, s: ['a', 2] });
    });

    it('turns BigInt, NaN and Infinity into strings', () => {
        expect(
            serializeValue({ b: 10n, n: NaN, i: Infinity, m: -Infinity })
        ).toEqual({ b: '10', n: 'NaN', i: 'Infinity', m: '-Infinity' });
    });

    it('drops symbols and functions', () => {
        expect(
            serializeValue({ s: Symbol('x'), f: () => 1, arr: [() => 1] })
        ).toEqual({ arr: [null] });
    });

    it('never calls an unknown toJSON', () => {
        const toJSON = jest.fn(() => ({ leaked: SECRETS.password }));
        const out = serializeValue({ v: { toJSON, safe: 1 } });
        expect(toJSON).not.toHaveBeenCalled();
        expect(out).toEqual({ v: { safe: 1 } });
    });

    it('writes a Date as ISO', () => {
        expect(serializeValue(new Date('2026-01-02T03:04:05.000Z'))).toBe(
            '2026-01-02T03:04:05.000Z'
        );
    });

    it('writes [Unserializable] for a Proxy whose ownKeys throws', () => {
        const hostile = new Proxy(
            {},
            {
                ownKeys() {
                    throw new Error('no keys');
                },
            }
        );
        expect(serializeValue({ hostile })).toEqual({
            hostile: '[Unserializable]',
        });
    });

    it('writes [Getter threw] for a throwing getter', () => {
        const value = {
            get bad() {
                throw new Error('x');
            },
            ok: 1,
        };
        expect(serializeValue(value)).toEqual({ bad: '[Getter threw]', ok: 1 });
    });

    it('writes [Circular] for a self-reference', () => {
        const value = { a: 1 };
        value.self = value;
        expect(serializeValue(value)).toEqual({ a: 1, self: '[Circular]' });
    });

    it('serializes a shared, non-circular reference twice', () => {
        const shared = { x: 1 };
        expect(serializeValue({ a: shared, b: shared })).toEqual({
            a: { x: 1 },
            b: { x: 1 },
        });
    });

    it('replaces the 7th nested level with [Depth]; arrays count', () => {
        expect(serializeValue(nest(6, 'leaf'))).toEqual(nest(6, 'leaf'));
        expect(serializeValue(nest(7, { x: 1 }))).toEqual(nest(6, '[Depth]'));
        const arrays = [[[[[[['deep']]]]]]];
        expect(serializeValue(arrays)).toEqual([[[[[['[Depth]']]]]]]);
    });

    it('scrubs strings, then cuts them at 2,048 chars', () => {
        const long = `${'x '.repeat(1500)}Bearer ${SECRETS.bearer} ${'y '.repeat(1000)}`;
        const out = serializeValue(long);
        expect(out).toHaveLength(2048);
        expect(out).toMatch(/…\[truncated:\d+\]$/);
        expect(out).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('keeps a string of exactly 2,048 chars', () => {
        const value = 'a '.repeat(1024);
        expect(serializeValue(value)).toBe(value);
    });

    it('never throws: 200 hostile shapes each yield a value', () => {
        const makers = [
            () => new Proxy({}, { get() { throw new Error('g'); } }),
            () => new Proxy({}, { ownKeys() { throw new Error('k'); } }),
            () => new Proxy([], { get() { throw new Error('a'); } }),
            () => {
                const o = {};
                Object.defineProperty(o, 'x', {
                    enumerable: true,
                    get() {
                        throw new Error('x');
                    },
                });
                return o;
            },
            () => Object.create(null),
            () => {
                const e = new Error('e');
                Object.defineProperty(e, 'message', {
                    get() {
                        throw new Error('m');
                    },
                });
                return e;
            },
            () => {
                const e = new Error('e');
                Object.defineProperty(e, 'cause', {
                    get() {
                        throw new Error('c');
                    },
                });
                return e;
            },
            () => ({ [Symbol('s')]: 1, n: 10n }),
            () => new Proxy(new Error('p'), { getPrototypeOf() { throw new Error('p'); } }),
            () => ({ headers: new Proxy({}, { ownKeys() { throw new Error('h'); } }) }),
        ];
        for (let i = 0; i < 200; i += 1) {
            const value = makers[i % makers.length]();
            expect(() => serializeValue({ value })).not.toThrow();
            expect(() => serializeError(value)).not.toThrow();
            expect(() => JSON.stringify(serializeValue({ value }))).not.toThrow();
        }
    });
});

describe('toSanitizedSurrogate', () => {
    it('returns a fresh Error with sanitized name, message, stack, code and statusCode', () => {
        class FetchLikeError extends Error {}
        const err = new FetchLikeError(`GET https://h/p?token=${SECRETS.accessToken}`);
        err.statusCode = 401;
        err.code = 'E_AUTH';
        err.response = { headers: { authorization: SECRETS.bearer } };

        const surrogate = toSanitizedSurrogate(err);

        expect(surrogate).toBeInstanceOf(Error);
        expect(surrogate).not.toBe(err);
        expect(surrogate.name).toBe('FetchLikeError');
        expect(surrogate.message).toBe('GET https://h/p?token=REDACTED');
        expect(surrogate.statusCode).toBe(401);
        expect(surrogate.code).toBe('E_AUTH');
        expect(surrogate.response).toBeUndefined();
        expect(surrogate.stack.split('\n')[0]).toBe(
            'FetchLikeError: GET https://h/p?token=REDACTED'
        );
        expect({
            m: surrogate.message,
            s: surrogate.stack,
        }).toContainNoSecretWindow(SECRETS);
    });

    it('handles a thrown non-Error', () => {
        const surrogate = toSanitizedSurrogate('plain');
        expect(surrogate.name).toBe('Error');
        expect(surrogate.message).toBe('plain');
    });
});
