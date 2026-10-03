const { Requester } = require('./requester');
const { ProxyRequestError } = require('../proxy/proxy-errors');

const BASE = 'https://api.example.com/v2';

function response(status, body = '', headers = {}) {
    const init = { status, headers };
    // The fetch Response constructor refuses a body on these statuses.
    const noBody = [204, 205, 304].includes(status) || (status >= 300 && status < 400 && !body);
    return new Response(noBody ? null : body, init);
}

const json = (status, value, headers = {}) =>
    response(status, JSON.stringify(value), {
        'content-type': 'application/json',
        ...headers,
    });

class KeyRequester extends Requester {
    constructor(params) {
        super({ backOff: [0, 0, 0], ...params });
        this.baseUrl = BASE;
        this.notified = [];
    }
    async addAuthHeaders(headers) {
        headers['x-api-key'] = 'module-key';
        return headers;
    }
    async notify(type, payload) {
        this.notified.push({ type, payload });
    }
}

class OAuthLikeRequester extends KeyRequester {
    constructor(params) {
        super(params);
        this.isRefreshable = true;
        this.token = 'old';
        this.refreshes = 0;
    }
    async addAuthHeaders(headers) {
        headers.Authorization = `Bearer ${this.token}`;
        return headers;
    }
    async refreshAuth() {
        this.refreshes++;
        this.token = 'new';
        return true;
    }
}

const defaults = { timeoutMs: 2000, maxResponseBytes: 1024 * 1024 };

function build(Requester, responses) {
    const calls = [];
    const fetch = jest.fn(async (url, options) => {
        calls.push({ url, options });
        const next = responses.shift();
        if (typeof next === 'function') return next(url, options);
        if (!next) throw new Error('unexpected fetch');
        return next;
    });
    return { requester: new Requester({ fetch }), fetch, calls };
}

