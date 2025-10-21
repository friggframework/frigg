/**
 * Tests for Resource Discovery Service
 * 
 * Tests orchestration of cloud resource discovery
 */

const { shouldRunDiscovery, gatherDiscoveredResources } = require('./resource-discovery');

// Mock the provider factory and discovery classes
jest.mock('./providers/provider-factory');
jest.mock('../networking/vpc-discovery');
jest.mock('../security/kms-discovery');
jest.mock('../database/aurora-discovery');
jest.mock('../parameters/ssm-discovery');

const { CloudProviderFactory } = require('./providers/provider-factory');
const { VpcDiscovery } = require('../networking/vpc-discovery');
const { KmsDiscovery } = require('../security/kms-discovery');
const { AuroraDiscovery } = require('../database/aurora-discovery');
const { SsmDiscovery } = require('../parameters/ssm-discovery');

describe('Resource Discovery', () => {
    let mockProvider;
    let mockVpcDiscovery;
    let mockKmsDiscovery;
    let mockAuroraDiscovery;
    let mockSsmDiscovery;

    beforeEach(() => {
        // Reset environment
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        delete process.env.CLOUD_PROVIDER;
        delete process.env.AWS_REGION;

        // Create mock provider
        mockProvider = {
            getName: jest.fn().mockReturnValue('aws'),
        };

        // Create mock discoveries with default responses
        mockVpcDiscovery = {
            discover: jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
            }),
        };

        mockKmsDiscovery = {
            discover: jest.fn().mockResolvedValue({
                kmsKeyId: 'arn:aws:kms:us-east-1:123:key/abc',
            }),
        };

        mockAuroraDiscovery = {
            discover: jest.fn().mockResolvedValue({
                auroraClusterEndpoint: 'db.example.com',
            }),
        };

        mockSsmDiscovery = {
            discover: jest.fn().mockResolvedValue({
                parameters: [],
            }),
        };

        // Mock factory and discovery constructors
        CloudProviderFactory.create = jest.fn().mockReturnValue(mockProvider);
        VpcDiscovery.mockImplementation(() => mockVpcDiscovery);
        KmsDiscovery.mockImplementation(() => mockKmsDiscovery);
        AuroraDiscovery.mockImplementation(() => mockAuroraDiscovery);
        SsmDiscovery.mockImplementation(() => mockSsmDiscovery);
    });

    describe('shouldRunDiscovery()', () => {
        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is true', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const result = shouldRunDiscovery({ vpc: { enable: true } });

            expect(result).toBe(false);
        });

        it('should return true when VPC is enabled', () => {
            const result = shouldRunDiscovery({ vpc: { enable: true } });

            expect(result).toBe(true);
        });

        it('should return true when KMS encryption is enabled', () => {
            const result = shouldRunDiscovery({
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            });

            expect(result).toBe(true);
        });

        it('should return true when SSM is enabled', () => {
            const result = shouldRunDiscovery({ ssm: { enable: true } });

            expect(result).toBe(true);
        });

        it('should return true when Postgres database is enabled', () => {
            const result = shouldRunDiscovery({
                database: { postgres: { enable: true } },
            });

            expect(result).toBe(true);
        });

        it('should return false when no features require discovery', () => {
            const result = shouldRunDiscovery({
                vpc: { enable: false },
                encryption: { fieldLevelEncryptionMethod: 'aes' },
                ssm: { enable: false },
            });

            expect(result).toBe(false);
        });

        it('should return false for empty app definition', () => {
            const result = shouldRunDiscovery({});

            expect(result).toBe(false);
        });
    });

    describe('gatherDiscoveredResources()', () => {
        it('should skip discovery when not needed', async () => {
            const appDefinition = {
                vpc: { enable: false },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            expect(result).toEqual({});
            expect(CloudProviderFactory.create).not.toHaveBeenCalled();
        });

        it('should create AWS provider by default', async () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(CloudProviderFactory.create).toHaveBeenCalledWith('aws', 'us-east-1');
        });

        it('should respect CLOUD_PROVIDER environment variable', async () => {
            process.env.CLOUD_PROVIDER = 'gcp';
            process.env.AWS_REGION = 'us-central1';

            const appDefinition = {
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(CloudProviderFactory.create).toHaveBeenCalledWith('gcp', 'us-central1');
        });

        it('should respect AWS_REGION environment variable', async () => {
            process.env.AWS_REGION = 'eu-west-1';

            const appDefinition = {
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(CloudProviderFactory.create).toHaveBeenCalledWith('aws', 'eu-west-1');
        });

        it('should create discovery services with provider', async () => {
            const appDefinition = {
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(VpcDiscovery).toHaveBeenCalledWith(mockProvider);
            expect(KmsDiscovery).toHaveBeenCalledWith(mockProvider);
            expect(AuroraDiscovery).toHaveBeenCalledWith(mockProvider);
            expect(SsmDiscovery).toHaveBeenCalledWith(mockProvider);
        });

        it('should run VPC discovery when enabled', async () => {
            const appDefinition = {
                name: 'test-app',
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockVpcDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    serviceName: 'test-app',
                })
            );
        });

        it('should skip VPC discovery when disabled', async () => {
            const appDefinition = {
                vpc: { enable: false },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockVpcDiscovery.discover).not.toHaveBeenCalled();
        });

        it('should run KMS discovery when encryption is kms', async () => {
            const appDefinition = {
                name: 'test-app',
                encryption: { fieldLevelEncryptionMethod: 'kms' },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockKmsDiscovery.discover).toHaveBeenCalled();
        });

        it('should skip KMS discovery when encryption is not kms', async () => {
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'aes' },
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockKmsDiscovery.discover).not.toHaveBeenCalled();
        });

        it('should run database discovery when postgres is enabled', async () => {
            const appDefinition = {
                database: { postgres: { enable: true } },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockAuroraDiscovery.discover).toHaveBeenCalled();
        });

        it('should skip database discovery when postgres is disabled', async () => {
            const appDefinition = {
                database: { postgres: { enable: false } },
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockAuroraDiscovery.discover).not.toHaveBeenCalled();
        });

        it('should run SSM discovery when enabled', async () => {
            const appDefinition = {
                ssm: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockSsmDiscovery.discover).toHaveBeenCalled();
        });

        it('should aggregate results from all discoveries', async () => {
            mockVpcDiscovery.discover.mockResolvedValue({
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
            });

            mockKmsDiscovery.discover.mockResolvedValue({
                kmsKeyId: 'arn:aws:kms:key/abc',
            });

            mockAuroraDiscovery.discover.mockResolvedValue({
                auroraClusterEndpoint: 'db.example.com',
                auroraPort: 5432,
            });

            mockSsmDiscovery.discover.mockResolvedValue({
                parameters: ['param1'],
            });

            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                database: { postgres: { enable: true } },
                ssm: { enable: true },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            expect(result).toEqual({
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                kmsKeyId: 'arn:aws:kms:key/abc',
                auroraClusterEndpoint: 'db.example.com',
                auroraPort: 5432,
                parameters: ['param1'],
            });
        });

        it('should run discoveries in parallel for performance', async () => {
            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                database: { postgres: { enable: true } },
                ssm: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            // All should have been called (proving parallel execution)
            expect(mockVpcDiscovery.discover).toHaveBeenCalled();
            expect(mockKmsDiscovery.discover).toHaveBeenCalled();
            expect(mockAuroraDiscovery.discover).toHaveBeenCalled();
            expect(mockSsmDiscovery.discover).toHaveBeenCalled();
        });

        it('should handle discovery errors gracefully', async () => {
            mockVpcDiscovery.discover.mockRejectedValue(new Error('VPC API Error'));

            const appDefinition = {
                vpc: { enable: true },
            };

            const result = await gatherDiscoveredResources(appDefinition);

            // Should return empty object instead of throwing
            expect(result).toEqual({});
        });

        it('should pass configuration to discoveries', async () => {
            const appDefinition = {
                name: 'my-service',
                vpc: {
                    enable: true,
                    vpcId: 'vpc-custom',
                },
                database: {
                    postgres: {
                        enable: true,
                        clusterId: 'my-cluster',
                    },
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    keyAlias: 'alias/my-key',
                },
            };

            process.env.SLS_STAGE = 'production';

            await gatherDiscoveredResources(appDefinition);

            expect(mockVpcDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    serviceName: 'my-service',
                    stage: 'production',
                    vpcId: 'vpc-custom',
                })
            );

            expect(mockAuroraDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    databaseId: 'my-cluster',
                })
            );

            expect(mockKmsDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    keyAlias: 'alias/my-key',
                })
            );
        });

        it('should default stage to dev', async () => {
            delete process.env.SLS_STAGE;

            const appDefinition = {
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockVpcDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    stage: 'dev',
                })
            );
        });

        it('should include secrets in SSM discovery by default', async () => {
            const appDefinition = {
                ssm: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            expect(mockSsmDiscovery.discover).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeSecrets: true,
                })
            );
        });
    });

    describe('Isolated Mode Discovery', () => {
        beforeEach(() => {
            // Mock CloudFormation discovery
            jest.mock('./cloudformation-discovery');
            const { CloudFormationDiscovery } = require('./cloudformation-discovery');
            CloudFormationDiscovery.mockImplementation(() => ({
                discoverFromStack: jest.fn().mockResolvedValue({}), // No stack found
            }));
        });

        it('should return empty results for isolated mode (prevents cross-stage contamination)', async () => {
            const appDefinition = {
                name: 'test-app',
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                vpc: { enable: true },
                database: { postgres: { enable: true } },
            };

            process.env.SLS_STAGE = 'dev';

            const result = await gatherDiscoveredResources(appDefinition);

            // Should return empty (no discovery)
            expect(result).toEqual({});

            // Should NOT call AWS API discovery
            expect(mockVpcDiscovery.discover).not.toHaveBeenCalled();
            expect(mockAuroraDiscovery.discover).not.toHaveBeenCalled();
        });

        it('should return empty in isolated mode even if stack exists (fresh creation)', async () => {
            const { CloudFormationDiscovery } = require('./cloudformation-discovery');

            // Mock that CF stack exists but we still want fresh resources
            CloudFormationDiscovery.mockImplementation(() => ({
                discoverFromStack: jest.fn().mockResolvedValue({}), // Stack exists but empty
            }));

            const appDefinition = {
                name: 'test-app',
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                vpc: { enable: true },
            };

            process.env.SLS_STAGE = 'dev';

            const result = await gatherDiscoveredResources(appDefinition);

            // In isolated mode, always return empty to force fresh creation
            // This prevents any cross-stage resource reuse
            expect(result).toEqual({});

            // Should NOT call AWS API discovery
            expect(mockVpcDiscovery.discover).not.toHaveBeenCalled();
        });

        it('should use AWS API discovery in shared mode', async () => {
            const appDefinition = {
                name: 'test-app',
                managementMode: 'managed',
                vpcIsolation: 'shared',  // NOT isolated
                vpc: { enable: true },
            };

            await gatherDiscoveredResources(appDefinition);

            // Should call AWS API discovery (shared mode finds resources across stages)
            expect(mockVpcDiscovery.discover).toHaveBeenCalled();
        });
    });
});

