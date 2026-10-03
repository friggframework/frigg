const {
    validateProxyRequest,
    resolveAllowRules,
    filterRequestHeaders,
    filterResponseHeaders,
    decodeResponseBody,
} = require('./proxy-policy');

const limits = { maxRequestBytes: 64 };
const codeOf = (fn) => {
    try {
        fn();
    } catch (error) {
        return error.code;
    }
    return undefined;
};

describe('entity proxy policy (ADR-052 §5-§7)', () => {
    describe('validateProxyRequest', () => {
        it('normalises the method and serialises a JSON body', () => {
            expect(
                validateProxyRequest(
                    { method: 'post', path: '/x', body: { a: 1 }, headers: { 'Content-Type': 'application/json' } },
                    limits
                )
            ).toEqual({
                method: 'POST',
                path: '/x',
                query: undefined,
                headers: { 'content-type': 'application/json' },
                body: '{"a":1}',
                bodyIsJson: true,
                requestBytes: 7,
            });
        });

        it('accepts scalar and string-array query values', () => {
            const { query } = validateProxyRequest(
                { method: 'GET', path: '/x', query: { a: 'b', n: 2, f: false, ids: ['1', '2'] } },
                limits
            );
            expect(query).toEqual({ a: 'b', n: 2, f: false, ids: '1,2' });
        });

        it.each([
            [null],
            [[]],
            [{ method: 'TRACE', path: '/x' }],
            [{ method: 'GET' }],
            [{ method: 'GET', path: '/x', query: [] }],
            [{ method: 'GET', path: '/x', query: { a: { b: 1 } } }],
            [{ method: 'GET', path: '/x', headers: { a: 1 } }],
            [{ method: 'GET', path: '/x', body: { a: 1 } }],
        ])('rejects %j', (request) => {
            expect(codeOf(() => validateProxyRequest(request, limits))).toBe('INVALID_PROXY_REQUEST');
        });

        it('rejects a body over the limit', () => {
            expect(
                codeOf(() => validateProxyRequest({ method: 'POST', path: '/x', body: 'x'.repeat(65) }, limits))
            ).toBe('PAYLOAD_TOO_LARGE');
        });
    });

    describe('resolveAllowRules', () => {
        const definition = {
            moduleName: 'crm',
            proxy: {
                allow: [
                    { method: 'GET', path: '/contacts/:id' },
                    { method: '*', path: '/contacts' },
                    { method: 'GET', path: '/**' },
                    { method: 'GET', path: 'no-slash' },
                ],
            },
        };

        it('denies by default when the module declares nothing', () => {
            expect(resolveAllowRules({ moduleName: 'bare' })).toEqual({ rules: [], source: 'none', ignored: 0 });
        });

        it('uses the module list without wildcards or invalid rules', () => {
            expect(resolveAllowRules(definition)).toEqual({
                rules: [{ method: 'GET', path: '/contacts/:id' }],
                source: 'module',
                ignored: 3,
            });
            expect(resolveAllowRules(definition, { crm: { allow: 'module' } }).source).toBe('module');
        });

        it('lets the app definition replace the list, wildcards included', () => {
            const appRules = [{ method: '*', path: '/**' }];
            expect(resolveAllowRules(definition, { crm: { allow: appRules } })).toEqual({
                rules: appRules,
                source: 'app',
                ignored: 0,
            });
            expect(resolveAllowRules({ moduleName: 'bare' }, { bare: { allow: [{ method: 'GET', path: '/v1/x' }] } }).rules).toHaveLength(1);
        });
    });

    describe('filterRequestHeaders', () => {
        it('keeps only allowed headers and drops the rest', () => {
            expect(
                filterRequestHeaders(
                    { accept: 'application/json', 'x-custom': '1', 'x-tenant': 't', 'user-agent': 'agent' },
                    { moduleHeaders: ['X-Tenant'] }
                )
            ).toEqual({ accept: 'application/json', 'x-tenant': 't' });
        });

        it.each([
            'authorization',
            'proxy-authorization',
            'cookie',
            'host',
            'forwarded',
            'x-forwarded-for',
            'x-forwarded-host',
            'x-real-ip',
            'x-api-key',
        ])('rejects %s even when a module lists it', (name) => {
            expect(codeOf(() => filterRequestHeaders({ [name]: 'v' }, { moduleHeaders: [name] }))).toBe(
                'INVALID_PROXY_REQUEST'
            );
        });

        it("rejects the header the module's own auth sets", () => {
            expect(
                codeOf(() => filterRequestHeaders({ 'x-acme-token': 'v' }, { authHeaderNames: ['X-Acme-Token'] }))
            ).toBe('INVALID_PROXY_REQUEST');
        });
    });

    describe('filterResponseHeaders', () => {
        it('removes credential and hop-by-hop headers', () => {
            expect(
                filterResponseHeaders({
                    'Content-Type': 'application/json',
                    'set-cookie': 's=1',
                    'www-authenticate': 'Bearer',
                    authorization: 'Bearer x',
                    'transfer-encoding': 'chunked',
                    'x-ratelimit-remaining': '9',
                    'x-acme-token': 'leak',
                    location: 'https://api.example.com/next',
                }, { authHeaderNames: ['x-acme-token'] })
            ).toEqual({
                'content-type': 'application/json',
                'x-ratelimit-remaining': '9',
                location: 'https://api.example.com/next',
            });
        });

        it('drops the location of a refused redirect', () => {
            expect(filterResponseHeaders({ location: 'https://evil.example' }, { redirectBlocked: true })).toEqual({});
        });
    });

    describe('decodeResponseBody', () => {
        it('parses JSON (including +json types) and falls back to text', () => {
            expect(decodeResponseBody(Buffer.from('{"a":1}'), 'application/json; charset=utf-8')).toEqual({ data: { a: 1 } });
            expect(decodeResponseBody(Buffer.from('{"a":1}'), 'application/vnd.api+json')).toEqual({ data: { a: 1 } });
            expect(decodeResponseBody(Buffer.from('not json'), 'application/json')).toEqual({ data: 'not json' });
        });

        it('returns text and empty bodies', () => {
            expect(decodeResponseBody(Buffer.from('<a/>'), 'application/xml')).toEqual({ data: '<a/>' });
            expect(decodeResponseBody(Buffer.from('hi'), 'text/plain')).toEqual({ data: 'hi' });
            expect(decodeResponseBody(Buffer.alloc(0), 'image/png')).toEqual({ data: null });
        });

        it('refuses binary unless the module allows it', () => {
            expect(codeOf(() => decodeResponseBody(Buffer.from([1, 2]), 'image/png'))).toBe('UNSUPPORTED_MEDIA_TYPE');
            expect(decodeResponseBody(Buffer.from([1, 2]), 'image/png', { binary: true })).toEqual({
                data: 'AQI=',
                encoding: 'base64',
            });
        });
    });
});
