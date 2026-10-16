const {
    resolveManagementApiConfig,
    DEFAULT_PROXY_LIMITS,
    DEFAULT_PROXY_SCOPES,
    ManagementApiConfigError,
} = require('./management-api-config');

describe('resolveManagementApiConfig', () => {
    it('enables v1 and disables the proxy by default', () => {
        expect(resolveManagementApiConfig(undefined)).toEqual({
            v1: true,
            proxy: { enable: false, ...DEFAULT_PROXY_LIMITS, scopes: ['individual'], modules: {} },
        });
    });

    describe('proxy.scopes (ADR-056 §3.5)', () => {
        const scopesOf = (scopes) =>
            resolveManagementApiConfig({ proxy: { enable: true, scopes } }).proxy.scopes;

        it('defaults to individual only, narrowest first', () => {
            expect(DEFAULT_PROXY_SCOPES).toEqual(['individual']);
            expect(scopesOf(undefined)).toEqual(['individual']);
            expect(resolveManagementApiConfig({}).proxy.scopes).toEqual(['individual']);
        });

        it('accepts organization when an app opts in, alone or with individual', () => {
            expect(scopesOf(['individual', 'organization'])).toEqual(['individual', 'organization']);
            expect(scopesOf(['organization'])).toEqual(['organization']);
        });

        it('returns a frozen copy, so the definition cannot change it after load', () => {
            const declared = ['individual'];
            const resolved = scopesOf(declared);
            expect(resolved).not.toBe(declared);
            expect(Object.isFrozen(resolved)).toBe(true);
        });

        it.each([
            ['an unknown scope', ['individual', 'team'], /unknown scope "team"/],
            ['a misspelt one', ['organisation'], /unknown scope "organisation"/],
            ['global', ['individual', 'global'], /'global' is not allowed/],
            ['a string', 'organization', /non-empty list/],
            ['null', null, /non-empty list/],
            ['an empty list', [], /non-empty list/],
            ['a duplicate', ['organization', 'organization'], /more than once/],
        ])('refuses %s loudly instead of falling back', (_label, scopes, message) => {
            expect(() => scopesOf(scopes)).toThrow(ManagementApiConfigError);
            expect(() => scopesOf(scopes)).toThrow(message);
            try {
                scopesOf(scopes);
            } catch (error) {
                expect(error.code).toBe('MANAGEMENT_API_CONFIG_INVALID');
            }
        });
    });

    it('disables v1 only for an explicit false', () => {
        expect(resolveManagementApiConfig({ v1: false }).v1).toBe(false);
        expect(resolveManagementApiConfig({ v1: 0 }).v1).toBe(true);
    });

    it('enables the proxy only for an explicit true', () => {
        expect(resolveManagementApiConfig({ proxy: { enable: true } }).proxy.enable).toBe(true);
        expect(resolveManagementApiConfig({ proxy: { enable: 'yes' } }).proxy.enable).toBe(false);
    });

    it('uses the ADR-052 defaults: 25s timeout, 1MB request, 5MB response', () => {
        expect(DEFAULT_PROXY_LIMITS).toEqual({
            timeoutMs: 25000,
            maxRequestBytes: 1024 * 1024,
            maxResponseBytes: 5 * 1024 * 1024,
        });
    });

    it('passes the per-module allow-list overrides through', () => {
        const modules = { hubspot: { allow: 'module' } };
        expect(
            resolveManagementApiConfig({ proxy: { enable: true, modules } }).proxy
                .modules
        ).toBe(modules);
    });

    it('lets the request limit go above the default, up to the API Gateway 10MB cap', () => {
        expect(
            resolveManagementApiConfig({ proxy: { maxRequestBytes: 2 * 1024 * 1024 } })
                .proxy.maxRequestBytes
        ).toBe(2 * 1024 * 1024);
        expect(
            resolveManagementApiConfig({ proxy: { maxRequestBytes: 64 * 1024 * 1024 } })
                .proxy.maxRequestBytes
        ).toBe(10 * 1024 * 1024);
    });

    it('accepts tighter proxy limits and caps looser ones at the platform ceiling', () => {
        const { proxy } = resolveManagementApiConfig({
            proxy: {
                enable: true,
                timeoutMs: 5000,
                maxRequestBytes: 1024,
                maxResponseBytes: 50 * 1024 * 1024,
            },
        });
        expect(proxy.timeoutMs).toBe(5000);
        expect(proxy.maxRequestBytes).toBe(1024);
        expect(proxy.maxResponseBytes).toBe(DEFAULT_PROXY_LIMITS.maxResponseBytes);
    });

    it('ignores non-positive or non-numeric limits', () => {
        const { proxy } = resolveManagementApiConfig({
            proxy: { timeoutMs: -1, maxRequestBytes: 'big' },
        });
        expect(proxy.timeoutMs).toBe(DEFAULT_PROXY_LIMITS.timeoutMs);
        expect(proxy.maxRequestBytes).toBe(DEFAULT_PROXY_LIMITS.maxRequestBytes);
    });
});
