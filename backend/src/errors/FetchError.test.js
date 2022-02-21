const chai = require('chai');
const fetch = require('node-fetch');
const { stripIndent } = require('common-tags');
const { FetchError } = require('./FetchError');

const { expect } = chai;

describe('FetchError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new FetchError();
        expect(error).to.have.property('message');
        expect(error).not.to.have.property('cause');
    });

    it('can be created asynchronously with default values', async () => {
        const error = await FetchError.create();
        expect(error).to.have.property('message');
        expect(error).not.to.have.property('cause');
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

        expect(error).to.have.property('message');
        expect(error.message).to.include('GET http://example.com');
        expect(error.message).to.include('500 Space aliens!');
        expect(error.message).to.include('"cache-control": "123"');
        expect(error.message).to.include('<!doctype html>');
    });

    it('can be passed an object for the body', async () => {
        const error = new FetchError({ responseBody: { test: true } });
        expect(error).to.have.property('message');
        expect(error.message).to.include('"test": true');
    });

    it('ignores response body if already streamed', async () => {
        const response = { bodyUsed: true };
        const error = await FetchError.create({ response });

        expect(error).to.have.property('message');
        expect(error.message).to.include('<response body is unavailable>');
    });
});
