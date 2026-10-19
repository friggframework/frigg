const { detect } = require('../lib/detect');
const { isDeployedRuntime } = require('@friggframework/core/providers/runtime-detection');
const provider = require('..');

describe('detect', () => {
    test('true inside a generated function (the preamble sets FRIGG_PROVIDER=netlify)', () => {
        expect(detect({ FRIGG_PROVIDER: 'netlify' })).toBe(true);
    });

    test('true when NETLIFY is set (builds)', () => {
        expect(detect({ NETLIFY: 'true' })).toBe(true);
        expect(detect({ NETLIFY: '1' })).toBe(true);
    });

    test('false with no Netlify signal, or another provider', () => {
        expect(detect({})).toBe(false);
        expect(detect({ FRIGG_PROVIDER: 'aws' })).toBe(false);
    });

    test('reads process.env by default', () => {
        const saved = process.env.FRIGG_PROVIDER;
        process.env.FRIGG_PROVIDER = 'netlify';
        try {
            expect(detect()).toBe(true);
        } finally {
            if (saved === undefined) delete process.env.FRIGG_PROVIDER;
            else process.env.FRIGG_PROVIDER = saved;
        }
    });
});

describe("core's isDeployedRuntime on Netlify", () => {
    test('a deployed Netlify Function with STAGE=dev counts as deployed (no AWS Lambda variables)', () => {
        expect(isDeployedRuntime({ FRIGG_PROVIDER: 'netlify', STAGE: 'dev' }, { provider })).toBe(true);
    });

    test('netlify dev is a local run', () => {
        expect(
            isDeployedRuntime({ FRIGG_PROVIDER: 'netlify', NETLIFY_DEV: 'true', STAGE: 'dev' }, { provider })
        ).toBe(false);
    });
});
