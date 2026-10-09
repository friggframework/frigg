/**
 * Plugin Validator Tests
 *
 * Test suite following TDD best practices for plugin conflict detection
 */

const {
    detectConflictingPlugins,
    validateAndCleanPlugins,
    validatePackagingConfiguration,
} = require('./plugin-validator');

describe('Plugin Validator', () => {
    describe('detectConflictingPlugins', () => {
        it('should detect conflict when both esbuild and jetpack are present', () => {
            const plugins = ['serverless-esbuild', 'serverless-jetpack'];
            const result = detectConflictingPlugins(plugins);

            expect(result.hasConflict).toBe(true);
            expect(result.hasEsbuild).toBe(true);
            expect(result.hasJetpack).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('overlapping functionality');
            expect(result.recommendations).toHaveLength(3);
        });

        it('should not detect conflict when only esbuild is present', () => {
            const plugins = ['serverless-esbuild'];
            const result = detectConflictingPlugins(plugins);

            expect(result.hasConflict).toBe(false);
            expect(result.hasEsbuild).toBe(true);
            expect(result.hasJetpack).toBe(false);
            expect(result.warnings).toHaveLength(0);
        });

        it('should warn about legacy jetpack usage', () => {
            const plugins = ['serverless-jetpack'];
            const result = detectConflictingPlugins(plugins);

            expect(result.hasConflict).toBe(false);
            expect(result.hasEsbuild).toBe(false);
            expect(result.hasJetpack).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('legacy packaging plugin');
            expect(result.recommendations.length).toBeGreaterThan(0);
        });

        it('should warn when no packaging plugin is present', () => {
            const plugins = ['serverless-offline'];
            const result = detectConflictingPlugins(plugins);

            expect(result.hasConflict).toBe(false);
            expect(result.hasEsbuild).toBe(false);
            expect(result.hasJetpack).toBe(false);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('No packaging plugin detected');
        });

        it('should handle empty plugin array', () => {
            const result = detectConflictingPlugins([]);

            expect(result.hasConflict).toBe(false);
            expect(result.hasEsbuild).toBe(false);
            expect(result.hasJetpack).toBe(false);
        });

        it('should handle undefined plugin array', () => {
            const result = detectConflictingPlugins();

            expect(result.hasConflict).toBe(false);
            expect(result.hasEsbuild).toBe(false);
            expect(result.hasJetpack).toBe(false);
        });
    });

    describe('validateAndCleanPlugins', () => {
        it('should auto-fix conflict by removing jetpack when autoFix is true', () => {
            const plugins = ['serverless-esbuild', 'serverless-jetpack', 'serverless-offline'];
            const result = validateAndCleanPlugins(plugins, { autoFix: true, silent: true });

            expect(result.modified).toBe(true);
            expect(result.plugins).toEqual(['serverless-esbuild', 'serverless-offline']);
            expect(result.plugins).not.toContain('serverless-jetpack');
            expect(result.validation.hasConflict).toBe(true);
        });

        it('should not modify plugins when autoFix is false', () => {
            const plugins = ['serverless-esbuild', 'serverless-jetpack'];
            const result = validateAndCleanPlugins(plugins, { autoFix: false, silent: true });

            expect(result.modified).toBe(false);
            expect(result.plugins).toEqual(plugins);
            expect(result.validation.hasConflict).toBe(true);
        });

        it('should not modify plugins when no conflict exists', () => {
            const plugins = ['serverless-esbuild', 'serverless-offline'];
            const result = validateAndCleanPlugins(plugins, { autoFix: true, silent: true });

            expect(result.modified).toBe(false);
            expect(result.plugins).toEqual(plugins);
            expect(result.validation.hasConflict).toBe(false);
        });

        it('should preserve order of non-conflicting plugins', () => {
            const plugins = [
                'serverless-offline',
                'serverless-esbuild',
                'serverless-jetpack',
                '@friggframework/serverless-plugin',
            ];
            const result = validateAndCleanPlugins(plugins, { autoFix: true, silent: true });

            expect(result.plugins).toEqual([
                'serverless-offline',
                'serverless-esbuild',
                '@friggframework/serverless-plugin',
            ]);
        });

        it('should handle empty plugin array', () => {
            const result = validateAndCleanPlugins([], { autoFix: true, silent: true });

            expect(result.modified).toBe(false);
            expect(result.plugins).toEqual([]);
        });

        it('should use default options when none provided', () => {
            const plugins = ['serverless-esbuild', 'serverless-jetpack'];

            // Suppress console output for test
            const originalWarn = console.warn;
            console.warn = jest.fn();

            const result = validateAndCleanPlugins(plugins);

            expect(result.modified).toBe(true);
            expect(result.plugins).not.toContain('serverless-jetpack');
            expect(console.warn).toHaveBeenCalled();

            console.warn = originalWarn;
        });

        it('should not log warnings when silent is true', () => {
            const plugins = ['serverless-esbuild', 'serverless-jetpack'];
            const originalWarn = console.warn;
            console.warn = jest.fn();

            validateAndCleanPlugins(plugins, { autoFix: true, silent: true });

            expect(console.warn).not.toHaveBeenCalled();

            console.warn = originalWarn;
        });
    });

    describe('validatePackagingConfiguration', () => {
        it('should validate a properly configured esbuild setup', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {
                    esbuild: {
                        bundle: true,
                        external: ['@aws-sdk/*', '@prisma/client'],
                    },
                },
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        it('should warn when esbuild plugin is present but config is missing', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {},
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.valid).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('custom.esbuild configuration is missing');
        });

        it('should warn when AWS SDK is not externalized', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {
                    esbuild: {
                        bundle: true,
                        external: ['@prisma/client'],
                    },
                },
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.valid).toBe(true);
            expect(result.warnings.some(w => w.includes('AWS SDK'))).toBe(true);
        });

        it('should warn when Prisma is not externalized', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {
                    esbuild: {
                        bundle: true,
                        external: ['@aws-sdk/*'],
                    },
                },
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.valid).toBe(true);
            expect(result.warnings.some(w => w.includes('Prisma'))).toBe(true);
        });

        it('should accept aws-sdk as valid AWS SDK externalization', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {
                    esbuild: {
                        external: ['aws-sdk', '@prisma/client'],
                    },
                },
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.warnings.some(w => w.includes('AWS SDK'))).toBe(false);
        });

        it('should accept .prisma/* as valid Prisma externalization', () => {
            const serverlessDefinition = {
                plugins: ['serverless-esbuild'],
                custom: {
                    esbuild: {
                        external: ['@aws-sdk/*', '.prisma/*'],
                    },
                },
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.warnings.some(w => w.includes('Prisma'))).toBe(false);
        });

        it('should handle serverless definition without plugins', () => {
            const serverlessDefinition = {
                custom: {},
            };

            const result = validatePackagingConfiguration(serverlessDefinition);

            expect(result.valid).toBe(true);
        });

        it('should handle empty serverless definition', () => {
            const result = validatePackagingConfiguration({});

            expect(result.valid).toBe(true);
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete migration scenario from jetpack to esbuild', () => {
            const plugins = [
                'serverless-offline',
                'serverless-jetpack',
                'serverless-esbuild',
                '@friggframework/serverless-plugin',
            ];

            const result = validateAndCleanPlugins(plugins, { autoFix: true, silent: true });

            expect(result.modified).toBe(true);
            expect(result.plugins).toEqual([
                'serverless-offline',
                'serverless-esbuild',
                '@friggframework/serverless-plugin',
            ]);
            expect(result.validation.hasConflict).toBe(true);
            expect(result.validation.hasEsbuild).toBe(true);
            expect(result.validation.hasJetpack).toBe(true);
        });

        it('should provide helpful recommendations for legacy configurations', () => {
            const plugins = ['serverless-jetpack'];
            const result = validateAndCleanPlugins(plugins, { autoFix: false, silent: true });

            expect(result.validation.recommendations).toContain(
                'Consider migrating to serverless-esbuild for improved build times and tree-shaking.'
            );
            expect(
                result.validation.recommendations.some(r => r.includes('migration guidance'))
            ).toBe(true);
        });

        it('should work with Frigg standard plugin configuration', () => {
            const standardPlugins = [
                'serverless-esbuild',
                'serverless-offline-sqs',
                'serverless-offline',
                '@friggframework/serverless-plugin',
            ];

            const result = validateAndCleanPlugins(standardPlugins, {
                autoFix: true,
                silent: true,
            });

            expect(result.modified).toBe(false);
            expect(result.plugins).toEqual(standardPlugins);
            expect(result.validation.hasConflict).toBe(false);
        });
    });
});
