const { normalizeProxyPath, joinProxyUrl, matchAllowRule } = require('./proxy-path');

const rejects = (path) => {
    let error;
    try {
        normalizeProxyPath(path);
    } catch (e) {
        error = e;
    }
    return error?.code;
};

describe('entity proxy path rules (ADR-052 §4)', () => {
    describe('normalizeProxyPath', () => {
        it.each([
            ['/crm/v3/objects/contacts', '/crm/v3/objects/contacts'],
            ['/', '/'],
            ['/files/r%C3%A9sum%C3%A9', '/files/résumé'],
            ['/a:b/c@d', '/a:b/c@d'],
            ['/files/My%20Report.pdf', '/files/My Report.pdf'],
        ])('accepts %s', (input, expected) => {
            expect(normalizeProxyPath(input)).toBe(expected);
        });

        it.each([
            ['https://evil.example/x'],
            ['http:/x'],
            ['//169.254.169.254/latest/meta-data/'],
            ['/a//b'],
            ['\\\\evil'],
            ['/a\\b'],
            ['/a/../b'],
            ['/a/./b'],
            ['/..'],
            ['/a/%2e%2e/b'],
            ['/a/%2E%2E'],
            ['/a%2fb'],
            ['/a%2Fb'],
            ['/a%5cb'],
            ['/a%252fb'],
            ['/a?x=1'],
            ['/a#frag'],
            ['/a%3Fx=1'],
            ['/a%23x'],
            ['/a b'],
            ['/a\tb'],
            ['/a\nb'],
            ['/a%0Ab'],
            ['/a%09b'],
            ['/a%C2%A0b'],
            ['/a%00b'],
            ['/a b'],
            ['/%E0%A4%A'],
            ['relative/path'],
            [''],
            [undefined],
            [42],
            ['/' + 'a'.repeat(3000)],
        ])('rejects %j', (input) => {
            expect(rejects(input)).toBe('INVALID_PROXY_REQUEST');
        });
    });

    describe('joinProxyUrl', () => {
        it('joins under the base path', () => {
            expect(joinProxyUrl('https://api.example.com/v2/', '/contacts')).toEqual({
                url: 'https://api.example.com/v2/contacts',
                basePath: '/v2',
                origin: 'https://api.example.com',
            });
            expect(joinProxyUrl('https://api.example.com', '/').url).toBe(
                'https://api.example.com/'
            );
        });

        it('keeps a tenant host from the module (e.g. an instance URL)', () => {
            expect(
                joinProxyUrl('https://tenant-42.my.example.com/services/data', '/v59.0/query').url
            ).toBe('https://tenant-42.my.example.com/services/data/v59.0/query');
        });

        it.each([
            ['http://api.example.com', 'plain http'],
            ['ftp://api.example.com', 'other schemes'],
            ['https://user:pass@api.example.com', 'userinfo'],
            ['https://api.example.com?x=1', 'a query'],
            ['not a url', 'garbage'],
            [undefined, 'nothing'],
        ])('refuses a base URL with %s (%s)', (baseUrl) => {
            expect(() => joinProxyUrl(baseUrl, '/x')).toThrow(
                expect.objectContaining({ code: 'PROXY_NOT_CONFIGURED' })
            );
        });

        it('cannot be steered to another origin even by a crafted path', () => {
            // normalizeProxyPath already refuses these; joinProxyUrl is the
            // second line of defence.
            expect(() => joinProxyUrl('https://api.example.com/v2', '@evil.example/x')).toThrow(
                expect.objectContaining({ code: 'INVALID_PROXY_REQUEST' })
            );
            expect(() => joinProxyUrl('https://api.example.com/v2', '/../admin')).toThrow(
                expect.objectContaining({ code: 'INVALID_PROXY_REQUEST' })
            );
        });
    });

    describe('matchAllowRule', () => {
        const rules = [
            { method: 'GET', path: '/crm/v3/objects/:objectType' },
            { method: 'GET', path: '/crm/v3/objects/:objectType/:id' },
            { method: 'POST', path: '/crm/v3/objects/:objectType/search' },
            { method: 'GET', path: '/crm/v3/properties/**' },
            { method: '*', path: '/ping' },
        ];

        it.each([
            ['GET', '/crm/v3/objects/contacts', '/crm/v3/objects/:objectType'],
            ['GET', '/crm/v3/objects/contacts/7', '/crm/v3/objects/:objectType/:id'],
            ['POST', '/crm/v3/objects/contacts/search', '/crm/v3/objects/:objectType/search'],
            ['GET', '/crm/v3/properties', '/crm/v3/properties/**'],
            ['GET', '/crm/v3/properties/contacts/email', '/crm/v3/properties/**'],
            ['DELETE', '/ping', '/ping'],
        ])('allows %s %s via %s', (method, path, pattern) => {
            expect(matchAllowRule(rules, method, path)?.path).toBe(pattern);
        });

        it.each([
            ['DELETE', '/crm/v3/objects/contacts/7'],
            ['GET', '/crm/v3/objects'],
            ['GET', '/crm/v3/objects/contacts/7/associations'],
            ['POST', '/crm/v3/properties/x'],
            ['GET', '/crm/v3/propertiesX'],
            ['GET', '/admin'],
        ])('denies %s %s', (method, path) => {
            expect(matchAllowRule(rules, method, path)).toBeNull();
        });

        it('denies everything with no rules', () => {
            expect(matchAllowRule(undefined, 'GET', '/x')).toBeNull();
            expect(matchAllowRule([], 'GET', '/x')).toBeNull();
        });
    });
});
