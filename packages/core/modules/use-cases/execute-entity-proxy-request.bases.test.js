/**
 * Named proxy bases (ADR-052 amendment): one module, several hosts. These run
 * the real use case over a real Requester (only `fetch` is faked), so what is
 * asserted is the URL that would leave the process, not a mocked return value.
 */
const Boom = require('@hapi/boom');
const { createMemorySink } = require('../../logs');
const { ExecuteEntityProxyRequest } = require('./execute-entity-proxy-request');
const { resolveManagementApiConfig } = require('../../management-api/management-api-config');
const { Requester } = require('../requester/requester');

const user = { getId: () => 'u1', getOrganizationUser: () => ({ id: 'org-1' }) };

const googleLike = {
    moduleName: 'googleish',
    proxy: {
        baseUrls: {
            default: 'https://www.googleapis.com',
            docs: 'https://docs.googleapis.com',
            sheets: 'https://sheets.googleapis.com/v4',
        },
        allow: [
            { method: 'GET', path: '/drive/v3/files' },
            { method: 'GET', path: '/v1/documents/:id', base: 'docs' },
        ],
    },
};

class TestRequester extends Requester {
    constructor(params) {
        super({ backOff: [0, 0, 0], ...params });
        this.baseUrl = 'https://requester-fallback.example.com';
    }
    async addAuthHeaders(headers) {
        headers.Authorization = 'Bearer module-token';
        return headers;
    }
    async notify() {}
}

