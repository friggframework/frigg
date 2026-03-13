const {
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
} = require('../lib/generate-netlify-config');

describe('generateNetlifyToml', () => {
    const baseAppDefinition = {
        name: 'test-app',
        integrations: [
            { Definition: { name: 'hubspot' } },
            { Definition: { name: 'salesforce' } },
        ],
    };

    test('generates valid TOML with build section', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('[build]');
        expect(toml).toContain('command = "npm run build"');
        expect(toml).toContain('functions = "netlify/functions"');
    });

    test('generates Node.js version in build.environment', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('[build.environment]');
        expect(toml).toContain('NODE_VERSION = "18"');
    });

    test('generates esbuild bundler configuration', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('[functions]');
        expect(toml).toContain('node_bundler = "esbuild"');
        expect(toml).toContain('node_modules/.prisma/**');
        expect(toml).toContain('node_modules/@friggframework/core/generated/**');
        expect(toml).toContain('external_node_modules = ["express"');
        // Frigg packages must be external — they use dynamic requires that break esbuild
        expect(toml).toContain('@friggframework/core');
        expect(toml).toContain('@friggframework/provider-netlify');
    });

    test('does not include backend/** in included_files (nft traces it via static require)', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).not.toContain('backend/**');
    });

    test('generates redirect for v2 API routes', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('from = "/api/v2/*"');
        expect(toml).toContain('to = "/.netlify/functions/auth"');
    });

    test('generates redirect for user routes', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('from = "/user/*"');
        expect(toml).toContain('to = "/.netlify/functions/user"');
    });

    test('generates redirect for health routes', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('from = "/health/*"');
        expect(toml).toContain('to = "/.netlify/functions/health"');
    });

    test('generates integration-specific webhook and route redirects', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain(
            'from = "/api/hubspot-integration/webhooks/*"'
        );
        expect(toml).toContain('from = "/api/hubspot-integration/*"');
        expect(toml).toContain(
            'from = "/api/salesforce-integration/webhooks/*"'
        );
        expect(toml).toContain('from = "/api/salesforce-integration/*"');
    });

    test('generates queue worker redirect', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('from = "/api/queue"');
        expect(toml).toContain(
            'to = "/.netlify/functions/worker-background"'
        );
    });

    test('generates scheduled-sync cron schedule', () => {
        const toml = generateNetlifyToml(baseAppDefinition);

        expect(toml).toContain('[functions."scheduled-sync"]');
        expect(toml).toContain('schedule = "*/5 * * * *"');
    });

    test('accepts custom cron schedule', () => {
        const toml = generateNetlifyToml(baseAppDefinition, {
            cronSchedule: '*/10 * * * *',
        });

        expect(toml).toContain('schedule = "*/10 * * * *"');
    });

    test('accepts custom functions directory', () => {
        const toml = generateNetlifyToml(baseAppDefinition, {
            functionsDir: 'functions',
        });

        expect(toml).toContain('functions = "functions"');
    });

    test('handles empty integrations array', () => {
        const toml = generateNetlifyToml({ name: 'test' });

        // Should still have core redirects
        expect(toml).toContain('from = "/api/v2/*"');
        // Should not have integration-specific routes
        expect(toml).not.toContain('-integration/webhooks');
    });
});

describe('generateNetlifyEnvTemplate', () => {
    test('includes core Frigg env vars', () => {
        const envVars = generateNetlifyEnvTemplate({ name: 'test' });

        expect(envVars).toHaveProperty('BASE_URL');
        expect(envVars).toHaveProperty('DATABASE_URL');
        expect(envVars).toHaveProperty('FRIGG_API_KEY');
    });

    test('includes AES env vars when encryption is configured', () => {
        const envVars = generateNetlifyEnvTemplate({
            name: 'test',
            encryption: { fieldLevelEncryptionMethod: 'aes' },
        });

        expect(envVars).toHaveProperty('AES_KEY_ID');
        expect(envVars).toHaveProperty('AES_KEY');
    });

    test('excludes AES env vars when encryption is none', () => {
        const envVars = generateNetlifyEnvTemplate({
            name: 'test',
            encryption: { fieldLevelEncryptionMethod: 'none' },
        });

        expect(envVars).not.toHaveProperty('AES_KEY_ID');
        expect(envVars).not.toHaveProperty('AES_KEY');
    });

    test('includes QStash env vars when qstash queue is configured', () => {
        const envVars = generateNetlifyEnvTemplate({
            name: 'test',
            queue: { provider: 'qstash' },
        });

        expect(envVars).toHaveProperty('QSTASH_TOKEN');
        expect(envVars).toHaveProperty('QSTASH_CURRENT_SIGNING_KEY');
    });

    test('includes app-defined environment variables', () => {
        const envVars = generateNetlifyEnvTemplate({
            name: 'test',
            environment: {
                MY_CUSTOM_VAR: 'Description of custom var',
            },
        });

        expect(envVars).toHaveProperty('MY_CUSTOM_VAR');
    });
});
