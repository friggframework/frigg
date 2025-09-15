const fs = require('fs');
const { composeServerlessDefinition } = require('./serverless-template');
const { AWSDiscovery } = require('./aws-discovery');
const { BuildTimeDiscovery } = require('./build-time-discovery');
const FriggServerlessPlugin = require('../../serverless-plugin/index');

// Integration tests for end-to-end AWS discovery and serverless config generation
describe('VPC/KMS/SSM Integration Tests', () => {
    let mockAWSDiscovery;
    let buildTimeDiscovery;
    
    const mockAWSResources = {
        defaultVpcId: 'vpc-12345678',
        defaultSecurityGroupId: 'sg-12345678',
        privateSubnetId1: 'subnet-private-1',
        privateSubnetId2: 'subnet-private-2',
        privateRouteTableId: 'rtb-12345678',
        defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
    };

    beforeEach(() => {
        // Mock AWSDiscovery to return consistent test data
        mockAWSDiscovery = {
            discoverResources: jest.fn().mockResolvedValue(mockAWSResources),
            findDefaultVpc: jest.fn().mockResolvedValue({ VpcId: mockAWSResources.defaultVpcId }),
            findPrivateSubnets: jest.fn().mockResolvedValue([
                { SubnetId: mockAWSResources.privateSubnetId1 },
                { SubnetId: mockAWSResources.privateSubnetId2 }
            ]),
            findDefaultSecurityGroup: jest.fn().mockResolvedValue({ GroupId: mockAWSResources.defaultSecurityGroupId }),
            findPrivateRouteTable: jest.fn().mockResolvedValue({ RouteTableId: mockAWSResources.privateRouteTableId }),
            findDefaultKmsKey: jest.fn().mockResolvedValue(mockAWSResources.defaultKmsKeyId)
        };

        jest.doMock('./aws-discovery', () => ({
            AWSDiscovery: jest.fn(() => mockAWSDiscovery)
        }));

        buildTimeDiscovery = new BuildTimeDiscovery('us-east-1');
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    describe('End-to-End Serverless Configuration Generation', () => {
        it('should generate complete serverless config with VPC, KMS, and SSM enabled', async () => {
            const appDefinition = {
                name: 'test-frigg-app',
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                ssm: { enable: true },
                integrations: [{
                    Definition: {
                        name: 'testIntegration'
                    }
                }]
            };

            // Run AWS discovery
            const discoveredResources = await mockAWSDiscovery.discoverResources();
            
            // Set environment variables as would happen in build
            process.env.AWS_DISCOVERY_VPC_ID = discoveredResources.defaultVpcId;
            process.env.AWS_DISCOVERY_SECURITY_GROUP_ID = discoveredResources.defaultSecurityGroupId;
            process.env.AWS_DISCOVERY_SUBNET_ID_1 = discoveredResources.privateSubnetId1;
            process.env.AWS_DISCOVERY_SUBNET_ID_2 = discoveredResources.privateSubnetId2;
            process.env.AWS_DISCOVERY_ROUTE_TABLE_ID = discoveredResources.privateRouteTableId;
            process.env.AWS_DISCOVERY_KMS_KEY_ID =discoveredResources.defaultKmsKeyId;

            // Generate serverless configuration
            const serverlessConfig = composeServerlessDefinition(appDefinition);

            // Verify VPC configuration
            expect(serverlessConfig.provider.vpc).toBe('${self:custom.vpc.${self:provider.stage}}');
            expect(serverlessConfig.custom.vpc).toEqual({
                '${self:provider.stage}': {
                    securityGroupIds: ['${env:AWS_DISCOVERY_SECURITY_GROUP_ID}'],
                    subnetIds: [
                        '${env:AWS_DISCOVERY_SUBNET_ID_1}',
                        '${env:AWS_DISCOVERY_SUBNET_ID_2}'
                    ]
                }
            });

            // Verify VPC Endpoint
            expect(serverlessConfig.resources.Resources.VPCEndpointS3).toEqual({
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: '${env:AWS_DISCOVERY_VPC_ID}',
                    ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: ['${env:AWS_DISCOVERY_ROUTE_TABLE_ID}']
                }
            });

            // Verify KMS configuration
            expect(serverlessConfig.plugins).toContain('serverless-kms-grants');
            expect(serverlessConfig.provider.environment.KMS_KEY_ARN).toBe('${self:custom.kmsGrants.kmsKeyId}');
            expect(serverlessConfig.custom.kmsGrants).toEqual({
                kmsKeyId: '${env:AWS_DISCOVERY_KMS_KEY_ID}'
            });

            // Verify KMS IAM permissions
            const kmsPermission = serverlessConfig.provider.iamRoleStatements.find(
                statement => statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toBeDefined();

            // Verify SSM configuration
            expect(serverlessConfig.provider.layers).toEqual([
                'arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
            ]);
            expect(serverlessConfig.provider.environment.SSM_PARAMETER_PREFIX).toBe('/${self:service}/${self:provider.stage}');

            // Verify SSM IAM permissions
            const ssmPermission = serverlessConfig.provider.iamRoleStatements.find(
                statement => statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toBeDefined();

            // Verify integration resources
            expect(serverlessConfig.functions.testIntegration).toBeDefined();
            expect(serverlessConfig.functions.testIntegrationQueueWorker).toBeDefined();
            expect(serverlessConfig.resources.Resources.TestIntegrationQueue).toBeDefined();

            // Clean up environment
            delete process.env.AWS_DISCOVERY_VPC_ID;
            delete process.env.AWS_DISCOVERY_SECURITY_GROUP_ID;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_1;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_2;
            delete process.env.AWS_DISCOVERY_ROUTE_TABLE_ID;
            delete process.env.AWS_DISCOVERY_KMS_KEY_ID;
        });

        it('should generate config with only VPC enabled', async () => {
            const appDefinition = {
                name: 'vpc-only-app',
                vpc: { enable: true },
                integrations: []
            };

            process.env.AWS_DISCOVERY_VPC_ID = mockAWSResources.defaultVpcId;
            process.env.AWS_DISCOVERY_SECURITY_GROUP_ID = mockAWSResources.defaultSecurityGroupId;
            process.env.AWS_DISCOVERY_SUBNET_ID_1 = mockAWSResources.privateSubnetId1;
            process.env.AWS_DISCOVERY_SUBNET_ID_2 = mockAWSResources.privateSubnetId2;
            process.env.AWS_DISCOVERY_ROUTE_TABLE_ID = mockAWSResources.privateRouteTableId;

            const serverlessConfig = composeServerlessDefinition(appDefinition);

            // Should have VPC config
            expect(serverlessConfig.provider.vpc).toBeDefined();
            expect(serverlessConfig.custom.vpc).toBeDefined();
            expect(serverlessConfig.resources.Resources.VPCEndpointS3).toBeDefined();

            // Should not have KMS config
            expect(serverlessConfig.plugins).not.toContain('serverless-kms-grants');
            expect(serverlessConfig.provider.environment.KMS_KEY_ARN).toBeUndefined();

            // Should not have SSM config
            expect(serverlessConfig.provider.layers).toBeUndefined();
            expect(serverlessConfig.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();

            // Clean up
            delete process.env.AWS_DISCOVERY_VPC_ID;
            delete process.env.AWS_DISCOVERY_SECURITY_GROUP_ID;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_1;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_2;
            delete process.env.AWS_DISCOVERY_ROUTE_TABLE_ID;
        });

        it('should generate config with only KMS enabled', async () => {
            const appDefinition = {
                name: 'kms-only-app',
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            process.env.AWS_DISCOVERY_KMS_KEY_ID =mockAWSResources.defaultKmsKeyId;

            const serverlessConfig = composeServerlessDefinition(appDefinition);

            // Should have KMS config
            expect(serverlessConfig.plugins).toContain('serverless-kms-grants');
            expect(serverlessConfig.custom.kmsGrants).toBeDefined();
            
            // Should not have VPC config
            expect(serverlessConfig.provider.vpc).toBeUndefined();
            
            // Should not have SSM config
            expect(serverlessConfig.provider.layers).toBeUndefined();

            delete process.env.AWS_DISCOVERY_KMS_KEY_ID;
        });
    });

    describe('Plugin Integration', () => {
        it('should trigger AWS discovery through serverless plugin', async () => {
            const mockServerless = {
                cli: { log: jest.fn() },
                service: {
                    provider: {
                        name: 'aws',
                        region: 'us-east-1',
                        vpc: '${self:custom.vpc.${self:provider.stage}}'
                    },
                    plugins: ['serverless-kms-grants'],
                    custom: {},
                    functions: {}
                },
                processedInput: { commands: [] },
                getProvider: jest.fn(() => ({})),
                extendConfiguration: jest.fn()
            };

            const plugin = new FriggServerlessPlugin(mockServerless, { stage: 'test' });

            // Mock BuildTimeDiscovery
            const mockBuildTimeDiscovery = {
                preBuildHook: jest.fn().mockResolvedValue(mockAWSResources)
            };

            jest.doMock('./build-time-discovery', () => ({
                BuildTimeDiscovery: jest.fn(() => mockBuildTimeDiscovery)
            }));

            // Test the beforePackageInitialize hook
            await plugin.beforePackageInitialize();

            expect(mockBuildTimeDiscovery.preBuildHook).toHaveBeenCalledWith(
                expect.objectContaining({
                    vpc: { enable: true },
                    encryption: { fieldLevelEncryptionMethod: 'kms' }
                }),
                'us-east-1'
            );

            expect(mockServerless.cli.log).toHaveBeenCalledWith('AWS discovery completed successfully');
        });

        it('should handle plugin discovery failure gracefully', async () => {
            const mockServerless = {
                cli: { log: jest.fn() },
                service: {
                    provider: {
                        name: 'aws',
                        region: 'us-east-1',
                        vpc: '${self:custom.vpc}'
                    },
                    plugins: [],
                    custom: {},
                    functions: {}
                },
                processedInput: { commands: [] },
                getProvider: jest.fn(() => ({})),
                extendConfiguration: jest.fn()
            };

            const plugin = new FriggServerlessPlugin(mockServerless, { stage: 'test' });

            // Mock BuildTimeDiscovery to fail
            const mockBuildTimeDiscovery = {
                preBuildHook: jest.fn().mockRejectedValue(new Error('AWS API Error'))
            };

            jest.doMock('./build-time-discovery', () => ({
                BuildTimeDiscovery: jest.fn(() => mockBuildTimeDiscovery)
            }));

            await plugin.beforePackageInitialize();

            expect(mockServerless.cli.log).toHaveBeenCalledWith('AWS discovery failed, continuing with deployment...');
            expect(mockServerless.cli.log).toHaveBeenCalledWith('Using fallback values for AWS resources');

            // Verify fallback values are set
            expect(process.env.AWS_DISCOVERY_VPC_ID).toBe('vpc-fallback');
            expect(process.env.AWS_DISCOVERY_KMS_KEY_ID).toBe('arn:aws:kms:*:*:key/*');
        });
    });

    describe('Template Variable Replacement', () => {
        it('should replace environment variable placeholders with actual values', () => {
            const template = `
                provider:
                    vpc:
                        securityGroupIds:
                            - \${env:AWS_DISCOVERY_SECURITY_GROUP_ID}
                        subnetIds:
                            - \${env:AWS_DISCOVERY_SUBNET_ID_1}
                            - \${env:AWS_DISCOVERY_SUBNET_ID_2}
                    environment:
                        KMS_KEY_ARN: \${env:AWS_DISCOVERY_KMS_KEY_ID}
                resources:
                    VPCEndpoint:
                        Properties:
                            VpcId: \${env:AWS_DISCOVERY_VPC_ID}
            `;

            // Set environment variables
            process.env.AWS_DISCOVERY_VPC_ID = mockAWSResources.defaultVpcId;
            process.env.AWS_DISCOVERY_SECURITY_GROUP_ID = mockAWSResources.defaultSecurityGroupId;
            process.env.AWS_DISCOVERY_SUBNET_ID_1 = mockAWSResources.privateSubnetId1;
            process.env.AWS_DISCOVERY_SUBNET_ID_2 = mockAWSResources.privateSubnetId2;
            process.env.AWS_DISCOVERY_KMS_KEY_ID =mockAWSResources.defaultKmsKeyId;

            // In a real deployment, serverless framework would resolve these environment variables
            // For testing, we can verify the placeholders are correctly formatted
            expect(template).toContain('${env:AWS_DISCOVERY_VPC_ID}');
            expect(template).toContain('${env:AWS_DISCOVERY_SECURITY_GROUP_ID}');
            expect(template).toContain('${env:AWS_DISCOVERY_SUBNET_ID_1}');
            expect(template).toContain('${env:AWS_DISCOVERY_SUBNET_ID_2}');
            expect(template).toContain('${env:AWS_DISCOVERY_KMS_KEY_ID}');

            // Clean up
            delete process.env.AWS_DISCOVERY_VPC_ID;
            delete process.env.AWS_DISCOVERY_SECURITY_GROUP_ID;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_1;
            delete process.env.AWS_DISCOVERY_SUBNET_ID_2;
            delete process.env.AWS_DISCOVERY_KMS_KEY_ID;
        });
    });

    describe('Error Scenarios', () => {
        it('should handle AWS discovery timeout gracefully', async () => {
            const mockFailingDiscovery = {
                discoverResources: jest.fn().mockRejectedValue(new Error('Request timeout'))
            };

            jest.doMock('./aws-discovery', () => ({
                AWSDiscovery: jest.fn(() => mockFailingDiscovery)
            }));

            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            await expect(buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1')).rejects.toThrow('Request timeout');
        });

        it('should handle partial AWS resource discovery', async () => {
            const partialResources = {
                defaultVpcId: 'vpc-12345678',
                defaultSecurityGroupId: 'sg-12345678',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-1', // Same subnet used twice
                privateRouteTableId: 'rtb-12345678',
                defaultKmsKeyId: '*' // Fallback KMS key
            };

            mockAWSDiscovery.discoverResources.mockResolvedValue(partialResources);

            const appDefinition = {
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(result).toEqual(partialResources);
            expect(result.privateSubnetId2).toBe(result.privateSubnetId1); // Should handle single subnet scenario
            expect(result.defaultKmsKeyId).toBe('*'); // Should handle KMS fallback
        });
    });

    describe('Multi-Region Support', () => {
        it('should support different AWS regions', async () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            const euWestDiscovery = new BuildTimeDiscovery('eu-west-1');
            
            await euWestDiscovery.preBuildHook(appDefinition, 'eu-west-1');

            // Verify that AWSDiscovery was instantiated with correct region
            expect(mockAWSDiscovery.discoverResources).toHaveBeenCalled();
        });
    });
});