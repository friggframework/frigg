/**
 * AWS Discovery Configuration Tests
 *
 * Tests for AppDefinition-level discovery control options
 * addressing GitHub Issue #481 - Issue 5
 */

const { shouldRunDiscovery, gatherDiscoveredResources } = require('./resource-discovery');

// Mock dependencies
jest.mock('./providers/provider-factory');
jest.mock('./cloudformation-discovery');
jest.mock('../networking/vpc-discovery');
jest.mock('../security/kms-discovery');
jest.mock('../database/aurora-discovery');
jest.mock('../parameters/ssm-discovery');

describe('AWS Discovery Configuration (Issue #481 - Issue 5)', () => {
    beforeEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        jest.clearAllMocks();
    });

    describe('shouldRunDiscovery - Priority Order', () => {
        it('should use AppDefinition.aws.discovery.enabled when explicitly set to true', () => {
            const appDefinition = {
                aws: { discovery: { enabled: true } },
                vpc: { enable: false }, // Would normally skip
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(true);
        });

        it('should use AppDefinition.aws.discovery.enabled when explicitly set to false', () => {
            const appDefinition = {
                aws: { discovery: { enabled: false } },
                vpc: { enable: true }, // Would normally run
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(false);
        });

        it('should fall back to env var when AppDefinition not set', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                vpc: { enable: true }, // Would normally run
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(false);
        });

        it('should auto-detect when neither AppDefinition nor env var is set', () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(true);
        });

        it('should prioritize AppDefinition over env var', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                aws: { discovery: { enabled: true } }, // Explicit override
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(true); // AppDefinition wins
        });
    });

    describe('AppDefinition.aws.discovery.enabled', () => {
        it('should log when using AppDefinition configuration', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const appDefinition = {
                aws: { discovery: { enabled: true } },
            };

            shouldRunDiscovery(appDefinition);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('AppDefinition.aws.discovery.enabled: true')
            );

            consoleSpy.mockRestore();
        });

        it('should handle explicit false value', () => {
            const appDefinition = {
                aws: { discovery: { enabled: false } },
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(false);
        });

        it('should handle undefined correctly (fall through to next priority)', () => {
            const appDefinition = {
                aws: { discovery: { enabled: undefined } },
                vpc: { enable: true },
            };

            const result = shouldRunDiscovery(appDefinition);

            // Should skip when undefined (fall through to env var check)
            expect(result).toBe(true); // Auto-detect kicks in
        });
    });

    describe('Auto-detection based on features', () => {
        it('should run discovery when VPC is enabled', () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            expect(shouldRunDiscovery(appDefinition)).toBe(true);
        });

        it('should run discovery when KMS encryption is enabled', () => {
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };

            expect(shouldRunDiscovery(appDefinition)).toBe(true);
        });

        it('should run discovery when SSM is enabled', () => {
            const appDefinition = {
                ssm: { enable: true },
            };

            expect(shouldRunDiscovery(appDefinition)).toBe(true);
        });

        it('should run discovery when PostgreSQL is enabled', () => {
            const appDefinition = {
                database: { postgres: { enable: true } },
            };

            expect(shouldRunDiscovery(appDefinition)).toBe(true);
        });

        it('should not run discovery when no features are enabled', () => {
            const appDefinition = {
                vpc: { enable: false },
                encryption: { fieldLevelEncryptionMethod: 'aes' },
            };

            expect(shouldRunDiscovery(appDefinition)).toBe(false);
        });
    });

    describe('gatherDiscoveredResources - failOnError behavior', () => {
        const { CloudProviderFactory } = require('./providers/provider-factory');
        const { CloudFormationDiscovery } = require('./cloudformation-discovery');

        beforeEach(() => {
            const mockProvider = {
                getVpcs: jest.fn(),
                getKmsKeys: jest.fn(),
            };

            CloudProviderFactory.create = jest.fn().mockReturnValue(mockProvider);

            // Mock CloudFormation discovery to throw error
            CloudFormationDiscovery.mockImplementation(() => ({
                discoverFromStack: jest.fn().mockRejectedValue(
                    new Error('User is not authorized to perform: ec2:DescribeVpcs')
                ),
            }));
        });

        it('should throw error when failOnError is true', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                aws: {
                    discovery: {
                        enabled: true,
                        failOnError: true,
                    },
                },
            };

            await expect(gatherDiscoveredResources(appDefinition)).rejects.toThrow(
                'User is not authorized'
            );
        });

        it('should return empty object when failOnError is false', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                aws: {
                    discovery: {
                        enabled: true,
                        failOnError: false,
                    },
                },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            expect(result).toEqual({});
        });

        it('should default to false when failOnError is not set', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            expect(result).toEqual({});
        });

        it('should log helpful message when failing gracefully', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
                aws: { discovery: { failOnError: false } },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Set aws.discovery.failOnError = true')
            );

            consoleWarnSpy.mockRestore();
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle restrictive IAM with explicit disable', () => {
            const appDefinition = {
                vpc: { enable: true },
                aws: {
                    discovery: {
                        enabled: false, // Explicit disable for restrictive IAM
                    },
                },
            };

            const result = shouldRunDiscovery(appDefinition);

            expect(result).toBe(false);
        });

        it('should allow strict mode for production deployments', async () => {
            const { CloudProviderFactory } = require('./providers/provider-factory');
            const { CloudFormationDiscovery } = require('./cloudformation-discovery');

            CloudFormationDiscovery.mockImplementation(() => ({
                discoverFromStack: jest.fn().mockRejectedValue(new Error('IAM error')),
            }));

            const appDefinition = {
                name: 'prod-app',
                vpc: { enable: true },
                aws: {
                    discovery: {
                        enabled: true,
                        failOnError: true, // Strict mode for production
                    },
                },
            };

            await expect(gatherDiscoveredResources(appDefinition)).rejects.toThrow();
        });

        it('should allow graceful degradation for dev environments', async () => {
            const appDefinition = {
                name: 'dev-app',
                vpc: { enable: true },
                aws: {
                    discovery: {
                        enabled: true,
                        failOnError: false, // Graceful for dev
                    },
                },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            expect(result).toEqual({});
        });
    });
});
