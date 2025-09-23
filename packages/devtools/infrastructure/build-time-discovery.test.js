const fs = require('fs');
const path = require('path');
const { BuildTimeDiscovery, runBuildTimeDiscovery } = require('./build-time-discovery');
const { AWSDiscovery } = require('./aws-discovery');

// Mock dependencies
jest.mock('fs');
jest.mock('./aws-discovery');

describe('BuildTimeDiscovery', () => {
    let buildTimeDiscovery;
    let mockAWSDiscovery;
    const originalEnv = process.env;

    beforeEach(() => {
        buildTimeDiscovery = new BuildTimeDiscovery('us-east-1');
        
        // Mock AWSDiscovery
        mockAWSDiscovery = {
            discoverResources: jest.fn(),
        };
        AWSDiscovery.mockImplementation(() => mockAWSDiscovery);

        // Mock fs methods
        fs.writeFileSync = jest.fn();
        fs.readFileSync = jest.fn();

        // Reset environment
        process.env = { ...originalEnv };
        
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('constructor', () => {
        it('should initialize with default region', () => {
            const discovery = new BuildTimeDiscovery();
            expect(discovery.region).toBe('us-east-1');
        });

        it('should initialize with custom region', () => {
            const discovery = new BuildTimeDiscovery('us-west-2');
            expect(discovery.region).toBe('us-west-2');
        });

        it('should use AWS_REGION environment variable', () => {
            process.env.AWS_REGION = 'eu-west-1';
            const discovery = new BuildTimeDiscovery();
            expect(discovery.region).toBe('eu-west-1');
        });
    });

    describe('discoverAndCreateConfig', () => {
        const mockResources = {
            defaultVpcId: 'vpc-12345678',
            vpcCidr: '172.31.0.0/16',
            defaultSecurityGroupId: 'sg-12345678',
            privateSubnetId1: 'subnet-1',
            privateSubnetId2: 'subnet-2',
            privateRouteTableId: 'rtb-12345678',
            defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678'
        };

        it('should discover resources and create config file', async () => {
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await buildTimeDiscovery.discoverAndCreateConfig('./test-config.json');

            expect(mockAWSDiscovery.discoverResources).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './test-config.json',
                expect.stringContaining('"awsDiscovery"')
            );
            expect(result.awsDiscovery).toEqual(mockResources);
            expect(result.region).toBe('us-east-1');
            expect(result.generatedAt).toBeDefined();
        });

        it('should use default output path', async () => {
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            await buildTimeDiscovery.discoverAndCreateConfig();

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './aws-discovery-config.json',
                expect.any(String)
            );
        });

        it('should throw error when discovery fails', async () => {
            const error = new Error('Discovery failed');
            mockAWSDiscovery.discoverResources.mockRejectedValue(error);

            await expect(buildTimeDiscovery.discoverAndCreateConfig()).rejects.toThrow('Discovery failed');
        });
    });

    describe('replaceTemplateVariables', () => {
        const mockResources = {
            defaultVpcId: 'vpc-12345678',
            vpcCidr: '172.31.0.0/16',
            defaultSecurityGroupId: 'sg-12345678',
            privateSubnetId1: 'subnet-1',
            privateSubnetId2: 'subnet-2',
            privateRouteTableId: 'rtb-12345678',
            defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678'
        };

        it('should replace all AWS discovery placeholders', () => {
            const templateContent = `
                vpc:
                    id: \${self:custom.awsDiscovery.defaultVpcId}
                    securityGroups:
                        - \${self:custom.awsDiscovery.defaultSecurityGroupId}
                    subnets:
                        - \${self:custom.awsDiscovery.privateSubnetId1}
                        - \${self:custom.awsDiscovery.privateSubnetId2}
                    routeTable: \${self:custom.awsDiscovery.privateRouteTableId}
                kms:
                    keyId: \${self:custom.awsDiscovery.defaultKmsKeyId}
            `;

            const result = buildTimeDiscovery.replaceTemplateVariables(templateContent, mockResources);

            expect(result).toContain('vpc-12345678');
            expect(result).toContain('sg-12345678');
            expect(result).toContain('subnet-1');
            expect(result).toContain('subnet-2');
            expect(result).toContain('rtb-12345678');
            expect(result).toContain('arn:aws:kms:us-east-1:123456789012:key/12345678');
            expect(result).not.toContain('${self:custom.awsDiscovery');
        });

        it('should handle content without placeholders', () => {
            const templateContent = `
                service: my-service
                provider:
                    name: aws
                    runtime: nodejs18.x
            `;

            const result = buildTimeDiscovery.replaceTemplateVariables(templateContent, mockResources);

            expect(result).toBe(templateContent);
        });

        it('should handle multiple occurrences of same placeholder', () => {
            const templateContent = `
                vpc1: \${self:custom.awsDiscovery.defaultVpcId}
                vpc2: \${self:custom.awsDiscovery.defaultVpcId}
            `;

            const result = buildTimeDiscovery.replaceTemplateVariables(templateContent, mockResources);

            expect(result).toBe(`
                vpc1: vpc-12345678
                vpc2: vpc-12345678
            `);
        });
    });

    describe('processServerlessConfig', () => {
        const mockConfigContent = `
            provider:
                vpc: \${self:custom.awsDiscovery.defaultVpcId}
                kms: \${self:custom.awsDiscovery.defaultKmsKeyId}
        `;

        const mockResources = {
            defaultVpcId: 'vpc-12345678',
            defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678'
        };

        it('should process serverless config and update file', async () => {
            fs.readFileSync.mockReturnValue(mockConfigContent);
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await buildTimeDiscovery.processServerlessConfig('./serverless.yml');

            expect(fs.readFileSync).toHaveBeenCalledWith('./serverless.yml', 'utf8');
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './serverless.yml',
                expect.stringContaining('vpc-12345678')
            );
            expect(result).toEqual(mockResources);
        });

        it('should write to different output file when specified', async () => {
            fs.readFileSync.mockReturnValue(mockConfigContent);
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            await buildTimeDiscovery.processServerlessConfig('./serverless.yml', './serverless-processed.yml');

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './serverless-processed.yml',
                expect.any(String)
            );
        });

        it('should throw error when file read fails', async () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            await expect(buildTimeDiscovery.processServerlessConfig('./nonexistent.yml')).rejects.toThrow('File not found');
        });
    });

    describe('generateCustomSection', () => {
        it('should generate custom section with discovered resources', () => {
            const mockResources = {
                defaultVpcId: 'vpc-12345678',
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678'
            };

            const result = buildTimeDiscovery.generateCustomSection(mockResources);

            expect(result).toEqual({
                awsDiscovery: mockResources
            });
        });
    });

    describe('preBuildHook', () => {
        const mockResources = {
            defaultVpcId: 'vpc-12345678',
            vpcCidr: '172.31.0.0/16',
            defaultSecurityGroupId: 'sg-12345678',
            privateSubnetId1: 'subnet-1',
            privateSubnetId2: 'subnet-2',
            privateRouteTableId: 'rtb-12345678',
            defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678'
        };

        it('should run discovery when VPC is enabled', async () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(mockAWSDiscovery.discoverResources).toHaveBeenCalled();
            expect(result).toEqual(mockResources);
            expect(process.env.AWS_DISCOVERY_VPC_ID).toBe('vpc-12345678');
            expect(process.env.AWS_DISCOVERY_KMS_KEY_ID).toBe('arn:aws:kms:us-east-1:123456789012:key/12345678');
        });

        it('should run discovery when KMS is enabled', async () => {
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(mockAWSDiscovery.discoverResources).toHaveBeenCalled();
            expect(result).toEqual(mockResources);
        });

        it('should run discovery when SSM is enabled', async () => {
            const appDefinition = {
                ssm: { enable: true },
                integrations: []
            };

            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(mockAWSDiscovery.discoverResources).toHaveBeenCalled();
            expect(result).toEqual(mockResources);
        });

        it('should skip discovery when no features are enabled', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(mockAWSDiscovery.discoverResources).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it('should throw error when discovery fails', async () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            const error = new Error('Discovery failed');
            mockAWSDiscovery.discoverResources.mockRejectedValue(error);

            await expect(buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1')).rejects.toThrow('Discovery failed');
        });

        it('should set all environment variables', async () => {
            const appDefinition = {
                vpc: { enable: true },
                integrations: []
            };

            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            await buildTimeDiscovery.preBuildHook(appDefinition, 'us-east-1');

            expect(process.env.AWS_DISCOVERY_VPC_ID).toBe('vpc-12345678');
            expect(process.env.AWS_DISCOVERY_SECURITY_GROUP_ID).toBe('sg-12345678');
            expect(process.env.AWS_DISCOVERY_SUBNET_ID_1).toBe('subnet-1');
            expect(process.env.AWS_DISCOVERY_SUBNET_ID_2).toBe('subnet-2');
            expect(process.env.AWS_DISCOVERY_ROUTE_TABLE_ID).toBe('rtb-12345678');
            expect(process.env.AWS_DISCOVERY_KMS_KEY_ID).toBe('arn:aws:kms:us-east-1:123456789012:key/12345678');
        });
    });

    describe('runBuildTimeDiscovery', () => {
        it('should run discovery with default options', async () => {
            const mockResources = { defaultVpcId: 'vpc-12345678' };
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await runBuildTimeDiscovery();

            expect(result.awsDiscovery).toEqual(mockResources);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './aws-discovery-config.json',
                expect.any(String)
            );
        });

        it('should process config file when configPath provided', async () => {
            const mockConfigContent = 'provider: aws';
            const mockResources = { defaultVpcId: 'vpc-12345678' };
            
            fs.readFileSync.mockReturnValue(mockConfigContent);
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await runBuildTimeDiscovery({
                configPath: './serverless.yml'
            });

            expect(result).toEqual(mockResources);
            expect(fs.readFileSync).toHaveBeenCalledWith('./serverless.yml', 'utf8');
        });

        it('should use custom region and output path', async () => {
            const mockResources = { defaultVpcId: 'vpc-12345678' };
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            await runBuildTimeDiscovery({
                region: 'eu-west-1',
                outputPath: './custom-config.json'
            });

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                './custom-config.json',
                expect.any(String)
            );
        });

        it('should use AWS_REGION environment variable when region not specified', async () => {
            process.env.AWS_REGION = 'ap-southeast-1';
            const mockResources = { defaultVpcId: 'vpc-12345678' };
            mockAWSDiscovery.discoverResources.mockResolvedValue(mockResources);

            const result = await runBuildTimeDiscovery();

            expect(result.region).toBe('ap-southeast-1');
        });
    });
});