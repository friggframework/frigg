const fetch = require('node-fetch');
const { stripIndent } = require('common-tags');
const { FetchError } = require('./fetch-error');
const FormData = require('form-data');

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
            headers: Object.entries({ 'cache-control': '123' }), // needs to be an Iterable
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

    it.only('prints a formData body legibly', async () => {
        const response = {
            status: 500,
            statusText: 'Space aliens!',
            headers: Object.entries({ 'cache-control': '123' }), // needs to be an Iterable
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
});
