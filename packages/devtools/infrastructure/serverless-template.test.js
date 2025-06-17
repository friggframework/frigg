const { composeServerlessDefinition } = require('./serverless-template');

// Mock the node_modules path finding functions
jest.mock('./serverless-template', () => {
    const originalModule = jest.requireActual('./serverless-template');
    return {
        ...originalModule,
        composeServerlessDefinition: originalModule.composeServerlessDefinition
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
        jest.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'test']);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Basic Configuration', () => {
        it('should create basic serverless definition with minimal app definition', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.service).toBe('test-app');
            expect(result.provider.name).toBe('aws');
            expect(result.provider.runtime).toBe('nodejs20.x');
            expect(result.provider.region).toBe('us-east-1');
            expect(result.provider.stage).toBe('${opt:stage}');
            expect(result.frameworkVersion).toBe('>=3.17.0');
        });

        it('should use default service name when name not provided', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.service).toBe('create-frigg-app');
        });

        it('should use custom provider when specified', () => {
            const appDefinition = {
                provider: 'custom-provider',
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.name).toBe('custom-provider');
        });
    });

    describe('VPC Configuration', () => {
        it('should add VPC configuration when vpc.enable is true', () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBe('${self:custom.vpc.${self:provider.stage}}');
            expect(result.custom.vpc).toEqual({
                '${self:provider.stage}': {
                    securityGroupIds: ['${env:AWS_DISCOVERY_SECURITY_GROUP_ID}'],
                    subnetIds: [
                        '${env:AWS_DISCOVERY_SUBNET_ID_1}',
                        '${env:AWS_DISCOVERY_SUBNET_ID_2}'
                    ]
                }
            });
        });

        it('should add VPC endpoint for S3 when VPC is enabled', () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.VPCEndpointS3).toEqual({
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: '${env:AWS_DISCOVERY_VPC_ID}',
                    ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: ['${env:AWS_DISCOVERY_ROUTE_TABLE_ID}']
                }
            });
        });

        it('should not add VPC configuration when vpc.enable is false', () => {
            const appDefinition = {
                vpc: { enable: false },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
            expect(result.custom.vpc).toBeUndefined();
            expect(result.resources.Resources.VPCEndpointS3).toBeUndefined();
        });

        it('should not add VPC configuration when vpc is not defined', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
            expect(result.custom.vpc).toBeUndefined();
        });
    });

    describe('KMS Configuration', () => {
        it('should add KMS configuration when encryption is enabled', () => {
            const appDefinition = {
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

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
                Resource: ['${self:custom.kmsGrants.kmsKeyId}']
            });

            // Check environment variable
            expect(result.provider.environment.KMS_KEY_ARN).toBe('${self:custom.kmsGrants.kmsKeyId}');

            // Check plugin
            expect(result.plugins).toContain('serverless-kms-grants');

            // Check custom configuration
            expect(result.custom.kmsGrants).toEqual({
                kmsKeyId: '${env:AWS_DISCOVERY_KMS_KEY_ID}'
            });
        });

        it('should not add KMS configuration when encryption is disabled', () => {
            const appDefinition = {
                encryption: { useDefaultKMSForFieldLevelEncryption: false },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toBeUndefined();
            expect(result.provider.environment.KMS_KEY_ARN).toBeUndefined();
            expect(result.plugins).not.toContain('serverless-kms-grants');
            expect(result.custom.kmsGrants).toBeUndefined();
        });

        it('should not add KMS configuration when encryption is not defined', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toBeUndefined();
            expect(result.custom.kmsGrants).toBeUndefined();
        });
    });

    describe('SSM Configuration', () => {
        it('should add SSM configuration when ssm.enable is true', () => {
            const appDefinition = {
                ssm: { enable: true },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

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

        it('should not add SSM configuration when ssm.enable is false', () => {
            const appDefinition = {
                ssm: { enable: false },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.layers).toBeUndefined();
            
            const ssmPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });

        it('should not add SSM configuration when ssm is not defined', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.layers).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });
    });

    describe('Integration Configuration', () => {
        it('should add integration-specific resources and functions', () => {
            const appDefinition = {
                integrations: [mockIntegration]
            };

            const result = composeServerlessDefinition(appDefinition);

            // Check integration function
            expect(result.functions.testIntegration).toEqual({
                handler: 'node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.testIntegration.handler',
                events: [{
                    http: {
                        path: '/api/testIntegration-integration/{proxy+}',
                        method: 'ANY',
                        cors: true
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

        it('should handle multiple integrations', () => {
            const secondIntegration = {
                Definition: {
                    name: 'secondIntegration'
                }
            };

            const appDefinition = {
                integrations: [mockIntegration, secondIntegration]
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.functions.testIntegration).toBeDefined();
            expect(result.functions.secondIntegration).toBeDefined();
            expect(result.functions.testIntegrationQueueWorker).toBeDefined();
            expect(result.functions.secondIntegrationQueueWorker).toBeDefined();
            expect(result.resources.Resources.TestIntegrationQueue).toBeDefined();
            expect(result.resources.Resources.SecondIntegrationQueue).toBeDefined();
        });
    });

    describe('Combined Configurations', () => {
        it('should combine VPC, KMS, and SSM configurations', () => {
            const appDefinition = {
                vpc: { enable: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                ssm: { enable: true },
                integrations: [mockIntegration]
            };

            const result = composeServerlessDefinition(appDefinition);

            // VPC
            expect(result.provider.vpc).toBeDefined();
            expect(result.custom.vpc).toBeDefined();
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

        it('should handle partial configuration combinations', () => {
            const appDefinition = {
                vpc: { enable: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            // VPC and KMS should be present
            expect(result.provider.vpc).toBeDefined();
            expect(result.custom.kmsGrants).toBeDefined();

            // SSM should not be present
            expect(result.provider.layers).toBeUndefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
        });
    });

    describe('Default Resources', () => {
        it('should always include default resources', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            // Check default resources are always present
            expect(result.resources.Resources.InternalErrorQueue).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgeTopic).toBeDefined();
            expect(result.resources.Resources.InternalErrorBridgePolicy).toBeDefined();
            expect(result.resources.Resources.ApiGatewayAlarm5xx).toBeDefined();

            // Check default functions
            expect(result.functions.defaultWebsocket).toBeDefined();
            expect(result.functions.auth).toBeDefined();
            expect(result.functions.user).toBeDefined();

            // Check default plugins
            expect(result.plugins).toContain('serverless-jetpack');
            expect(result.plugins).toContain('serverless-dotenv-plugin');
            expect(result.plugins).toContain('@friggframework/serverless-plugin');
        });

        it('should always include default IAM permissions', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

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

        it('should include default environment variables', () => {
            const appDefinition = {
                integrations: []
            };

            const result = composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.STAGE).toBe('${opt:stage}');
            expect(result.provider.environment.AWS_NODEJS_CONNECTION_REUSE_ENABLED).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty app definition', () => {
            const appDefinition = {};

            expect(() => composeServerlessDefinition(appDefinition)).not.toThrow();
            const result = composeServerlessDefinition(appDefinition);
            expect(result.service).toBe('create-frigg-app');
        });

        it('should handle null/undefined integrations', () => {
            const appDefinition = {
                integrations: null
            };

            expect(() => composeServerlessDefinition(appDefinition)).toThrow();
        });

        it('should handle integration with missing Definition', () => {
            const invalidIntegration = {};
            const appDefinition = {
                integrations: [invalidIntegration]
            };

            expect(() => composeServerlessDefinition(appDefinition)).toThrow();
        });

        it('should handle integration with missing name', () => {
            const invalidIntegration = {
                Definition: {}
            };
            const appDefinition = {
                integrations: [invalidIntegration]
            };

            expect(() => composeServerlessDefinition(appDefinition)).toThrow();
        });
    });
});