const { detect } = require('../lib/detect');

describe('detect', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('returns true when NETLIFY env var is set', () => {
        process.env.NETLIFY = 'true';
        expect(detect()).toBe(true);
    });

    test('returns false when NETLIFY env var is not set', () => {
        delete process.env.NETLIFY;
        expect(detect()).toBe(false);
    });

    test('returns true for any truthy NETLIFY value', () => {
        process.env.NETLIFY = '1';
        expect(detect()).toBe(true);
    });
});
