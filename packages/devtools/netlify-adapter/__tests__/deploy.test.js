const { preflightCheck } = require('../lib/deploy');

describe('preflightCheck', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('reports missing Netlify CLI and auth token', async () => {
        delete process.env.NETLIFY_AUTH_TOKEN;
        // CLI is likely not installed in test env
        const result = await preflightCheck({
            name: 'test',
            database: { postgres: { enable: true } },
        });

        // Should report at least missing DATABASE_URL
        expect(result).toHaveProperty('ready');
        expect(result).toHaveProperty('missing');
        expect(Array.isArray(result.missing)).toBe(true);
    });

    test('reports missing DATABASE_URL', async () => {
        delete process.env.DATABASE_URL;
        process.env.NETLIFY_AUTH_TOKEN = 'test-token';

        const result = await preflightCheck({
            name: 'test',
            database: { postgres: { enable: true } },
        });

        expect(result.missing.some((m) => m.includes('DATABASE_URL'))).toBe(
            true
        );
    });

    test('reports missing QSTASH_TOKEN when qstash configured', async () => {
        delete process.env.QSTASH_TOKEN;
        process.env.NETLIFY_AUTH_TOKEN = 'test-token';
        process.env.DATABASE_URL = 'postgresql://test';

        const result = await preflightCheck({
            name: 'test',
            database: { postgres: { enable: true } },
            queue: { provider: 'qstash' },
        });

        expect(result.missing.some((m) => m.includes('QSTASH_TOKEN'))).toBe(
            true
        );
    });

    test('passes when all prerequisites met', async () => {
        process.env.NETLIFY_AUTH_TOKEN = 'test-token';
        process.env.DATABASE_URL = 'postgresql://test';

        const result = await preflightCheck({
            name: 'test',
            database: { postgres: { enable: true } },
            integrations: [{ Definition: { name: 'test' } }],
        });

        expect(result.ready).toBe(true);
        expect(result.missing).toHaveLength(0);
    });
});
