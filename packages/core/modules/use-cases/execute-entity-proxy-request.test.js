const Boom = require('@hapi/boom');
const { createMemorySink } = require('../../logs');
const { ExecuteEntityProxyRequest } = require('./execute-entity-proxy-request');
const { resolveManagementApiConfig } = require('../../management-api/management-api-config');
const { ProxyRequestError } = require('../proxy/proxy-errors');

const user = { getId: () => 'u1', getOrganizationUser: () => ({ id: 'org-1' }) };

const definition = {
    moduleName: 'crm',
    proxy: {
        allow: [
            { method: 'GET', path: '/contacts/:id' },
            { method: 'POST', path: '/contacts/search' },
        ],
        headers: ['x-tenant'],
    },
};

function upstream(status, data, headers = {}) {
    const body = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    return {
        status,
        headers: { 'content-type': 'application/json', ...headers },
        body,
        contentType: headers['content-type'] || 'application/json',
        redirectBlocked: false,
    };
}

function setup({ entity, def = definition, proxyRequest, overrides } = {}) {
    const api = {
        api_key_name: 'X-Crm-Key',
        _proxyRequest: jest.fn(proxyRequest || (async () => upstream(200, { id: '7', name: 'Ada' }))),
    };
    const getEntityModuleForUser = {
        execute: jest.fn(async (entityId) => {
            if (entityId !== 'e1') throw Boom.notFound('Entity not found', { code: 'ENTITY_NOT_FOUND' });
            return {
                entity: entity || { id: 'e1', userId: 'u1', moduleName: 'crm', credential: { id: 'c1', authIsValid: true } },
                definition: def,
                module: { api },
            };
        }),
    };
    const telemetry = { count: jest.fn() };
    const config = resolveManagementApiConfig({ proxy: { enable: true, ...(overrides || {}) } });
    const useCase = new ExecuteEntityProxyRequest({
        getEntityModuleForUser,
        proxyConfig: config.proxy,
        telemetry,
        now: (() => {
            let t = 1000;
            return () => (t += 5);
        })(),
    });
    return { useCase, api, telemetry, getEntityModuleForUser };
}

