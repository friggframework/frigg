import { FetchError } from './fetch-error';

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

    it('can be created asynchronously', async () => {
        const resource = 'http://example.com';
        const init = {};
        const response = {
            status: 500,
            statusText: 'Space aliens!',
            headers: Object.entries({ 'cache-control': '123' }) as Iterable<[string, string]>,
            text: async () => '<!doctype html>',
        };

        const error = await FetchError.create({
            resource,
            init,
            response,
        });

        expect(error).toHaveProperty('message');
        expect(error.message).toContain('GET http://example.com');
        expect(error.message).toContain('500 Space aliens!');
        expect(error.message).toContain('"cache-control": "123"');
        expect(error.message).toContain('<!doctype html>');
    });

    it('can be passed an object for the body', async () => {
        const error = new FetchError({ responseBody: { test: true } });
        expect(error).toHaveProperty('message');
        expect(error.message).toContain('"test": true');
    });

    it('ignores response body if already streamed', async () => {
        const response = { bodyUsed: true };
        const error = await FetchError.create({ response });

        expect(error).toHaveProperty('message');
        expect(error.message).toContain('<response body is unavailable>');
    });

    it('prints a formData body legibly', async () => {
        const response = {
            status: 500,
            statusText: 'Space aliens!',
            headers: Object.entries({ 'cache-control': '123' }) as Iterable<[string, string]>,
            text: async () => '<!doctype html>',
        };

        const params = new URLSearchParams();
        params.append('test', 'test');
        const init = {
            method: 'POST',
            credentials: 'include',
            headers: {},
            query: {},
            body: params,
            returnFullRes: false,
        };
        const error = await FetchError.create({ response, init });

        expect(error).toHaveProperty('message');
        expect(error.message).toContain('test=test');
    });

    it('exposes statusCode property from response.status', async () => {
        const response = {
            status: 401,
            statusText: 'Unauthorized',
            headers: Object.entries({ 'content-type': 'application/json' }) as Iterable<[string, string]>,
            text: async () => '{"error": "Invalid token"}',
        };

        const error = await FetchError.create({
            resource: 'https://api.example.com/data',
            init: { method: 'GET' },
            response,
        });

        expect(error).toHaveProperty('statusCode');
        expect(error.statusCode).toBe(401);
        expect(error.statusCode).toBe(error.response!.status);
    });

    it('statusCode is undefined when response is null', async () => {
        const error = await FetchError.create({
            resource: 'https://api.example.com/data',
            init: { method: 'GET' },
            response: undefined,
        });

        expect(error.statusCode).toBeUndefined();
    });
});
