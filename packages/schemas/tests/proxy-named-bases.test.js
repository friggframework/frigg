const {
    validateApiModuleDefinition,
    validateAppDefinition,
    validateProxyRequest,
} = require('../index');

const moduleDef = (proxy) => ({
    moduleName: 'google',
    getName: { type: 'function' },
    requiredAuthMethods: { apiPropertiesToPersist: { credential: ['access_token'], entity: [] } },
    proxy,
});
const appDef = (allow) => ({
    name: 'app',
    provider: 'aws',
    integrations: [],
    managementApi: { proxy: { enable: true, modules: { google: { allow } } } },
});

describe('named proxy bases (ADR-052 amendment 1)', () => {
    describe('api-module-definition: proxy', () => {
        it('accepts baseUrls and a base on allow rules', () => {
            expect(
                validateApiModuleDefinition(
                    moduleDef({
                        baseUrls: { default: 'https://www.googleapis.com', 'docs-v2': 'https://docs.googleapis.com/v1' },
                        allow: [{ method: 'GET', path: '/v1/documents/:id', base: 'docs-v2' }],
                    })
                ).valid
            ).toBe(true);
        });

        it('still accepts a lone baseUrl', () => {
            expect(validateApiModuleDefinition(moduleDef({ baseUrl: 'https://a.example.com' })).valid).toBe(true);
        });

        it.each([
            ['both baseUrl and baseUrls', { baseUrl: 'https://a.example.com', baseUrls: { x: 'https://b.example.com' } }],
            ['an http base', { baseUrls: { docs: 'http://docs.example.com' } }],
            ['a function-shaped base', { baseUrls: { docs: { type: 'function' } } }],
            ['an upper-case name', { baseUrls: { Docs: 'https://docs.example.com' } }],
            ['a name with a dot', { baseUrls: { 'a.b': 'https://docs.example.com' } }],
            ['no bases', { baseUrls: {} }],
            ['a rule base that is not a name', { allow: [{ method: 'GET', path: '/x', base: 'https://evil.example' }] }],
        ])('rejects %s', (_label, proxy) => {
            expect(validateApiModuleDefinition(moduleDef(proxy)).valid).toBe(false);
        });
    });

    describe('app-definition: managementApi.proxy.modules.<m>.allow', () => {
        it('accepts a base on a rule', () => {
            expect(validateAppDefinition(appDef([{ method: 'GET', path: '/x', base: 'docs' }])).valid).toBe(true);
        });
        it.each(['Docs', 'https://evil.example', 'a/b', '', 7])('rejects rule base %j', (base) => {
            expect(validateAppDefinition(appDef([{ method: 'GET', path: '/x', base }])).valid).toBe(false);
        });
    });

    describe('api-proxy: request', () => {
        const req = (base) => validateProxyRequest({ method: 'GET', path: '/x', base });
        it('accepts a base name', () => expect(req('docs').valid).toBe(true));
        it('accepts a request without base', () =>
            expect(validateProxyRequest({ method: 'GET', path: '/x' }).valid).toBe(true));
        it.each(['https://evil.example', 'evil.example', '../x', 'default/../x', 'Docs', 7])(
            'rejects base %j',
            (base) => expect(req(base).valid).toBe(false)
        );
    });
});