describe('ExecuteEntityProxyRequest (ADR-052)', () => {
    let sink;
    beforeEach(() => {
        sink = createMemorySink();
    });
    const audits = () => sink.records.filter((r) => r.eventName === 'frigg.api.proxy.request');

    it('proxies an allowed call and returns the upstream answer', async () => {
        const { useCase, api, telemetry } = setup();
        const result = await useCase.execute('e1', user, {
            method: 'get',
            path: '/contacts/7',
            query: { fields: 'name' },
            headers: { Accept: 'application/json', 'X-Tenant': 't1', 'User-Agent': 'agent' },
        });

        expect(result).toEqual({
            status: 200,
            body: {
                success: true,
                status: 200,
                headers: { 'content-type': 'application/json' },
                data: { id: '7', name: 'Ada' },
            },
        });
        const call = api._proxyRequest.mock.calls[0][0];
        expect(call).toMatchObject({
            method: 'GET',
            path: '/contacts/7',
            query: { fields: 'name' },
            headers: { accept: 'application/json', 'x-tenant': 't1' },
            timeoutMs: 25000,
            maxResponseBytes: 5 * 1024 * 1024,
        });
        expect(call.isAllowedRedirect('/contacts/8', 'GET')).toBe(true);
        expect(call.isAllowedRedirect('/admin', 'GET')).toBe(false);
        expect(telemetry.count).toHaveBeenCalledWith('frigg.api.proxy.requests', 1, {
            module: 'crm',
            method: 'GET',
            outcome: 'ok',
        });
    });

    it('writes one INFO audit record without path, query, headers or bodies', async () => {
        const { useCase } = setup();
        await useCase.execute('e1', user, {
            method: 'POST',
            path: '/contacts/search',
            body: { filter: 'secret-search-term' },
            query: { token: 'secret-query' },
        });
        expect(audits()).toHaveLength(1);
        expect(audits()[0]).toMatchObject({
            level: 'INFO',
            userId: 'u1',
            organizationId: 'org-1',
            entityId: 'e1',
            credentialId: 'c1',
            module: 'crm',
            method: 'POST',
            pattern: '/contacts/search',
            upstreamStatus: 200,
            outcome: 'ok',
            durationMs: expect.any(Number),
            requestBytes: 31,
            responseBytes: expect.any(Number),
        });
        const record = JSON.stringify(audits()[0]);
        expect(record).not.toContain('secret-search-term');
        expect(record).not.toContain('secret-query');
        expect(record).not.toContain('Ada');
    });

    it('denies by default: 403 PROXY_NOT_ALLOWED for a module without an allow-list', async () => {
        const { useCase, api } = setup({ def: { moduleName: 'bare' } });
        const error = await useCase.execute('e1', user, { method: 'GET', path: '/x' }).catch((e) => e);
        expect(error.output.statusCode).toBe(403);
        expect(error.data).toMatchObject({ code: 'PROXY_NOT_ALLOWED', details: { module: 'bare', method: 'GET' } });
        expect(api._proxyRequest).not.toHaveBeenCalled();
        expect(audits()[0]).toMatchObject({ level: 'WARN', outcome: 'denied', reason: 'PROXY_NOT_ALLOWED' });
    });

    it('denies a method or path the module does not list', async () => {
        const { useCase, api } = setup();
        for (const request of [
            { method: 'DELETE', path: '/contacts/7' },
            { method: 'GET', path: '/admin/users' },
        ]) {
            const error = await useCase.execute('e1', user, request).catch((e) => e);
            expect(error.data.code).toBe('PROXY_NOT_ALLOWED');
        }
        expect(api._proxyRequest).not.toHaveBeenCalled();
    });

    it('lets the app definition widen a module list', async () => {
        const { useCase, api } = setup({
            overrides: { modules: { crm: { allow: [{ method: '*', path: '/**' }] } } },
        });
        await useCase.execute('e1', user, { method: 'DELETE', path: '/anything/at/all' });
        expect(api._proxyRequest).toHaveBeenCalled();
    });

    it('answers 404 for an entity the caller does not own, before the allow-list', async () => {
        const { useCase, api } = setup();
        const error = await useCase.execute('e9', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
        expect(error.output.statusCode).toBe(404);
        expect(api._proxyRequest).not.toHaveBeenCalled();
        expect(audits()[0]).toMatchObject({ outcome: 'denied', reason: 'ENTITY_NOT_FOUND' });
    });

    it.each([
        [{ method: 'GET', path: '//evil.example/x' }, 400, 'INVALID_PROXY_REQUEST'],
        [{ method: 'GET', path: '/contacts/7', headers: { Authorization: 'Bearer stolen' } }, 400, 'INVALID_PROXY_REQUEST'],
        [{ method: 'GET', path: '/contacts/7', headers: { 'X-Crm-Key': 'mine' } }, 400, 'INVALID_PROXY_REQUEST'],
        [{ method: 'TRACE', path: '/contacts/7' }, 400, 'INVALID_PROXY_REQUEST'],
        [{ method: 'POST', path: '/contacts/search', body: 'x'.repeat(2 * 1024 * 1024) }, 413, 'PAYLOAD_TOO_LARGE'],
    ])('refuses %j with %s %s', async (request, status, code) => {
        const { useCase, api } = setup();
        const error = await useCase.execute('e1', user, request).catch((e) => e);
        expect(error.output.statusCode).toBe(status);
        expect(error.data.code).toBe(code);
        expect(api._proxyRequest).not.toHaveBeenCalled();
    });

    it('refuses an entity without a usable credential with 401', async () => {
        for (const credential of [null, { id: 'c1', authIsValid: false }]) {
            const { useCase, api } = setup({ entity: { id: 'e1', userId: 'u1', moduleName: 'crm', credential } });
            const error = await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
            expect(error.output.statusCode).toBe(401);
            expect(error.data.code).toBe('INVALID_CREDENTIALS');
            expect(api._proxyRequest).not.toHaveBeenCalled();
        }
    });

    it('works for API-key and basic-auth modules: no access_token needed', async () => {
        const { useCase, api } = setup({
            entity: { id: 'e1', userId: 'u1', moduleName: 'crm', credential: { id: 'c1', api_key: 'k' } },
        });
        await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' });
        expect(api._proxyRequest).toHaveBeenCalled();
    });

    it('relays upstream 4xx with the upstream status', async () => {
        const { useCase } = setup({ proxyRequest: async () => upstream(404, { message: 'no such contact' }) });
        const result = await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' });
        expect(result.status).toBe(404);
        expect(result.body).toMatchObject({ success: false, status: 404, data: { message: 'no such contact' } });
        expect(audits()[0]).toMatchObject({ outcome: 'upstream_error', upstreamStatus: 404 });
    });

    it('maps 429 to 429 with Retry-After, and 5xx to 502 UPSTREAM_ERROR', async () => {
        const limited = setup({ proxyRequest: async () => upstream(429, {}, { 'retry-after': '42' }) });
        const rateError = await limited.useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
        expect(rateError.output.statusCode).toBe(429);
        expect(rateError.data).toMatchObject({ code: 'RATE_LIMITED', retryAfter: '42' });

        const broken = setup({ proxyRequest: async () => upstream(503, { secret: 'stack' }) });
        const upstreamError = await broken.useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
        expect(upstreamError.output.statusCode).toBe(502);
        expect(upstreamError.data).toMatchObject({ code: 'UPSTREAM_ERROR', details: { upstreamStatus: 503 } });
        expect(JSON.stringify(upstreamError.data)).not.toContain('stack');
    });

    it.each([
        ['TIMEOUT', 504],
        ['NETWORK_ERROR', 502],
        ['RESPONSE_TOO_LARGE', 502],
        ['INVALID_CREDENTIALS', 401],
        ['PROXY_NOT_CONFIGURED', 501],
    ])('maps a requester %s to %s', async (code, status) => {
        const { useCase } = setup({
            proxyRequest: async () => {
                throw new ProxyRequestError(code, 'safe message');
            },
        });
        const error = await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
        expect(error.output.statusCode).toBe(status);
        expect(error.data.code).toBe(code);
        expect(error.data.expose).toBe(true);
    });

    it('refuses binary responses unless the module allows them', async () => {
        const png = { status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from([1, 2]), contentType: 'image/png', redirectBlocked: false };
        const strict = setup({ proxyRequest: async () => png });
        const error = await strict.useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' }).catch((e) => e);
        expect(error.output.statusCode).toBe(415);

        const binary = setup({ def: { ...definition, proxy: { ...definition.proxy, binary: true } }, proxyRequest: async () => png });
        const result = await binary.useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' });
        expect(result.body).toMatchObject({ data: 'AQI=', dataEncoding: 'base64' });
    });

    it('strips credential headers from the upstream response', async () => {
        const { useCase } = setup({
            proxyRequest: async () => upstream(200, {}, { 'set-cookie': 's=1', 'x-crm-key': 'echo', 'x-request-id': 'r1' }),
        });
        const result = await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' });
        expect(result.body.headers).toEqual({ 'content-type': 'application/json', 'x-request-id': 'r1' });
    });

    it('sends a declared module base URL to the requester', async () => {
        const { useCase, api } = setup({
            def: { ...definition, proxy: { ...definition.proxy, baseUrl: (a) => `https://${a.api_key_name.toLowerCase()}.example.com` } },
        });
        await useCase.execute('e1', user, { method: 'GET', path: '/contacts/7' });
        expect(api._proxyRequest.mock.calls[0][0].baseUrl).toBe('https://x-crm-key.example.com');
    });
});
