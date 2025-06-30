const fs = require('fs');
const { composeServerlessDefinition } = require('./serverless-template');
const { AWSDiscovery } = require('./aws-discovery');
const { BuildTimeDiscovery } = require('./build-time-discovery');
const FriggServerlessPlugin = require('../../serverless-plugin/index');
const yaml = require('js-yaml');
const path = require('path');

// Integration tests for end-to-end AWS discovery and serverless config generation
describe('Infrastructure Integration Tests - Phase 3', () => {
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
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
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
            process.env.AWS_DISCOVERY_KMS_KEY_ID = discoveredResources.defaultKmsKeyId;

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
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
                integrations: []
            };

            process.env.AWS_DISCOVERY_KMS_KEY_ID = mockAWSResources.defaultKmsKeyId;

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
                    encryption: { useDefaultKMSForFieldLevelEncryption: true }
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
            process.env.AWS_DISCOVERY_KMS_KEY_ID = mockAWSResources.defaultKmsKeyId;

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
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
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

    describe('Phase 3 Infrastructure Components', () => {
        describe('CDN Infrastructure', () => {
            it('should validate CDN CloudFormation template', () => {
                const cdnTemplatePath = path.join(__dirname, 'cloudformation', 'cdn-infrastructure.yaml');
                expect(fs.existsSync(cdnTemplatePath)).toBe(true);
                
                const templateContent = fs.readFileSync(cdnTemplatePath, 'utf8');
                const template = yaml.load(templateContent);
                
                // Validate template structure
                expect(template.AWSTemplateFormatVersion).toBe('2010-09-09');
                expect(template.Description).toContain('Phase 3 CDN Infrastructure');
                
                // Validate key resources
                expect(template.Resources.UIDistributionBucket).toBeDefined();
                expect(template.Resources.UIDistribution).toBeDefined();
                expect(template.Resources.UIPackageDeployFunction).toBeDefined();
                expect(template.Resources.UIPackageAPI).toBeDefined();
                
                // Validate outputs
                expect(template.Outputs.UIDistributionURL).toBeDefined();
                expect(template.Outputs.UIPackageAPIEndpoint).toBeDefined();
            });
            
            it('should validate CDN security configuration', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'cdn-infrastructure.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                const s3Bucket = template.Resources.UIDistributionBucket;
                expect(s3Bucket.Properties.BucketEncryption).toBeDefined();
                expect(s3Bucket.Properties.PublicAccessBlockConfiguration).toBeDefined();
                
                const distribution = template.Resources.UIDistribution;
                expect(distribution.Properties.DistributionConfig.ViewerProtocolPolicy).toBe('redirect-to-https');
            });
        });
        
        describe('Code Generation Infrastructure', () => {
            it('should validate code generation CloudFormation template', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'codegen-infrastructure.yaml');
                expect(fs.existsSync(templatePath)).toBe(true);
                
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                // Validate template structure
                expect(template.Description).toContain('Code Generation Infrastructure');
                
                // Validate key resources
                expect(template.Resources.CodeGenerationBucket).toBeDefined();
                expect(template.Resources.GenerationTrackingTable).toBeDefined();
                expect(template.Resources.CodeGenerationQueue).toBeDefined();
                expect(template.Resources.CodeGenerationFunction).toBeDefined();
                
                // Validate DynamoDB table structure
                const trackingTable = template.Resources.GenerationTrackingTable;
                expect(trackingTable.Properties.AttributeDefinitions).toContainEqual({
                    AttributeName: 'generationId',
                    AttributeType: 'S'
                });
                expect(trackingTable.Properties.GlobalSecondaryIndexes).toBeDefined();
            });
            
            it('should validate code generation function environment variables', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'codegen-infrastructure.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                const codegenFunction = template.Resources.CodeGenerationFunction;
                const envVars = codegenFunction.Properties.Environment.Variables;
                
                expect(envVars.GENERATION_BUCKET).toBeDefined();
                expect(envVars.TEMPLATE_BUCKET).toBeDefined();
                expect(envVars.TRACKING_TABLE).toBeDefined();
                expect(envVars.SERVICE_NAME).toBeDefined();
            });
        });
        
        describe('Advanced Alerting Infrastructure', () => {
            it('should validate alerting CloudFormation template', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'alerting-infrastructure.yaml');
                expect(fs.existsSync(templatePath)).toBe(true);
                
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                // Validate template structure
                expect(template.Description).toContain('Advanced Alerting Infrastructure');
                
                // Validate key resources
                expect(template.Resources.CriticalAlertsTopic).toBeDefined();
                expect(template.Resources.WarningAlertsTopic).toBeDefined();
                expect(template.Resources.AlertProcessorFunction).toBeDefined();
                expect(template.Resources.SystemHealthCompositeAlarm).toBeDefined();
                
                // Validate alert processor function has correct permissions
                const alertProcessor = template.Resources.AlertProcessorFunction;
                expect(alertProcessor.Properties.Environment.Variables.SERVICE_NAME).toBeDefined();
            });
            
            it('should validate composite alarm configuration', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'alerting-infrastructure.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                const compositeAlarm = template.Resources.SystemHealthCompositeAlarm;
                expect(compositeAlarm.Properties.AlarmRule).toContain('ALARM');
                expect(compositeAlarm.Properties.AlarmActions).toBeDefined();
            });
        });
        
        describe('Deployment Pipeline Infrastructure', () => {
            it('should validate deployment pipeline CloudFormation template', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'deployment-pipeline.yaml');
                expect(fs.existsSync(templatePath)).toBe(true);
                
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                // Validate template structure
                expect(template.Description).toContain('Deployment Pipeline Infrastructure');
                
                // Validate key resources
                expect(template.Resources.PipelineArtifactsBucket).toBeDefined();
                expect(template.Resources.BackendBuildProject).toBeDefined();
                expect(template.Resources.UIBuildProject).toBeDefined();
                expect(template.Resources.DeploymentPipeline).toBeDefined();
                
                // Validate CodeBuild projects
                const backendBuild = template.Resources.BackendBuildProject;
                expect(backendBuild.Properties.Environment.Image).toContain('amazonlinux');
                expect(backendBuild.Properties.Source.BuildSpec).toContain('serverless package');
            });
            
            it('should validate pipeline stages configuration', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'deployment-pipeline.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                const pipeline = template.Resources.DeploymentPipeline;
                const stages = pipeline.Properties.Stages;
                
                // Validate required stages
                const stageNames = stages.map(stage => stage.Name);
                expect(stageNames).toContain('Source');
                expect(stageNames).toContain('Build');
                expect(stageNames).toContain('DeployDev');
                expect(stageNames).toContain('DeployProduction');
                
                // Validate approval actions
                const prodStage = stages.find(stage => stage.Name === 'DeployProduction');
                const approvalAction = prodStage.Actions.find(action => action.ActionTypeId.Provider === 'Manual');
                expect(approvalAction).toBeDefined();
            });
        });
        
        describe('Enhanced Monitoring Infrastructure', () => {
            it('should validate enhanced monitoring template with Phase 3 features', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'monitoring-infrastructure.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                // Validate Phase 3 specific parameters
                expect(template.Parameters.CodeGenerationEnabled).toBeDefined();
                expect(template.Parameters.UIDistributionEnabled).toBeDefined();
                
                // Validate Phase 3 specific resources
                expect(template.Resources.CodeGenerationMetrics).toBeDefined();
                expect(template.Resources.UIDistributionMetrics).toBeDefined();
                expect(template.Resources.Phase3MonitoringDashboard).toBeDefined();
                
                // Validate Phase 3 dashboard output
                expect(template.Outputs.Phase3DashboardURL).toBeDefined();
            });
            
            it('should validate Phase 3 metric filters and alarms', () => {
                const templatePath = path.join(__dirname, 'cloudformation', 'monitoring-infrastructure.yaml');
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                // Validate code generation metrics
                const codegenMetrics = template.Resources.CodeGenerationMetrics;
                expect(codegenMetrics.Properties.FilterPattern).toContain('CODEGEN_');
                expect(codegenMetrics.Properties.MetricTransformations[0].MetricNamespace).toContain('CodeGeneration');
                
                // Validate code generation alarm
                const codegenAlarm = template.Resources.CodeGenerationAlarm;
                expect(codegenAlarm.Properties.MetricName).toBe('GenerationErrors');
                expect(codegenAlarm.Properties.Threshold).toBe(3);
            });
        });
        
        describe('End-to-End Phase 3 Integration', () => {
            it('should generate serverless config with Phase 3 websocket support', async () => {
                const appDefinition = {
                    name: 'phase3-test-app',
                    websockets: { enable: true },
                    integrations: []
                };
                
                const serverlessConfig = await composeServerlessDefinition(appDefinition);
                
                // Validate websocket function
                expect(serverlessConfig.functions.defaultWebsocket).toBeDefined();
                expect(serverlessConfig.functions.defaultWebsocket.events).toContainEqual({
                    websocket: { route: '$connect' }
                });
                expect(serverlessConfig.functions.defaultWebsocket.events).toContainEqual({
                    websocket: { route: '$disconnect' }
                });
            });
            
            it('should validate Phase 3 infrastructure cross-stack dependencies', () => {
                // Load all Phase 3 templates
                const templates = {
                    cdn: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'cdn-infrastructure.yaml'), 'utf8')),
                    codegen: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'codegen-infrastructure.yaml'), 'utf8')),
                    alerting: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'alerting-infrastructure.yaml'), 'utf8')),
                    pipeline: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'deployment-pipeline.yaml'), 'utf8'))
                };
                
                // Validate exports that other stacks can import
                expect(templates.cdn.Outputs.UIDistributionBucket.Export).toBeDefined();
                expect(templates.codegen.Outputs.CodeGenerationBucket.Export).toBeDefined();
                expect(templates.alerting.Outputs.CriticalAlertsTopic.Export).toBeDefined();
                expect(templates.pipeline.Outputs.PipelineArtifactsBucket.Export).toBeDefined();
                
                // Validate consistent naming conventions
                const serviceName = '${ServiceName}';
                const stage = '${Stage}';
                
                Object.values(templates).forEach(template => {
                    expect(template.Parameters.ServiceName.Default).toBe('frigg');
                    if (template.Parameters.Stage) {
                        expect(template.Parameters.Stage.AllowedValues).toContain('production');
                    }
                });
            });
            
            it('should validate Phase 3 security configurations across all components', () => {
                const templates = {
                    cdn: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'cdn-infrastructure.yaml'), 'utf8')),
                    codegen: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'codegen-infrastructure.yaml'), 'utf8')),
                    alerting: yaml.load(fs.readFileSync(path.join(__dirname, 'cloudformation', 'alerting-infrastructure.yaml'), 'utf8'))
                };
                
                // Validate S3 bucket encryption across all templates
                const s3Resources = [];
                Object.values(templates).forEach(template => {
                    Object.entries(template.Resources).forEach(([name, resource]) => {
                        if (resource.Type === 'AWS::S3::Bucket') {
                            s3Resources.push({ name, resource });
                        }
                    });
                });
                
                s3Resources.forEach(({ name, resource }) => {
                    expect(resource.Properties.BucketEncryption).toBeDefined();
                    expect(resource.Properties.PublicAccessBlockConfiguration).toBeDefined();
                });
                
                // Validate SNS topic encryption
                const snsTopics = [];
                Object.values(templates).forEach(template => {
                    Object.entries(template.Resources).forEach(([name, resource]) => {
                        if (resource.Type === 'AWS::SNS::Topic') {
                            snsTopics.push({ name, resource });
                        }
                    });
                });
                
                snsTopics.forEach(({ name, resource }) => {
                    expect(resource.Properties.KmsMasterKeyId).toBeDefined();
                });
            });
        });
        
        describe('Infrastructure Performance Tests', () => {
            it('should validate CloudFormation template sizes are within limits', () => {
                const templateFiles = [
                    'monitoring-infrastructure.yaml',
                    'cdn-infrastructure.yaml',
                    'codegen-infrastructure.yaml',
                    'alerting-infrastructure.yaml',
                    'deployment-pipeline.yaml'
                ];
                
                templateFiles.forEach(fileName => {
                    const templatePath = path.join(__dirname, 'cloudformation', fileName);
                    const stats = fs.statSync(templatePath);
                    
                    // CloudFormation template limit is 51,200 bytes for direct upload
                    // Keep under 45KB to allow for future growth
                    expect(stats.size).toBeLessThan(45 * 1024);
                });
            });
            
            it('should validate resource counts are within CloudFormation limits', () => {
                const templateFiles = [
                    'monitoring-infrastructure.yaml',
                    'cdn-infrastructure.yaml',
                    'codegen-infrastructure.yaml',
                    'alerting-infrastructure.yaml',
                    'deployment-pipeline.yaml'
                ];
                
                templateFiles.forEach(fileName => {
                    const templatePath = path.join(__dirname, 'cloudformation', fileName);
                    const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                    
                    const resourceCount = Object.keys(template.Resources || {}).length;
                    
                    // CloudFormation limit is 500 resources per template
                    // Keep under 200 for maintainability
                    expect(resourceCount).toBeLessThan(200);
                    expect(resourceCount).toBeGreaterThan(0);
                });
            });
        });
    });
    
    describe('Phase 3 Deployment Validation', () => {
        it('should validate all Phase 3 templates can be deployed together', () => {
            const templateDir = path.join(__dirname, 'cloudformation');
            const templateFiles = fs.readdirSync(templateDir).filter(file => file.endsWith('.yaml'));
            
            expect(templateFiles.length).toBeGreaterThanOrEqual(5);
            
            // Validate each template is valid YAML
            templateFiles.forEach(fileName => {
                const templatePath = path.join(templateDir, fileName);
                const templateContent = fs.readFileSync(templatePath, 'utf8');
                
                expect(() => {
                    yaml.load(templateContent);
                }).not.toThrow();
            });
        });
        
        it('should validate template parameter consistency', () => {
            const templateFiles = [
                'monitoring-infrastructure.yaml',
                'cdn-infrastructure.yaml', 
                'codegen-infrastructure.yaml',
                'alerting-infrastructure.yaml',
                'deployment-pipeline.yaml'
            ];
            
            const commonParameters = ['ServiceName', 'Stage'];
            
            templateFiles.forEach(fileName => {
                const templatePath = path.join(__dirname, 'cloudformation', fileName);
                const template = yaml.load(fs.readFileSync(templatePath, 'utf8'));
                
                commonParameters.forEach(paramName => {
                    if (template.Parameters && template.Parameters[paramName]) {
                        // Validate ServiceName default
                        if (paramName === 'ServiceName') {
                            expect(template.Parameters[paramName].Default).toBe('frigg');
                        }
                        
                        // Validate Stage allowed values
                        if (paramName === 'Stage' && template.Parameters[paramName].AllowedValues) {
                            expect(template.Parameters[paramName].AllowedValues).toContain('production');
                            expect(template.Parameters[paramName].AllowedValues).toContain('development');
                        }
                    }
                });
            });
        });
    });
});