function setup({ def = googleLike, overrides } = {}) {
    const fetch = jest.fn(
        async () =>
            new Response('{"ok":true}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
    );
    const api = new TestRequester({ fetch });
    const getEntityModuleForUser = {
        execute: jest.fn(async () => ({
            entity: { id: 'e1', credential: { id: 'c1', authIsValid: true } },
            definition: def,
            module: { api },
        })),
        describe: jest.fn(() => ({ scope: 'individual', access: 'manage' })),
    };
    const config = resolveManagementApiConfig({ proxy: { enable: true, ...(overrides || {}) } });
    const useCase = new ExecuteEntityProxyRequest({
        getEntityModuleForUser,
        proxyConfig: config.proxy,
        telemetry: { count: jest.fn() },
    });
    return { useCase, fetch };
}

describe('ExecuteEntityProxyRequest: named bases (ADR-052 amendment)', () => {
    let sink;
    beforeEach(() => {
        sink = createMemorySink();
    });
    const audits = () => sink.records.filter((r) => r.eventName === 'frigg.api.proxy.request');
    const run = (useCase, request) =>
        useCase.execute('e1', user, { method: 'GET', ...request }).catch((e) => e);

    it('sends a request with base "docs" to the docs host, and one without base to default', async () => {
        const { useCase, fetch } = setup();
        await useCase.execute('e1', user, { method: 'GET', path: '/v1/documents/abc', base: 'docs' });
        await useCase.execute('e1', user, { method: 'GET', path: '/drive/v3/files' });
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            'https://docs.googleapis.com/v1/documents/abc',
            'https://www.googleapis.com/drive/v3/files',
        ]);
        expect(audits()[0]).toMatchObject({ base: 'docs', outcome: 'ok' });
        expect(audits()[1]).toMatchObject({ base: 'default', outcome: 'ok' });
    });

    it('joins the path under a base that has a path of its own', async () => {
        const { useCase, fetch } = setup({
            overrides: {
                modules: { googleish: { allow: [{ method: 'GET', path: '/spreadsheets/:id', base: 'sheets' }] } },
            },
        });
        await useCase.execute('e1', user, { method: 'GET', path: '/spreadsheets/s1', base: 'sheets' });
        expect(fetch.mock.calls[0][0]).toBe('https://sheets.googleapis.com/v4/spreadsheets/s1');
    });

    it('matches allow rules per base: a path allowed on default is refused on docs, and the reverse', async () => {
        const { useCase, fetch } = setup();
        const onDocs = await run(useCase, { path: '/drive/v3/files', base: 'docs' });
        expect(onDocs.output.statusCode).toBe(403);
        expect(onDocs.data).toMatchObject({
            code: 'PROXY_NOT_ALLOWED',
            details: { module: 'googleish', base: 'docs' },
        });
        expect(onDocs.message).toMatch(/base docs/);

        const onDefault = await run(useCase, { path: '/v1/documents/abc' });
        expect(onDefault.output.statusCode).toBe(403);
        expect(onDefault.message).toMatch(/base default/);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('applies the app-level allow-list per base, with `base` defaulting to default', async () => {
        const { useCase, fetch } = setup({
            overrides: {
                modules: {
                    googleish: {
                        allow: [
                            { method: 'GET', path: '/drive/v3/files' },
                            { method: 'GET', path: '/v1/documents/:id', base: 'docs' },
                        ],
                    },
                },
            },
        });
        await useCase.execute('e1', user, { method: 'GET', path: '/v1/documents/1', base: 'docs' });
        expect(fetch).toHaveBeenCalledTimes(1);
        const refused = await run(useCase, { path: '/v1/documents/1', base: 'default' });
        expect(refused.data.code).toBe('PROXY_NOT_ALLOWED');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('refuses an unknown base name with 400 PROXY_UNKNOWN_BASE listing the module\'s names', async () => {
        const { useCase, fetch } = setup();
        const error = await run(useCase, { path: '/drive/v3/files', base: 'ads' });
        expect(error.output.statusCode).toBe(400);
        expect(error.data).toMatchObject({
            code: 'PROXY_UNKNOWN_BASE',
            details: { module: 'googleish', base: 'ads', bases: ['default', 'docs', 'sheets'] },
        });
        expect(error.message).toMatch(/default, docs, sheets/);
        expect(fetch).not.toHaveBeenCalled();
        expect(audits()[0]).toMatchObject({ outcome: 'denied', reason: 'PROXY_UNKNOWN_BASE' });
    });

    it('treats an omitted base as default even when the module declares no default', async () => {
        const { useCase, fetch } = setup({
            def: { moduleName: 'nodefault', proxy: { baseUrls: { docs: 'https://docs.example.com' } } },
        });
        const error = await run(useCase, { path: '/x' });
        expect(error.data).toMatchObject({ code: 'PROXY_UNKNOWN_BASE', details: { bases: ['docs'] } });
        expect(fetch).not.toHaveBeenCalled();
    });

    describe('SSRF: `base` is a name, never a URL or host', () => {
        it.each([
            ['an absolute URL', 'https://evil.example'],
            ['a bare host', 'evil.example'],
            ['a relative traversal', '../x'],
            ['a name with a traversal', 'default/../x'],
            ['a scheme-relative host', '//evil.example'],
            ['a host with a port', 'docs:8080'],
            ['an upper-case name', 'Docs'],
            ['a non-string', 42],
        ])('refuses %s and makes no outbound request', async (_label, base) => {
            const { useCase, fetch } = setup();
            const error = await run(useCase, { path: '/drive/v3/files', base });
            expect(error.output.statusCode).toBe(400);
            expect(['INVALID_PROXY_REQUEST', 'PROXY_UNKNOWN_BASE']).toContain(error.data.code);
            expect(fetch).not.toHaveBeenCalled();
        });

        it('does not let a base URL-shaped value reach a module that declares an evil name for it', async () => {
            // Even a module whose declared name were "evil.example" cannot be
            // addressed that way: names are letters, digits and dashes.
            const { useCase, fetch } = setup();
            const error = await run(useCase, { path: '/drive/v3/files', base: 'evil.example' });
            expect(error.data.code).toBe('INVALID_PROXY_REQUEST');
            expect(fetch).not.toHaveBeenCalled();
        });
    });

    describe('legacy baseUrl definitions', () => {
        const legacy = {
            moduleName: 'crm',
            proxy: { baseUrl: 'https://crm.example.com/api', allow: [{ method: 'GET', path: '/contacts' }] },
        };

        it('behave as before: no base goes to baseUrl, and "default" is the same base', async () => {
            const { useCase, fetch } = setup({ def: legacy });
            await useCase.execute('e1', user, { method: 'GET', path: '/contacts' });
            await useCase.execute('e1', user, { method: 'GET', path: '/contacts', base: 'default' });
            expect(fetch.mock.calls.map(([url]) => url)).toEqual([
                'https://crm.example.com/api/contacts',
                'https://crm.example.com/api/contacts',
            ]);
        });

        it('refuses any other base name', async () => {
            const { useCase, fetch } = setup({ def: legacy });
            const error = await run(useCase, { path: '/contacts', base: 'docs' });
            expect(error.data).toMatchObject({ code: 'PROXY_UNKNOWN_BASE', details: { bases: ['default'] } });
            expect(fetch).not.toHaveBeenCalled();
        });

        it('falls back to the requester base URL when the module pins nothing', async () => {
            const { useCase, fetch } = setup({
                def: { moduleName: 'plain', proxy: { allow: [{ method: 'GET', path: '/x' }] } },
            });
            await useCase.execute('e1', user, { method: 'GET', path: '/x' });
            expect(fetch.mock.calls[0][0]).toBe('https://requester-fallback.example.com/x');
        });
    });

    it('only follows a redirect that the same base allows', async () => {
        const { useCase, fetch } = setup();
        fetch.mockResolvedValueOnce(
            new Response(null, { status: 302, headers: { location: '/drive/v3/files' } })
        );
        // The redirect target is allowed on default but the call is on docs.
        const result = await useCase.execute('e1', user, {
            method: 'GET',
            path: '/v1/documents/abc',
            base: 'docs',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(302);
    });

    it('keeps ownership checks first: an invisible entity is 404 whatever `base` says', async () => {
        const { useCase } = setup();
        useCase.getEntityModuleForUser.execute.mockRejectedValueOnce(
            Boom.notFound('Entity not found', { code: 'ENTITY_NOT_FOUND' })
        );
        const error = await run(useCase, { path: '/x', base: 'nope' });
        expect(error.output.statusCode).toBe(404);
    });
});
