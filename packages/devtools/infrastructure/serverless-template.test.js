const { composeServerlessDefinition } = require('./serverless-template');

// Mock AWS Discovery to prevent actual AWS calls
jest.mock('./aws-discovery', () => {
    return {
        AWSDiscovery: jest.fn().mockImplementation(() => {
            return {
                discoverResources: jest.fn().mockResolvedValue({
                    defaultVpcId: 'vpc-123456',
                    defaultSecurityGroupId: 'sg-123456',
                    privateSubnetId1: 'subnet-123456',
                    privateSubnetId2: 'subnet-789012',
                    publicSubnetId: 'subnet-public',
                    defaultRouteTableId: 'rtb-123456',
                    defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
                    existingNatGatewayId: 'nat-default123' // Add default NAT Gateway for discover mode
                })
            };
        })
    };
});

describe('composeServerlessDefinition', () => {
    let mockIntegration;

    beforeEach(() => {
        mockIntegration = {
            Definition: {
                name: 'testIntegration'
            }
        };

        // Mock process.argv to avoid offline mode during tests
        process.argv = ['node', 'test'];

        // Clear AWS_REGION for tests
        delete process.env.AWS_REGION;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        // Restore env
        delete process.env.AWS_REGION;
    });

    describe('Basic Configuration', () => {
        it('should create basic serverless definition with minimal app definition', async () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.service).toBe('test-app');
            expect(result.provider.name).toBe('aws');
            expect(result.provider.runtime).toBe('nodejs20.x');
            expect(result.provider.region).toBe('us-east-1');
            expect(result.provider.stage).toBe('${opt:stage}');
            expect(result.frameworkVersion).toBe('>=3.17.0');
        });

        it('should use default service name when name not provided', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.service).toBe('create-frigg-app');
        });

        it('should use custom provider when specified', async () => {
            const appDefinition = {
                provider: 'custom-provider',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.name).toBe('custom-provider');
        });

        it('should use AWS_REGION environment variable when set', async () => {
            process.env.AWS_REGION = 'eu-west-1';

            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.region).toBe('eu-west-1');
            expect(result.custom['serverless-offline-sqs'].region).toBe('eu-west-1');
        });

        it('should default to us-east-1 when AWS_REGION is not set', async () => {
            delete process.env.AWS_REGION;

            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.region).toBe('us-east-1');
            expect(result.custom['serverless-offline-sqs'].region).toBe('us-east-1');
        });
    });

    describe('VPC Configuration', () => {
        it('should add VPC configuration when vpc.enable is true with discover mode', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover'
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeDefined();
            expect(result.provider.vpc.securityGroupIds).toEqual(['sg-123456']);
            expect(result.provider.vpc.subnetIds).toEqual(['subnet-123456', 'subnet-789012']);
        });

        it('should create new VPC infrastructure when management is create-new', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new'
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeDefined();
            expect(result.provider.vpc.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
            expect(result.provider.vpc.subnetIds).toEqual([
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' }
            ]);
            expect(result.resources.Resources.FriggVPC).toBeDefined();
            expect(result.resources.Resources.FriggLambdaSecurityGroup).toBeDefined();
        });

        it('should use provided VPC resources when management is use-existing', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-custom123',
                    subnets: {
                        ids: ['subnet-custom1', 'subnet-custom2']
                    }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeDefined();
            expect(result.provider.vpc.subnetIds).toEqual(['subnet-custom1', 'subnet-custom2']);
        });

        it('should throw error when use-existing mode without vpcId', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing'
                },
                integrations: []
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                'VPC management is set to "use-existing" but no vpcId was provided'
            );
        });

        it('should default to discover mode when management not specified', async () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeDefined();
            expect(result.provider.vpc.securityGroupIds).toEqual(['sg-123456']);
            expect(result.provider.vpc.subnetIds).toEqual(['subnet-123456', 'subnet-789012']);
        });

        it('should add VPC endpoint for S3 when VPC is enabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover'
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.VPCEndpointS3).toBeDefined();
            expect(result.resources.Resources.VPCEndpointS3.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(result.resources.Resources.VPCEndpointS3.Properties.VpcId).toBe('vpc-123456');
        });

        it('should not add VPC configuration when vpc.enable is false', async () => {
            const appDefinition = {
                vpc: { enable: false },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
            expect(result.resources.Resources.VPCEndpointS3).toBeUndefined();
        });

        it('should not add VPC configuration when vpc is not defined', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
        });
    });

    describe('KMS Configuration', () => {
        it('should add KMS configuration when encryption is enabled and key is found', async () => {
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check IAM permissions
            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toEqual({
                Effect: 'Allow',
                Action: [
                    'kms:GenerateDataKey',
                    'kms:Decrypt'
                ],
                Resource: ['arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012']
            });

            // Check environment variable
            expect(result.provider.environment.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012');

            // Check plugin
            expect(result.plugins).toContain('serverless-kms-grants');

            // Check custom configuration
            expect(result.custom.kmsGrants).toEqual({
                kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
            });
        });

        it('should create new KMS key when encryption is enabled, no key found, and createResourceIfNoneFound is true', async () => {
            // Mock AWS discovery to return no KMS key
            const { AWSDiscovery } = require('./aws-discovery');
            const mockDiscoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-123456',
                privateSubnetId2: 'subnet-789012',
                publicSubnetId: 'subnet-public',
                defaultRouteTableId: 'rtb-123456',
                defaultKmsKeyId: null // No KMS key found
            });
            AWSDiscovery.mockImplementation(() => ({
                discoverResources: mockDiscoverResources
            }));

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check that KMS key resource was created
            expect(result.resources.Resources.FriggKMSKey).toEqual({
                Type: 'AWS::KMS::Key',
                Properties: {
                    EnableKeyRotation: true,
                    Description: 'Frigg KMS key for field-level encryption',
                    KeyPolicy: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Sid: 'AllowRootAccountAdmin',
                                Effect: 'Allow',
                                Principal: {
                                    AWS: {
                                        'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root'
                                    }
                                },
                                Action: 'kms:*',
                                Resource: '*'
                            },
                            {
                                Sid: 'AllowLambdaService',
                                Effect: 'Allow',
                                Principal: {
                                    Service: 'lambda.amazonaws.com'
                                },
                                Action: [
                                    'kms:GenerateDataKey',
                                    'kms:Decrypt',
                                    'kms:DescribeKey'
                                ],
                                Resource: '*',
                                Condition: {
                                    StringEquals: {
                                        'kms:ViaService': 'lambda.us-east-1.amazonaws.com'
                                    }
                                }
                            }
                        ]
                    },
                    Tags: [
                        {
                            Key: 'Name',
                            Value: '${self:service}-${self:provider.stage}-frigg-kms-key'
                        },
                        {
                            Key: 'Purpose',
                            Value: 'Field-level encryption for Frigg application'
                        }
                    ]
                }
            });

            // Check IAM permissions for the new key
            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toEqual({
                Effect: 'Allow',
                Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
                Resource: [{ 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] }]
            });

            // Check environment variable
            expect(result.provider.environment.KMS_KEY_ARN).toEqual({
                'Fn::GetAtt': ['FriggKMSKey', 'Arn']
            });

            // Check plugin
            expect(result.plugins).toContain('serverless-kms-grants');

            // Check custom configuration
            // When creating a new key, it should reference the CloudFormation resource
            expect(result.custom.kmsGrants).toEqual({
                kmsKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] }
            });
        });

        it('should throw error when encryption is enabled, no key found, and createResourceIfNoneFound is false', async () => {
            // Mock AWS discovery to return no KMS key
            const { AWSDiscovery } = require('./aws-discovery');
            const mockDiscoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-123456',
                privateSubnetId2: 'subnet-789012',
                publicSubnetId: 'subnet-public',
                defaultRouteTableId: 'rtb-123456',
                defaultKmsKeyId: null // No KMS key found
            });
            AWSDiscovery.mockImplementation(() => ({
                discoverResources: mockDiscoverResources
            }));

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: false
                },
                integrations: []
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                'KMS field-level encryption is enabled but no KMS key was found. ' +
                'Either provide an existing KMS key or set encryption.createResourceIfNoneFound to true to create a new key.'
            );
        });

        it('should throw error when encryption is enabled, no key found, and createResourceIfNoneFound is not specified', async () => {
            // Mock AWS discovery to return no KMS key
            const { AWSDiscovery } = require('./aws-discovery');
            const mockDiscoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-123456',
                privateSubnetId2: 'subnet-789012',
                publicSubnetId: 'subnet-public',
                defaultRouteTableId: 'rtb-123456',
                defaultKmsKeyId: null // No KMS key found
            });
            AWSDiscovery.mockImplementation(() => ({
                discoverResources: mockDiscoverResources
            }));

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms'
                    // createResourceIfNoneFound not specified, defaults to false
                },
                integrations: []
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                'KMS field-level encryption is enabled but no KMS key was found. ' +
                'Either provide an existing KMS key or set encryption.createResourceIfNoneFound to true to create a new key.'
            );
        });

        it('should not add KMS configuration when encryption is disabled', async () => {
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'aes' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toBeUndefined();
            expect(result.provider.environment.KMS_KEY_ARN).toBeUndefined();
            expect(result.plugins).not.toContain('serverless-kms-grants');
            expect(result.custom.kmsGrants).toBeUndefined();
        });

        it('should not add KMS configuration when encryption is not defined', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toBeUndefined();
            expect(result.custom.kmsGrants).toBeUndefined();
        });
    });

    describe('SSM Configuration', () => {
        it('should add SSM configuration when ssm.enable is true', async () => {
            const appDefinition = {
                ssm: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check lambda layers
            expect(result.provider.layers).toEqual([
                'arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
            ]);

            // Check IAM permissions
            const ssmPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toEqual({
                Effect: 'Allow',
                Action: [
                    'ssm:GetParameter',
                    'ssm:GetParameters',
                    'ssm:GetParametersByPath'
                ],
                Resource: [
                    'arn:aws:ssm:${self:provider.region}:*:parameter/${self:service}/${self:provider.stage}/*'
                ]
            });

            // Check environment variable
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBe('/${self:service}/${self:provider.stage}');
        });

        it('should not add SSM configuration when ssm.enable is false', async () => {
            const appDefinition = {
                ssm: { enable: false },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.layers).toBeUndefined();

            const ssmPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });

        it('should not add SSM configuration when ssm is not defined', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.layers).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });
    });

    describe('Integration Configuration', () => {
        it('should add integration-specific resources and functions', async () => {
            const appDefinition = {
                integrations: [mockIntegration]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check integration function
            expect(result.functions.testIntegration).toEqual({
                handler: 'node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.testIntegration.handler',
                events: [{
                    httpApi: {
                        path: '/api/testIntegration-integration/{proxy+}',
                        method: 'ANY'
                    }
                }]
            });

            // Check SQS Queue
            expect(result.resources.Resources.TestIntegrationQueue).toEqual({
                Type: 'AWS::SQS::Queue',
                Properties: {
                    QueueName: '${self:custom.TestIntegrationQueue}',
                    MessageRetentionPeriod: 60,
                    VisibilityTimeout: 1800,
                    RedrivePolicy: {
                        maxReceiveCount: 1,
                        deadLetterTargetArn: {
                            'Fn::GetAtt': ['InternalErrorQueue', 'Arn']
                        }
                    }
                }
            });

            // Check Queue Worker
            expect(result.functions.testIntegrationQueueWorker).toEqual({
                handler: 'node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.testIntegration.queueWorker',
                reservedConcurrency: 5,
                events: [{
                    sqs: {
                        arn: {
                            'Fn::GetAtt': ['TestIntegrationQueue', 'Arn']
                        },
                        batchSize: 1
                    }
                }],
                timeout: 600
            });

            // Check environment variable
            expect(result.provider.environment.TESTINTEGRATION_QUEUE_URL).toEqual({
                Ref: 'TestIntegrationQueue'
            });

            // Check custom queue name
            expect(result.custom.TestIntegrationQueue).toBe('${self:service}--${self:provider.stage}-TestIntegrationQueue');
        });

        it('should handle multiple integrations', async () => {
            const secondIntegration = {
                Definition: {
                    name: 'secondIntegration'
                }
            };

            const appDefinition = {
                integrations: [mockIntegration, secondIntegration]
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions.testIntegration).toBeDefined();
            expect(result.functions.secondIntegration).toBeDefined();
            expect(result.functions.testIntegrationQueueWorker).toBeDefined();
            expect(result.functions.secondIntegrationQueueWorker).toBeDefined();
            expect(result.resources.Resources.TestIntegrationQueue).toBeDefined();
            expect(result.resources.Resources.SecondIntegrationQueue).toBeDefined();
        });
    });

    describe('NAT Gateway Management', () => {
        it('should handle NAT Gateway with createAndManage mode', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'createAndManage'
                    }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggLambdaRouteTable).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
        });

        it('should handle NAT Gateway with discover mode', async () => {
            // Mock discovery to return existing NAT Gateway
            const { AWSDiscovery } = require('./aws-discovery');
            const mockDiscoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-123456',
                privateSubnetId2: 'subnet-789012',
                publicSubnetId: 'subnet-public',
                defaultRouteTableId: 'rtb-123456',
                defaultKmsKeyId: null,
                existingNatGatewayId: 'nat-existing123'
            });
            AWSDiscovery.mockImplementation(() => ({
                discoverResources: mockDiscoverResources
            }));

            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover'
                    }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId).toBe('nat-existing123');
        });

        it('should handle NAT Gateway with useExisting mode and provided ID', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'useExisting',
                        id: 'nat-custom456'
                    }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId).toBe('nat-custom456');
        });

        it('should throw error when NAT Gateway not found in discover mode', async () => {
            // Mock discovery to return no NAT Gateway
            const { AWSDiscovery } = require('./aws-discovery');
            const mockDiscoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-123456',
                privateSubnetId2: 'subnet-789012',
                publicSubnetId: 'subnet-public',
                defaultRouteTableId: 'rtb-123456',
                defaultKmsKeyId: null,
                existingNatGatewayId: null // No NAT Gateway
            });
            AWSDiscovery.mockImplementation(() => ({
                discoverResources: mockDiscoverResources
            }));

            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover'
                    }
                },
                integrations: []
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                'No existing NAT Gateway found in discovery mode'
            );
        });

        it('should enable self-healing when selfHeal is true', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: {
                        management: 'discover'
                    },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // With self-healing enabled, it should handle misconfigured NAT Gateways
            expect(result.resources.Resources.FriggLambdaRouteTable).toBeDefined();
        });
    });

    describe('Combined Configurations', () => {
        it('should combine VPC, KMS, and SSM configurations', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' }  // Explicitly set NAT management mode
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true  // Allow creating KMS key if not found
                },
                ssm: { enable: true },
                integrations: [mockIntegration]
            };

            const result = await composeServerlessDefinition(appDefinition);

            // VPC
            expect(result.provider.vpc).toBeDefined();
            // custom.vpc doesn't exist in the serverless template
            expect(result.resources.Resources.VPCEndpointS3).toBeDefined();

            // KMS
            expect(result.plugins).toContain('serverless-kms-grants');
            expect(result.provider.environment.KMS_KEY_ARN).toBeDefined();
            expect(result.custom.kmsGrants).toBeDefined();

            // SSM
            expect(result.provider.layers).toBeDefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeDefined();

            // Integration
            expect(result.functions.testIntegration).toBeDefined();
            expect(result.resources.Resources.TestIntegrationQueue).toBeDefined();

            // All plugins should be present
            expect(result.plugins).toEqual([
                'serverless-jetpack',
                'serverless-dotenv-plugin',
                'serverless-offline-sqs',
                'serverless-offline',
                '@friggframework/serverless-plugin',
                'serverless-kms-grants'
            ]);
        });

        it('should handle partial configuration combinations', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' }  // Explicitly set NAT management mode
                },
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true  // Allow creating KMS key if not found
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // VPC and KMS should be present
            expect(result.provider.vpc).toBeDefined();
            expect(result.custom.kmsGrants).toBeDefined();

            // SSM should not be present
            expect(result.provider.layers).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });
    });

    describe('Default Resources', () => {
        it('should always include default resources', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check default resources are always present
            expect(result.resources.Resources.InternalErrorQueue).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgeTopic).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgePolicy).toBeDefined();
            expect(result.resources.Resources.ApiGatewayAlarm5xx).toBeDefined();

            // Check default functions
            expect(result.functions.auth).toBeDefined();
            expect(result.functions.user).toBeDefined();
            expect(result.functions.health).toBeDefined();

            // Check default plugins
            expect(result.plugins).toContain('serverless-jetpack');
            expect(result.plugins).toContain('serverless-dotenv-plugin');
            expect(result.plugins).toContain('@friggframework/serverless-plugin');
        });

        it('should always include default IAM permissions', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Check SNS publish permission
            const snsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('sns:Publish')
            );
            expect(snsPermission).toBeDefined();

            // Check SQS permissions
            const sqsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('sqs:SendMessage')
            );
            expect(sqsPermission).toBeDefined();
        });

        it('should include default environment variables', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.STAGE).toBe('${opt:stage, "dev"}');
            expect(result.provider.environment.AWS_NODEJS_CONNECTION_REUSE_ENABLED).toBe(1);
        });
    });

    describe('WebSocket Configuration', () => {
        it('should add websocket function when websockets.enable is true', async () => {
            const appDefinition = {
                websockets: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions.defaultWebsocket).toEqual({
                handler: 'node_modules/@friggframework/core/handlers/routers/websocket.handler',
                events: [
                    {
                        websocket: {
                            route: '$connect',
                        },
                    },
                    {
                        websocket: {
                            route: '$default',
                        },
                    },
                    {
                        websocket: {
                            route: '$disconnect',
                        },
                    },
                ],
            });
        });

        it('should not add websocket function when websockets.enable is false', async () => {
            const appDefinition = {
                websockets: { enable: false },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions.defaultWebsocket).toBeUndefined();
        });

        it('should not add websocket function when websockets is not defined', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.functions.defaultWebsocket).toBeUndefined();
        });
    });

    describe('CRITICAL: NAT Gateway MUST be in PUBLIC Subnet', () => {
        it('should NEVER reuse NAT Gateway in private subnet - throw error when selfHeal disabled', async () => {
            // Mock NAT Gateway found in PRIVATE subnet (the original bug)
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-in-private',
                natGatewayInPrivateSubnet: true, // CRITICAL: NAT is in WRONG subnet
                existingElasticIpAllocationId: 'eipalloc-123'
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' },
                    selfHeal: false
                },
                integrations: []
            };

            // Should throw error because NAT is in private subnet
            await expect(composeServerlessDefinition(appDefinition))
                .rejects
                .toThrow('CRITICAL: NAT Gateway is in PRIVATE subnet');
        });

        it('should create NEW NAT in PUBLIC subnet when existing NAT is in private subnet with selfHeal', async () => {
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-in-private',
                natGatewayInPrivateSubnet: true, // NAT is in WRONG subnet
                existingElasticIpAllocationId: 'eipalloc-123'
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // MUST create new NAT Gateway (not reuse the one in private subnet)
            expect(result.resources.Resources.FriggNATGateway).toBeDefined();

            // MUST be placed in PUBLIC subnet
            const natSubnet = result.resources.Resources.FriggNATGateway.Properties.SubnetId;
            expect(natSubnet).toEqual('subnet-public');

            // MUST create new EIP (cannot reuse the one associated with wrong NAT)
            expect(result.resources.Resources.FriggNATGatewayEIP).toBeDefined();
        });

        it('should create public subnet for NAT when none exists', async () => {
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: null, // NO PUBLIC SUBNET EXISTS
                existingNatGatewayId: null
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // MUST create public subnet
            expect(result.resources.Resources.FriggPublicSubnet).toBeDefined();
            expect(result.resources.Resources.FriggPublicSubnet.Properties.MapPublicIpOnLaunch).toBe(true);

            // NAT Gateway MUST be in the newly created public subnet
            expect(result.resources.Resources.FriggNATGateway.Properties.SubnetId)
                .toEqual({ Ref: 'FriggPublicSubnet' });
        });

        it('should reuse CORRECTLY placed NAT Gateway in public subnet', async () => {
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-good',
                natGatewayInPrivateSubnet: false, // NAT is CORRECTLY in public subnet
                existingElasticIpAllocationId: 'eipalloc-123'
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should NOT create new NAT Gateway (reuse the good one)
            expect(result.resources.Resources.FriggNATGateway).toBeUndefined();
            expect(result.resources.Resources.FriggNATGatewayEIP).toBeUndefined();

            // Should use existing NAT in routes
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId)
                .toEqual('nat-good');
        });

        it('should fix route table associations to prevent NAT misconfiguration', async () => {
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-good',
                natGatewayInPrivateSubnet: false
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'discover' },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should create route table to fix associations
            expect(result.resources.Resources.FriggLambdaRouteTable).toBeDefined();

            // Should create NAT route pointing to good NAT
            expect(result.resources.Resources.FriggNATRoute).toBeDefined();
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId)
                .toEqual('nat-good');

            // Should associate private subnets with correct route table
            expect(result.resources.Resources.FriggSubnet1RouteAssociation).toBeDefined();
            expect(result.resources.Resources.FriggSubnet2RouteAssociation).toBeDefined();
        });

        it('should handle EIP already associated error by reusing existing NAT', async () => {
            const mockDiscovery = require('./aws-discovery').AWSDiscovery;
            const mockInstance = new mockDiscovery();
            mockInstance.discoverResources = jest.fn().mockResolvedValue({
                defaultVpcId: 'vpc-123456',
                defaultSecurityGroupId: 'sg-123456',
                privateSubnetId1: 'subnet-private1',
                privateSubnetId2: 'subnet-private2',
                publicSubnetId: 'subnet-public',
                existingNatGatewayId: 'nat-existing',
                natGatewayInPrivateSubnet: false, // NAT is correctly placed
                existingElasticIpAllocationId: 'eipalloc-inuse',
                elasticIpAlreadyAssociated: true // EIP is already in use
            });
            mockDiscovery.mockImplementation(() => mockInstance);

            const appDefinition = {
                vpc: {
                    enable: true,
                    natGateway: { management: 'createAndManage' },
                    selfHeal: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Should NOT create new NAT or EIP (reuse existing)
            expect(result.resources.Resources.FriggNATGateway).toBeUndefined();
            expect(result.resources.Resources.FriggNATGatewayEIP).toBeUndefined();

            // Should use existing NAT
            expect(result.resources.Resources.FriggNATRoute.Properties.NatGatewayId)
                .toEqual('nat-existing');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty app definition', async () => {
            const appDefinition = {};

            await expect(composeServerlessDefinition(appDefinition)).resolves.not.toThrow();
            const result = await composeServerlessDefinition(appDefinition);
            expect(result.service).toBe('create-frigg-app');
        });

        it('should handle null/undefined integrations', async () => {
            const appDefinition = {
                integrations: null
            };

            // Should not throw, just ignore invalid integrations
            const result = await composeServerlessDefinition(appDefinition);
            expect(result).toBeDefined();
        });

        it('should handle integration with missing Definition', async () => {
            const invalidIntegration = {};
            const appDefinition = {
                integrations: [invalidIntegration]
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow('Invalid integration: missing Definition or name');
        });

        it('should handle integration with missing name', async () => {
            const invalidIntegration = {
                Definition: {}
            };
            const appDefinition = {
                integrations: [invalidIntegration]
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow('Invalid integration: missing Definition or name');
        });
    });
});