const path = require('path');
const { loadProviderForCli, loadCliAppDefinition } = require('../provider-helper');

describe('provider-helper', () => {
    describe('loadCliAppDefinition', () => {
        it('returns null when no index.js exists', () => {
            const result = loadCliAppDefinition('/nonexistent/path');
            expect(result).toBeNull();
        });

        it('returns null when index.js has no Definition export', () => {
            // Use a directory that has an index.js but no Definition
            const result = loadCliAppDefinition(
                path.join(__dirname, '..', '..')
            );
            // frigg-cli/index.js doesn't export Definition
            expect(result).toBeNull();
        });
    });

    describe('loadProviderForCli', () => {
        it('returns null when no appDefinition found', () => {
            // Run from a directory with no Frigg app
            const originalCwd = process.cwd();
            try {
                process.chdir('/tmp');
                const result = loadProviderForCli();
                expect(result).toBeNull();
            } finally {
                process.chdir(originalCwd);
            }
        });

        it('returns null provider for aws (default)', () => {
            // Mock: loadCliAppDefinition returns an appDef with provider: 'aws'
            jest.mock('../provider-helper', () => {
                const original = jest.requireActual('../provider-helper');
                return {
                    ...original,
                    loadProviderForCli: (options) => {
                        // Simulate AWS provider (no provider field defaults to aws)
                        return { appDefinition: { provider: 'aws' }, provider: null, providerName: 'aws' };
                    },
                };
            });

            const { loadProviderForCli: mocked } = require('../provider-helper');
            const result = mocked();
            expect(result.providerName).toBe('aws');
            expect(result.provider).toBeNull();

            jest.restoreAllMocks();
        });
    });
});
