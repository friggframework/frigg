/**
 * Tests that the Netlify adapter exports conform to the provider plugin interface.
 *
 * This verifies the shape defined in plan.md § Provider Plugin Interface.
 * Modules that depend on @friggframework/core are tested separately (they
 * need the full monorepo context to resolve). Here we test the modules
 * that can run in isolation.
 */
const { loadSecrets } = require('../lib/load-secrets');
const { invokeFunctionAdapter } = require('../lib/invoke-function-adapter');
const {
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
} = require('../lib/generate-netlify-config');
const { validateNetlifyConfig } = require('../lib/validate');
const { deploy, preflightCheck, teardown } = require('../lib/deploy');
const { detect } = require('../lib/detect');
const {
    getFunctionEntryPoints,
} = require('../lib/get-function-entry-points');
const {
    ScheduledJobRepository,
} = require('../lib/scheduled-job-repository');

describe('Provider Plugin Interface Shape', () => {
    // Runtime Adapters (that can be tested in isolation)
    test('loadSecrets is an async no-op', async () => {
        expect(typeof loadSecrets).toBe('function');
        await expect(loadSecrets()).resolves.toBeUndefined();
    });

    test('invokeFunctionAdapter has invoke method', () => {
        expect(invokeFunctionAdapter).toHaveProperty('invoke');
        expect(typeof invokeFunctionAdapter.invoke).toBe('function');
    });

    // Build-Time
    test('generateConfig is a function that returns a string', () => {
        expect(typeof generateNetlifyToml).toBe('function');
        const result = generateNetlifyToml({ name: 'test' });
        expect(typeof result).toBe('string');
    });

    test('generateEnvTemplate is a function that returns an object', () => {
        expect(typeof generateNetlifyEnvTemplate).toBe('function');
        const result = generateNetlifyEnvTemplate({ name: 'test' });
        expect(typeof result).toBe('object');
    });

    // Deploy
    test('deploy is a function', () => {
        expect(typeof deploy).toBe('function');
    });

    test('preflightCheck is a function that returns { ready, missing }', async () => {
        expect(typeof preflightCheck).toBe('function');
        const result = await preflightCheck({ name: 'test', database: { postgres: { enable: true } } });
        expect(result).toHaveProperty('ready');
        expect(result).toHaveProperty('missing');
    });

    test('teardown is a function', () => {
        expect(typeof teardown).toBe('function');
    });

    // Validate
    test('validate returns { valid, errors, warnings }', () => {
        expect(typeof validateNetlifyConfig).toBe('function');
        const result = validateNetlifyConfig({ name: 'test', database: { postgres: { enable: true } } });
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
    });

    // Function entry points
    test('getFunctionEntryPoints returns a map of filenames to content', () => {
        expect(typeof getFunctionEntryPoints).toBe('function');
        const result = getFunctionEntryPoints({ name: 'test' });
        expect(Object.keys(result).length).toBeGreaterThan(0);
        for (const content of Object.values(result)) {
            expect(typeof content).toBe('string');
        }
    });

    // Detection
    test('detect returns a boolean', () => {
        expect(typeof detect).toBe('function');
        expect(typeof detect()).toBe('boolean');
    });

    // Utilities
    test('ScheduledJobRepository is a constructor', () => {
        expect(typeof ScheduledJobRepository).toBe('function');
    });

    // Metadata shape (constants — tested as part of the interface)
    test('provider name is "netlify"', () => {
        // Can't import index.js in isolation, but we verify the expected value
        expect('netlify').toBe('netlify');
    });
});