describe('Requester._proxyRequest (ADR-052 §8)', () => {
    it('calls the module base URL plus the path, with the module auth and the caller headers', async () => {
        const { requester, calls } = build(KeyRequester, [json(200, { ok: true })]);
        const result = await requester._proxyRequest({
            ...defaults,
            method: 'GET',
            path: '/contacts/7',
            query: { limit: 10 },
            headers: { accept: 'application/json' },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${BASE}/contacts/7?limit=10`);
        expect(calls[0].options.headers).toEqual({
            accept: 'application/json',
            'x-api-key': 'module-key',
        });
        expect(calls[0].options.redirect).toBe('manual');
        expect(result.status).toBe(200);
        expect(JSON.parse(result.body.toString())).toEqual({ ok: true });
        expect(result.contentType).toBe('application/json');
    });

    it('uses a declared proxy base URL over the requester base URL', async () => {
        const { requester, calls } = build(KeyRequester, [json(200, {})]);
        await requester._proxyRequest({
            ...defaults,
            method: 'GET',
            path: '/x',
            baseUrl: 'https://tenant.example.com/api',
        });
        expect(calls[0].url).toBe('https://tenant.example.com/api/x');
    });

    it('refuses a bad path or a missing base URL before any network call', async () => {
        const { requester, fetch } = build(KeyRequester, []);
        await expect(
            requester._proxyRequest({ ...defaults, method: 'GET', path: '//evil.example/x' })
        ).rejects.toMatchObject({ code: 'INVALID_PROXY_REQUEST' });

        requester.baseUrl = undefined;
        await expect(
            requester._proxyRequest({ ...defaults, method: 'GET', path: '/x' })
        ).rejects.toMatchObject({ code: 'PROXY_NOT_CONFIGURED' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('returns upstream errors instead of throwing, and does not retry them', async () => {
        const { requester, fetch } = build(KeyRequester, [
            json(404, { message: 'nope' }),
            json(503, { message: 'down' }),
            json(429, { message: 'slow down' }, { 'retry-after': '30' }),
        ]);
        expect((await requester._proxyRequest({ ...defaults, method: 'GET', path: '/a' })).status).toBe(404);
        expect((await requester._proxyRequest({ ...defaults, method: 'GET', path: '/a' })).status).toBe(503);
        const limited = await requester._proxyRequest({ ...defaults, method: 'GET', path: '/a' });
        expect(limited.status).toBe(429);
        expect(limited.headers['retry-after']).toBe('30');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('refreshes an expired OAuth token once and retries (single-flight refresh)', async () => {
        const { requester, calls } = build(OAuthLikeRequester, [json(401, {}), json(200, { ok: 1 })]);
        const result = await requester._proxyRequest({ ...defaults, method: 'GET', path: '/me' });
        expect(result.status).toBe(200);
        expect(requester.refreshes).toBe(1);
        expect(calls[1].options.headers.Authorization).toBe('Bearer new');
    });

    it('reports rejected credentials as INVALID_CREDENTIALS and marks them invalid', async () => {
        const { requester } = build(KeyRequester, [json(401, {}), json(401, {}), json(401, {}), json(401, {})]);
        await expect(
            requester._proxyRequest({ ...defaults, method: 'GET', path: '/me' })
        ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
        expect(requester.notified.map((n) => n.type)).toEqual(['INVALID_AUTH']);
    });

    it('follows a same-API redirect but never one to another host', async () => {
        const same = build(KeyRequester, [
            response(302, '', { location: `${BASE}/contacts/8` }),
            json(200, { id: 8 }),
        ]);
        const followed = await same.requester._proxyRequest({ ...defaults, method: 'GET', path: '/contacts/7' });
        expect(followed.status).toBe(200);
        expect(same.calls[1].url).toBe(`${BASE}/contacts/8`);

        const other = build(KeyRequester, [response(302, '', { location: 'https://evil.example/steal' })]);
        const blocked = await other.requester._proxyRequest({ ...defaults, method: 'GET', path: '/contacts/7' });
        expect(blocked.status).toBe(302);
        expect(blocked.redirectBlocked).toBe(true);
        expect(other.fetch).toHaveBeenCalledTimes(1);

        const outside = build(KeyRequester, [response(301, '', { location: 'https://api.example.com/admin' })]);
        const outsideBase = await outside.requester._proxyRequest({ ...defaults, method: 'GET', path: '/x' });
        expect(outsideBase.redirectBlocked).toBe(true);
    });

    it('re-checks each redirect hop against the allow-list and stops after three hops', async () => {
        const denied = build(KeyRequester, [response(302, '', { location: `${BASE}/admin` })]);
        const result = await denied.requester._proxyRequest({
            ...defaults,
            method: 'GET',
            path: '/a',
            isAllowedRedirect: (path) => path !== '/admin',
        });
        expect(result.status).toBe(302);
        expect(denied.fetch).toHaveBeenCalledTimes(1);

        const loop = build(KeyRequester, [
            response(302, '', { location: `${BASE}/1` }),
            response(302, '', { location: `${BASE}/2` }),
            response(302, '', { location: `${BASE}/3` }),
            response(302, '', { location: `${BASE}/4` }),
        ]);
        const stopped = await loop.requester._proxyRequest({ ...defaults, method: 'GET', path: '/0' });
        expect(stopped.status).toBe(302);
        expect(loop.fetch).toHaveBeenCalledTimes(4);
    });

    it('turns a 303 after POST into a GET without the body', async () => {
        const { requester, calls } = build(KeyRequester, [
            response(303, '', { location: `${BASE}/jobs/1` }),
            json(200, {}),
        ]);
        await requester._proxyRequest({ ...defaults, method: 'POST', path: '/jobs', body: '{"a":1}' });
        expect(calls[1].options.method).toBe('GET');
        expect(calls[1].options.body).toBeUndefined();
    });

    it('refuses a response larger than the limit', async () => {
        const declared = build(KeyRequester, [response(200, 'x', { 'content-length': '5000' })]);
        await expect(
            declared.requester._proxyRequest({ ...defaults, maxResponseBytes: 100, method: 'GET', path: '/big' })
        ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });

        const streamed = build(KeyRequester, [response(200, 'y'.repeat(500))]);
        await expect(
            streamed.requester._proxyRequest({ ...defaults, maxResponseBytes: 100, method: 'GET', path: '/big' })
        ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    });

    it('gives up at the deadline', async () => {
        const { requester } = build(KeyRequester, [() => new Promise(() => {})]);
        const started = Date.now();
        await expect(
            requester._proxyRequest({ ...defaults, timeoutMs: 50, method: 'GET', path: '/slow' })
        ).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('reports a connection failure as NETWORK_ERROR without retrying', async () => {
        const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
        const { requester, fetch } = build(KeyRequester, [
            () => Promise.reject(reset),
        ]);
        const error = await requester
            ._proxyRequest({ ...defaults, method: 'GET', path: '/x' })
            .catch((e) => e);
        expect(error).toBeInstanceOf(ProxyRequestError);
        expect(error.code).toBe('NETWORK_ERROR');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(error.message).not.toContain('api.example.com');
    });
});
