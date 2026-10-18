const {
    resolveModuleBases,
    assertProxyConfig,
    isValidBaseName,
    ruleBase,
} = require('./proxy-bases');
const { ProxyConfigError } = require('./proxy-errors');

const mod = (proxy, moduleName = 'google') => ({ moduleName, proxy });

describe('proxy bases (ADR-052 amendment)', () => {
    describe('resolveModuleBases', () => {
        it('treats baseUrl as { default: baseUrl }', () => {
            const bases = resolveModuleBases(mod({ baseUrl: 'https://api.example.com/v1' }));
            expect(bases.names).toEqual(['default']);
            expect(bases.values.get('default')).toBe('https://api.example.com/v1');
            expect(bases.declared).toBe(true);
        });

        it('gives a module that pins nothing the single base "default"', () => {
            const bases = resolveModuleBases(mod(undefined));
            expect(bases.names).toEqual(['default']);
            expect(bases.values.get('default')).toBeUndefined();
            expect(bases.declared).toBe(false);
        });

        it('reads named bases', () => {
            const bases = resolveModuleBases(
                mod({ baseUrls: { default: 'https://www.googleapis.com', docs: 'https://docs.googleapis.com/' } })
            );
            expect(bases.names).toEqual(['default', 'docs']);
        });

        it('accepts a function value, resolved against the api at call time', () => {
            expect(() => resolveModuleBases(mod({ baseUrls: { tenant: () => 'https://x.example.com' } }))).not.toThrow();
        });

        it.each([
            ['both baseUrl and baseUrls', { baseUrl: 'https://a.example.com', baseUrls: { default: 'https://a.example.com' } }, /both proxy\.baseUrl and proxy\.baseUrls/],
            ['http', { baseUrls: { docs: 'http://docs.example.com' } }, /proxy\.baseUrls\.docs must use https/],
            ['a relative URL', { baseUrls: { docs: '/v1' } }, /proxy\.baseUrls\.docs is not a valid absolute URL/],
            ['a host without a scheme', { baseUrls: { docs: 'docs.example.com' } }, /not a valid absolute URL/],
            ['credentials', { baseUrls: { docs: 'https://u:p@docs.example.com' } }, /credentials, a query or a fragment/],
            ['a query', { baseUrls: { docs: 'https://docs.example.com/?a=1' } }, /credentials, a query or a fragment/],
            ['a fragment', { baseUrls: { docs: 'https://docs.example.com/#x' } }, /credentials, a query or a fragment/],
            ['a non-string URL', { baseUrls: { docs: 42 } }, /absolute https URL string/],
            ['an upper-case name', { baseUrls: { Docs: 'https://docs.example.com' } }, /invalid name "Docs"/],
            ['a name with a dot', { baseUrls: { 'a.b': 'https://docs.example.com' } }, /invalid name "a\.b"/],
            ['a name starting with a digit', { baseUrls: { '1x': 'https://docs.example.com' } }, /invalid name "1x"/],
            ['an empty object', { baseUrls: {} }, /non-empty object/],
            ['an array', { baseUrls: ['https://docs.example.com'] }, /non-empty object/],
        ])('throws ProxyConfigError for %s', (_label, proxy, message) => {
            expect(() => resolveModuleBases(mod(proxy))).toThrow(ProxyConfigError);
            expect(() => resolveModuleBases(mod(proxy))).toThrow(message);
        });

        it('names the module in the error', () => {
            expect(() => resolveModuleBases(mod({ baseUrls: { docs: 'http://x.example.com' } }, 'sheetsy'))).toThrow(/Module sheetsy/);
        });
    });

    describe('assertProxyConfig', () => {
        const google = mod({ baseUrls: { default: 'https://www.googleapis.com', docs: 'https://docs.googleapis.com' } });

        it('accepts rules for declared bases, and rules without a base', () => {
            expect(() =>
                assertProxyConfig([google], {
                    modules: {
                        google: {
                            allow: [
                                { method: 'GET', path: '/a' },
                                { method: 'GET', path: '/b', base: 'docs' },
                            ],
                        },
                    },
                })
            ).not.toThrow();
        });

        it('names module, base and rule when an app rule names an undeclared base', () => {
            const run = () =>
                assertProxyConfig([google], {
                    modules: { google: { allow: [{ method: 'GET', path: '/v4/reports', base: 'analytics' }] } },
                });
            expect(run).toThrow(ProxyConfigError);
            expect(run).toThrow(/managementApi\.proxy\.modules\.google\.allow/);
            expect(run).toThrow(/GET \/v4\/reports/);
            expect(run).toThrow(/"analytics"/);
            expect(run).toThrow(/module google does not declare \(declared: default, docs\)/);
        });

        it('rejects a base on a rule for a module that declares only baseUrl', () => {
            expect(() =>
                assertProxyConfig([mod({ baseUrl: 'https://a.example.com' })], {
                    modules: { google: { allow: [{ method: 'GET', path: '/x', base: 'docs' }] } },
                })
            ).toThrow(/"docs"/);
        });

        it('rejects a rule with no base when the module has no default', () => {
            const noDefault = mod({ baseUrls: { docs: 'https://docs.googleapis.com' } });
            expect(() =>
                assertProxyConfig([noDefault], {
                    modules: { google: { allow: [{ method: 'GET', path: '/x' }] } },
                })
            ).toThrow(/applies to "default"/);
        });

        it('checks the module\'s own proxy.allow too', () => {
            const bad = mod({
                baseUrls: { default: 'https://www.googleapis.com' },
                allow: [{ method: 'GET', path: '/x', base: 'docs' }],
            });
            expect(() => assertProxyConfig([bad], {})).toThrow(/Module google proxy\.allow/);
        });

        it('surfaces a module-level baseUrl/baseUrls clash', () => {
            expect(() =>
                assertProxyConfig([mod({ baseUrl: 'https://a.example.com', baseUrls: { x: 'https://b.example.com' } })], {})
            ).toThrow(/both proxy\.baseUrl and proxy\.baseUrls/);
        });

        it('ignores overrides for modules that are not registered, as before', () => {
            expect(() =>
                assertProxyConfig([google], { modules: { other: { allow: [{ method: 'GET', path: '/x', base: 'zzz' }] } } })
            ).not.toThrow();
        });
    });

    it('validates base names and defaults a rule to "default"', () => {
        expect(isValidBaseName('docs-v2')).toBe(true);
        expect(isValidBaseName('Docs')).toBe(false);
        expect(isValidBaseName('')).toBe(false);
        expect(ruleBase({ method: 'GET', path: '/x' })).toBe('default');
        expect(ruleBase({ method: 'GET', path: '/x', base: 'docs' })).toBe('docs');
    });
});
