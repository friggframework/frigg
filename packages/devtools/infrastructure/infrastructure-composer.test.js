const {
    composeServerlessDefinition,
    applySsmPreloadNodeOptions,
} = require('./infrastructure-composer');
const {
    SSM_PRELOAD_NODE_OPTIONS,
} = require('./domains/parameters/offload-utils');

// Helper to build discovery responses with overridable fields
const createDiscoveryResponse = (overrides = {}) => ({
    defaultVpcId: 'vpc-123456',
    vpcCidr: '172.31.0.0/16', // Provide VPC CIDR so security group fallbacks can be tested
    defaultSecurityGroupId: 'sg-123456',
    privateSubnetId1: 'subnet-123456',
    privateSubnetId2: 'subnet-789012',
    publicSubnetId: 'subnet-public', // Keep for backward compat
    publicSubnetId1: 'subnet-public-1',
    publicSubnetId2: 'subnet-public-2',
    defaultRouteTableId: 'rtb-123456',
    defaultKmsKeyId:
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    existingNatGatewayId: 'nat-default123',
    auroraClusterEndpoint: 'test-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
    auroraPort: 5432,
    auroraEngine: 'aurora-postgresql',
    ...overrides,
});

// Mock resource discovery to prevent actual AWS calls
jest.mock('./domains/shared/resource-discovery', () => {
    const originalModule = jest.requireActual('./domains/shared/resource-discovery');
    return {
        ...originalModule,
        gatherDiscoveredResources: jest.fn().mockResolvedValue(createDiscoveryResponse()),
    };
});

// The Prisma layer build runs `npm install` into packages/devtools/layers/prisma;
// a unit test must never do that (it took ~40 s and rewrote tracked files).
jest.mock('./domains/shared/utilities/prisma-layer-manager', () => ({
    ensurePrismaLayerExists: jest.fn().mockResolvedValue(undefined),
}));

const { gatherDiscoveredResources } = require('./domains/shared/resource-discovery');

// The orchestrator logs each builder's validation errors, then throws one
// summary error; assert both.
async function expectValidationError(appDefinition, message) {
    const logSpy = jest.spyOn(console, 'log');
    try {
        await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
            'Infrastructure validation failed'
        );
        const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
        expect(logged).toContain(message);
    } finally {
        logSpy.mockRestore();
    }
}

describe('composeServerlessDefinition', () => {
    let mockIntegration;

    beforeEach(() => {
        // Reset the mock to default behavior
        gatherDiscoveredResources.mockResolvedValue(createDiscoveryResponse());

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
        jest.clearAllMocks();
        // Restore env
        delete process.env.AWS_REGION;
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        process.argv = ['node', 'test'];
    });

    // Whether discovery actually talks to AWS (no features need it, or
    // FRIGG_SKIP_AWS_DISCOVERY=true) is decided inside gatherDiscoveredResources
    // by shouldRunDiscovery(); see domains/shared/resource-discovery.test.js.
    // The composer always calls it, so these tests only check the call happens.
    describe('AWS discovery gating', () => {

        it('should run AWS discovery when VPC features are enabled', async () => {
            gatherDiscoveredResources.mockClear();

            const appDefinition = {
                integrations: [],
                vpc: { enable: true },
            };

            await composeServerlessDefinition(appDefinition);

            expect(gatherDiscoveredResources).toHaveBeenCalledTimes(1);
        });

        it('should run AWS discovery when FRIGG_SKIP_AWS_DISCOVERY is not set', async () => {
            gatherDiscoveredResources.mockClear();
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;

            const appDefinition = {
                integrations: [],
                vpc: { enable: true },
            };

            await composeServerlessDefinition(appDefinition);

            expect(gatherDiscoveredResources).toHaveBeenCalledTimes(1);
        });

        it('should skip VPC configuration when FRIGG_SKIP_AWS_DISCOVERY is true', async () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                integrations: [],
                vpc: { enable: true, management: 'discover' },
            };

            const result = await composeServerlessDefinition(appDefinition);

            // VPC configuration should not be present when skipped
            expect(result.provider.vpc).toBeUndefined();
        });
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
            expect(result.provider.runtime).toBe('nodejs22.x');
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

    describe('Environment variables', () => {
        it('should include only non-reserved environment flags', async () => {
            const appDefinition = {
                integrations: [],
                environment: {
                    CUSTOM_FLAG: true,
                    AWS_REGION: true,
                    OPTIONAL_DISABLED: false,
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.CUSTOM_FLAG).toBe("${env:CUSTOM_FLAG, ''}");
            expect(result.provider.environment).not.toHaveProperty('AWS_REGION');
            expect(result.provider.environment).not.toHaveProperty('OPTIONAL_DISABLED');
        });

        it('should ignore string-valued environment entries', async () => {
            const appDefinition = {
                integrations: [],
                environment: {
                    CUSTOM_FLAG: 'enabled',
                },
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment).not.toHaveProperty('CUSTOM_FLAG');
        });
    });

    describe('Logging (ADR-048)', () => {
        it('carries logging into FRIGG_LOG_LEVEL and logRetentionInDays, with no Lambda LoggingConfig by default', async () => {
            const result = await composeServerlessDefinition({
                integrations: [mockIntegration],
                logging: { level: 'debug', retentionInDays: 30 },
            });

            expect(result.frameworkVersion).toBe('>=3.17.0');
            expect(result.provider.logs).toBeUndefined();
            expect(result.provider.logRetentionInDays).toBe(30);
            expect(result.provider.environment.FRIGG_LOG_LEVEL).toBe('DEBUG');
        });

        it('sets no function-level logs, which would replace the provider block', async () => {
            const result = await composeServerlessDefinition({
                integrations: [mockIntegration],
                logging: { level: 'warn' },
            });

            const functions = Object.values(result.functions);
            expect(functions.length).toBeGreaterThan(0);
            expect(functions.every((fn) => fn.logs === undefined)).toBe(true);
        });

        it('lets logging.level win over environment: { FRIGG_LOG_LEVEL: true }', async () => {
            const result = await composeServerlessDefinition({
                integrations: [],
                environment: { FRIGG_LOG_LEVEL: true },
                logging: { level: 'error' },
            });

            expect(result.provider.environment.FRIGG_LOG_LEVEL).toBe('ERROR');
        });

        it('changes nothing when logging is absent', async () => {
            const result = await composeServerlessDefinition({ integrations: [] });

            expect(result.frameworkVersion).toBe('>=3.17.0');
            expect(result.provider.logs).toBeUndefined();
            expect(result.provider.logRetentionInDays).toBeUndefined();
            expect(result.provider.environment).not.toHaveProperty('FRIGG_LOG_LEVEL');
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

        // Test all 9 combinations of VPC and Subnet management modes
        it('should handle create-new VPC with create subnets', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                    subnets: { management: 'create' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggVPC).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet2).toBeDefined();
            expect(result.provider.vpc.subnetIds).toEqual([
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' }
            ]);
        });

        it('should handle discover VPC with create subnets', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    subnets: { management: 'create' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggVPC).toBeUndefined();
            expect(result.resources.Resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet2).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet1.Properties.VpcId).toBe('vpc-123456');
        });

        it('should handle use-existing VPC with create subnets', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-existing123',
                    subnets: { management: 'create' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggVPC).toBeUndefined();
            expect(result.resources.Resources.FriggPrivateSubnet1).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet2).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet1.Properties.VpcId).toBe('vpc-existing123');
        });

        it('should handle use-existing VPC with use-existing subnets', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-custom',
                    subnets: {
                        management: 'use-existing',
                        ids: ['subnet-explicit1', 'subnet-explicit2']
                    }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggPrivateSubnet1).toBeUndefined();
            expect(result.resources.Resources.FriggPrivateSubnet2).toBeUndefined();
            expect(result.provider.vpc.subnetIds).toEqual(['subnet-explicit1', 'subnet-explicit2']);
        });

        it('should respect provided security group IDs when supplied', async () => {
            // User-supplied security groups are honoured for an existing VPC
            // (vpc.management 'use-existing'); every ID is attached, not just the first.
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-123456',
                    securityGroupIds: ['sg-custom-1', 'sg-custom-2'],
                    subnets: { ids: ['subnet-123456', 'subnet-789012'] },
                },
                integrations: [],
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc.securityGroupIds).toEqual([
                'sg-custom-1',
                'sg-custom-2',
            ]);
        });

        it('should throw when discover mode finds no subnets and self-heal is disabled', async () => {
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({
                    privateSubnetId1: null,
                    privateSubnetId2: null,
                })
            );

            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    selfHeal: false,
                    subnets: { management: 'discover' },
                },
                integrations: [],
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                'No subnets discovered. Enable vpc.selfHeal, set subnets.management to "create", or provide subnet IDs.'
            );
        });

        it('should use Fn::Cidr for subnet CIDR blocks in new VPC to avoid conflicts', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                    subnets: { management: 'create' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Verify new VPC uses 10.0.0.0/16
            expect(result.resources.Resources.FriggVPC.Properties.CidrBlock).toBe('10.0.0.0/16');

            // Verify subnets use Fn::Cidr to generate non-conflicting CIDRs
            const subnet1Cidr = result.resources.Resources.FriggPrivateSubnet1.Properties.CidrBlock;
            const subnet2Cidr = result.resources.Resources.FriggPrivateSubnet2.Properties.CidrBlock;
            const publicSubnetCidr = result.resources.Resources.FriggPublicSubnet.Properties.CidrBlock;

            // Check that CIDRs are generated using Fn::Cidr and Fn::Select
            expect(subnet1Cidr).toHaveProperty('Fn::Select');
            expect(subnet1Cidr['Fn::Select'][0]).toBe(0);
            expect(subnet2Cidr).toHaveProperty('Fn::Select');
            expect(subnet2Cidr['Fn::Select'][0]).toBe(1);
            expect(publicSubnetCidr).toHaveProperty('Fn::Select');
            expect(publicSubnetCidr['Fn::Select'][0]).toBe(2);
        });

        it('should create route tables for subnets even without NAT Gateway management', async () => {
            // A fresh account: nothing to reuse, so the stack builds its own routing.
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ existingNatGatewayId: null })
            );

            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new',
                    subnets: { management: 'create' },
                    natGateway: { management: 'discover' }
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // Verify route tables are created
            expect(result.resources.Resources.FriggPublicRouteTable).toBeDefined();
            expect(result.resources.Resources.FriggPublicRoute).toBeDefined();
            expect(result.resources.Resources.FriggLambdaRouteTable).toBeDefined();

            // Verify subnet associations
            expect(result.resources.Resources.FriggPublicSubnet1RouteTableAssociation).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet1RouteTableAssociation).toBeDefined();
            expect(result.resources.Resources.FriggPrivateSubnet2RouteTableAssociation).toBeDefined();
        });

        it('should throw error when use-existing mode without vpcId', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing'
                },
                integrations: []
            };

            await expectValidationError(
                appDefinition,
                'vpc.vpcId is required when management="use-existing"'
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

            const s3Endpoint = result.resources.Resources.FriggS3VPCEndpoint;
            expect(s3Endpoint).toBeDefined();
            expect(s3Endpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(s3Endpoint.Properties.VpcId).toBe('vpc-123456');
            expect(s3Endpoint.Properties.VpcEndpointType).toBe('Gateway');
        });

        it('should skip creating VPC endpoints when disabled explicitly', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                    enableVPCEndpoints: false,
                },
                integrations: [],
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggS3VPCEndpoint).toBeUndefined();
            expect(result.resources.Resources.FriggKMSVPCEndpoint).toBeUndefined();
            expect(result.resources.Resources.FriggSecretsManagerVPCEndpoint).toBeUndefined();
        });

        it('should add Secrets Manager endpoint only when enabled', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover',
                },
                secretsManager: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: [],
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.resources.Resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
            expect(result.resources.Resources.FriggKMSVPCEndpoint).toBeDefined();
        });

        it('should allow Lambda security group access for VPC endpoints when security group is discovered', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'discover'
                },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);
            const endpointSg = result.resources.Resources.FriggVPCEndpointSecurityGroup;

            expect(endpointSg).toBeDefined();
            expect(endpointSg.Properties.SecurityGroupIngress).toEqual([
                {
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    SourceSecurityGroupId: 'sg-123456',
                    Description: 'HTTPS from Lambda'
                }
            ]);
        });

        it('should pass an imported Lambda security group through to the endpoint ingress rule', async () => {
            // CloudFormation resolves Fn::ImportValue to the group ID at deploy
            // time, so the endpoint SG can reference it directly (the old
            // VPC-CIDR fallback for unresolvable groups is no longer needed).
            const importedSg = { 'Fn::ImportValue': 'shared-lambda-security-group' };
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    vpcId: 'vpc-123456',
                    securityGroupIds: [importedSg],
                    subnets: { ids: ['subnet-123456', 'subnet-789012'] },
                },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: [],
            };

            const result = await composeServerlessDefinition(appDefinition);
            const endpointSg = result.resources.Resources.FriggVPCEndpointSecurityGroup;

            expect(result.provider.vpc.securityGroupIds).toEqual([importedSg]);
            expect(endpointSg.Properties.SecurityGroupIngress).toEqual([
                {
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    SourceSecurityGroupId: importedSg,
                    Description: 'HTTPS from Lambda',
                },
            ]);
        });

        it('should reference the Lambda security group when creating a new VPC', async () => {
            const appDefinition = {
                vpc: {
                    enable: true,
                    management: 'create-new'
                },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);
            const endpointSg = result.resources.Resources.FriggVPCEndpointSecurityGroup;

            expect(endpointSg).toBeDefined();
            expect(endpointSg.Properties.SecurityGroupIngress).toEqual([
                {
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                    Description: 'HTTPS from Lambda'
                }
            ]);
        });

        it('should not add VPC configuration when vpc.enable is false', async () => {
            const appDefinition = {
                vpc: { enable: false },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
            expect(result.resources.Resources.FriggS3VPCEndpoint).toBeUndefined();
        });

        it('should not add VPC configuration when vpc is not defined', async () => {
            const appDefinition = {
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.vpc).toBeUndefined();
        });
    });

    // NAT placement rules (never reuse a NAT in a private subnet, self-heal,
    // EIP reuse, route-table association repair) are VpcBuilder decisions and
    // are covered in domains/networking/vpc-builder.test.js ('NAT Gateway
    // handling') and vpc-resolver.test.js. These check the composed template.
    describe('NAT Gateway behaviour', () => {
        it('should route through a discovered NAT gateway without creating a new one', async () => {
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({
                    existingNatGatewayId: 'nat-existing123',
                    natGatewayInPrivateSubnet: false,
                })
            );

            const result = await composeServerlessDefinition({
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: { management: 'discover' },
                },
                integrations: [],
            });

            expect(result.resources.Resources.FriggNATGateway).toBeUndefined();
            expect(result.resources.Resources.FriggPrivateRoute.Properties).toEqual({
                RouteTableId: { Ref: 'FriggLambdaRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                NatGatewayId: 'nat-existing123',
            });
        });

        it('should route through a provided NAT gateway ID', async () => {
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ existingNatGatewayId: null })
            );

            const result = await composeServerlessDefinition({
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: { management: 'useExisting', id: 'nat-custom-001' },
                },
                integrations: [],
            });

            expect(result.resources.Resources.FriggNATGateway).toBeUndefined();
            expect(result.resources.Resources.FriggPrivateRoute.Properties.NatGatewayId).toBe(
                'nat-custom-001'
            );
        });

        it('should create a retained NAT gateway in a public subnet with createAndManage', async () => {
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ existingNatGatewayId: null })
            );

            const result = await composeServerlessDefinition({
                vpc: {
                    enable: true,
                    management: 'discover',
                    natGateway: { management: 'createAndManage' },
                },
                integrations: [],
            });

            const resources = result.resources.Resources;
            expect(resources.FriggNATGateway.Type).toBe('AWS::EC2::NatGateway');
            expect(resources.FriggNATGateway.DeletionPolicy).toBe('Retain');
            expect(resources.FriggNATGateway.UpdateReplacePolicy).toBe('Retain');
            expect(resources.FriggNATGateway.Properties.SubnetId).toBe('subnet-public-1');
            expect(resources.FriggNATGatewayEIP).toBeDefined();
            expect(resources.FriggPublicRoute).toBeDefined();
            expect(resources.FriggPrivateRoute.Properties.NatGatewayId).toEqual({
                Ref: 'FriggNATGateway',
            });
        });
    });

    describe('KMS Configuration', () => {
        it('should add KMS configuration when encryption is enabled and key is found', async () => {
            const keyArn =
                'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012';
            const appDefinition = {
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // IAM: the Lambda role uses the discovered key directly (no
            // serverless-kms-grants plugin, which KmsBuilder no longer uses).
            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission).toEqual({
                Effect: 'Allow',
                Action: [
                    'kms:GenerateDataKey',
                    'kms:Decrypt',
                    'kms:Encrypt',
                    'kms:DescribeKey'
                ],
                Resource: keyArn
            });

            expect(result.provider.environment.KMS_KEY_ARN).toBe(keyArn);
            expect(result.plugins).not.toContain('serverless-kms-grants');
            expect(result.custom.kmsGrants).toBeUndefined();
            // A discovered key is referenced, not re-declared in the stack.
            expect(result.resources.Resources.FriggKMSKey).toBeUndefined();
        });

        it('should create new KMS key when encryption is enabled, no key found, and createResourceIfNoneFound is true', async () => {
            // Key policy, rotation and alias details are covered in
            // domains/security/kms-builder.test.js.
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ defaultKmsKeyId: null })
            );

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const key = result.resources.Resources.FriggKMSKey;
            expect(key.Type).toBe('AWS::KMS::Key');
            expect(key.DeletionPolicy).toBe('Retain');
            expect(key.Properties.EnableKeyRotation).toBe(true);

            const keyRef = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
            const kmsPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action.includes('kms:GenerateDataKey')
            );
            expect(kmsPermission.Resource).toEqual(keyRef);
            expect(result.provider.environment.KMS_KEY_ARN).toEqual(keyRef);
        });

        it('should fall back to the AWS_DISCOVERY_KMS_KEY_ID env reference when encryption is enabled, no key found, and createResourceIfNoneFound is false', async () => {
            // KmsBuilder no longer fails the build: it points the app at the
            // key ID the deploy environment provides (AWS_DISCOVERY_KMS_KEY_ID).
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ defaultKmsKeyId: null })
            );

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: false
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // An explicit `false` keeps the legacy raw env reference (see
            // kms-builder.test.js 'Error handling').
            expect(result.resources.Resources.FriggKMSKey).toBeUndefined();
            expect(result.provider.environment.KMS_KEY_ARN).toBe(
                '${env:AWS_DISCOVERY_KMS_KEY_ID}'
            );
        });

        it('should fall back to the AWS_DISCOVERY_KMS_KEY_ID env reference when encryption is enabled, no key found, and createResourceIfNoneFound is not specified', async () => {
            // KmsBuilder no longer fails the build: it points the app at the
            // key ID the deploy environment provides (AWS_DISCOVERY_KMS_KEY_ID).
            gatherDiscoveredResources.mockResolvedValue(
                createDiscoveryResponse({ defaultKmsKeyId: null })
            );

            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms'
                    // createResourceIfNoneFound not specified, defaults to false
                },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            const fallbackArn =
                'arn:aws:kms:${self:provider.region}:${aws:accountId}:key/${env:AWS_DISCOVERY_KMS_KEY_ID}';
            expect(result.resources.Resources.FriggKMSKey).toBeUndefined();
            expect(result.provider.environment.KMS_KEY_ARN).toBe(fallbackArn);
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
        const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

        afterEach(() => {
            if (originalSkipDiscovery === undefined) {
                delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            } else {
                process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
            }
        });

        it('should add the broad SSM read grant when ssm.enable is true without offload', async () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            const appDefinition = {
                ssm: { enable: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // We deliberately do NOT use the AWS Parameters-and-Secrets extension layer
            expect(result.provider.layers).toBeUndefined();

            // Broad read grant present
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
                Resource: {
                    'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/*'
                }
            });

            // No offload markers -> no offload env vars
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
            expect(result.provider.environment.FRIGG_SSM_OFFLOADED_KEYS).toBeUndefined();
        });

        it('should offload marked keys and expose prefix + offloaded keys env vars', async () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            const appDefinition = {
                ssm: { enable: true },
                environment: { FOO: 'ssm', BAR: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            // BAR stays in the Lambda env, FOO is offloaded out of it
            expect(result.provider.environment.BAR).toBe("${env:BAR, ''}");
            expect(result.provider.environment.FOO).toBeUndefined();

            // Offload env contract
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBe(
                '/frigg/${self:service}/${self:provider.stage}'
            );
            expect(result.provider.environment.FRIGG_SSM_OFFLOADED_KEYS).toBe('FOO');

            // Prefix-scoped read grant present alongside the broad grant
            const scoped = result.provider.iamRoleStatements.find(
                statement => statement.Resource === 'arn:aws:ssm:${self:provider.region}:${aws:accountId}:parameter/frigg/${self:service}/${self:provider.stage}/*'
            );
            expect(scoped).toBeDefined();
        });

        it('should not add offload env vars when ssm.enable is true but nothing is marked', async () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            const appDefinition = {
                ssm: { enable: true },
                environment: { BAR: true },
                integrations: []
            };

            const result = await composeServerlessDefinition(appDefinition);

            expect(result.provider.environment.BAR).toBe("${env:BAR, ''}");
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();
            expect(result.provider.environment.FRIGG_SSM_OFFLOADED_KEYS).toBeUndefined();
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

            // Check integration function (packaging/layers are covered by the
            // base-definition and integration-builder tests)
            expect(result.functions.testIntegration).toEqual(expect.objectContaining({
                handler: 'node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.testIntegration.handler',
                events: [{
                    httpApi: {
                        path: '/api/testIntegration-integration/{proxy+}',
                        method: 'ANY'
                    }
                }]
            }));

            // Check SQS Queue
            expect(result.resources.Resources.TestIntegrationQueue).toEqual({
                Type: 'AWS::SQS::Queue',
                Properties: {
                    QueueName: '${self:custom.TestIntegrationQueue}',
                    MessageRetentionPeriod: 345600,
                    VisibilityTimeout: 1800,
                    RedrivePolicy: {
                        maxReceiveCount: 3,
                        deadLetterTargetArn: {
                            'Fn::GetAtt': ['InternalErrorQueue', 'Arn']
                        }
                    }
                }
            });

            // Check Queue Worker
            expect(result.functions.testIntegrationQueueWorker).toEqual(expect.objectContaining({
                handler: 'node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.testIntegration.queueWorker',
                reservedConcurrency: 20,
                events: [{
                    sqs: {
                        arn: {
                            'Fn::GetAtt': ['TestIntegrationQueue', 'Arn']
                        },
                        batchSize: 1,
                        functionResponseType: 'ReportBatchItemFailures'
                    }
                }],
                // Lambda maximum; the queue's VisibilityTimeout stays above it
                timeout: 900
            }));

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

    describe('Handler path adjustments', () => {
        const fs = require('fs');
        const path = require('path');

        it('should keep node_modules handler paths in offline mode', async () => {
            // serverless-offline resolves node_modules from the working
            // directory, so handler paths are no longer rewritten to ../node_modules.
            process.argv = ['node', 'test', 'offline'];

            const result = await composeServerlessDefinition({ integrations: [] });

            expect(result.functions.auth.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/auth.handler'
            );
        });
    });

    describe('NAT Gateway Management', () => {
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

            // VPC (plus the interface endpoints KMS needs from private subnets)
            expect(result.provider.vpc).toBeDefined();
            expect(result.resources.Resources.FriggS3VPCEndpoint).toBeDefined();
            expect(result.resources.Resources.FriggKMSVPCEndpoint).toBeDefined();

            // KMS
            expect(result.provider.environment.KMS_KEY_ARN).toBeDefined();

            // SSM (enabled without offload markers -> broad grant only, no offload env vars)
            const ssmPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toBeDefined();
            expect(result.provider.environment.SSM_PARAMETER_PREFIX).toBeUndefined();

            // Integration
            expect(result.functions.testIntegration).toBeDefined();
            expect(result.resources.Resources.TestIntegrationQueue).toBeDefined();

            // No feature adds a Serverless plugin of its own
            expect(result.plugins).toEqual([
                'serverless-esbuild',
                'serverless-offline-sqs',
                'serverless-offline',
                '@friggframework/serverless-plugin',
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
            expect(result.provider.environment.KMS_KEY_ARN).toBeDefined();

            // SSM should not be present
            const ssmPermission = result.provider.iamRoleStatements.find(
                statement => statement.Action && statement.Action.includes('ssm:GetParameter')
            );
            expect(ssmPermission).toBeUndefined();
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

            // Check default plugins (esbuild replaced serverless-jetpack; env
            // vars come from the app definition, not serverless-dotenv-plugin)
            expect(result.plugins).toEqual([
                'serverless-esbuild',
                'serverless-offline-sqs',
                'serverless-offline',
                '@friggframework/serverless-plugin',
            ]);
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

            expect(result.provider.environment).toEqual(
                expect.objectContaining({
                    STAGE: '${self:provider.stage}',
                    FRIGG_STAGE: '${self:provider.stage}',
                    FRIGG_STACK: '${self:service}',
                    FRIGG_REGION: '${self:provider.region}',
                })
            );
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

    // 'CRITICAL: NAT Gateway MUST be in PUBLIC Subnet' scenarios moved with the
    // NAT logic into VpcBuilder: see domains/networking/vpc-builder.test.js
    // ('NAT Gateway handling': 'should create new NAT when existing is in
    // private subnet', 'should reuse existing elastic IP allocation', ...).

    // The single manually-invoked dbMigrate function was replaced by an async
    // migration pipeline (3bae110e): dbMigrationRouter (HTTP) queues jobs on
    // DbMigrationQueue for dbMigrationWorker. Details: migration-builder.test.js.
    describe('Database Migration Lambda', () => {
        it('should include the migration router and worker in all deployments', async () => {
            const result = await composeServerlessDefinition({ integrations: [] });

            expect(result.functions.dbMigrationRouter.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/db-migration.handler'
            );
            expect(result.functions.dbMigrationWorker.handler).toBe(
                'node_modules/@friggframework/core/handlers/workers/db-migration.handler'
            );
            expect(result.resources.Resources.DbMigrationQueue).toBeDefined();
            expect(result.resources.Resources.FriggMigrationStatusBucket).toBeDefined();
        });

        it('should run migrations one at a time from the queue', async () => {
            const result = await composeServerlessDefinition({ integrations: [] });
            const worker = result.functions.dbMigrationWorker;

            expect(worker.reservedConcurrency).toBe(1);
            expect(worker.timeout).toBe(900);
            expect(worker.events).toEqual([
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['DbMigrationQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ]);
        });

        it('should expose the router under /admin/db-migrate', async () => {
            const result = await composeServerlessDefinition({ integrations: [] });
            const paths = result.functions.dbMigrationRouter.events.map(
                (e) => `${e.httpApi.method} ${e.httpApi.path}`
            );

            expect(paths).toEqual(
                expect.arrayContaining([
                    'POST /admin/db-migrate',
                    'GET /admin/db-migrate/status',
                ])
            );
        });

        it('should include the migration functions with VPC enabled', async () => {
            const result = await composeServerlessDefinition({
                vpc: { enable: true },
                integrations: [],
            });

            expect(result.functions.dbMigrationWorker).toBeDefined();
            expect(result.functions.dbMigrationRouter).toBeDefined();
            expect(result.provider.vpc).toBeDefined();
        });

        it('should omit the migration pipeline when postgres is explicitly disabled', async () => {
            const result = await composeServerlessDefinition({
                database: { postgres: { enable: false }, mongoDB: { enable: true } },
                integrations: [],
            });

            expect(result.functions.dbMigrationWorker).toBeUndefined();
            expect(result.functions.dbMigrationRouter).toBeUndefined();
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

            await expectValidationError(
                appDefinition,
                'Integration at index 0 is missing Definition or name'
            );
        });

        it('should handle integration with missing name', async () => {
            const invalidIntegration = {
                Definition: {}
            };
            const appDefinition = {
                integrations: [invalidIntegration]
            };

            await expectValidationError(
                appDefinition,
                'Integration at index 0 is missing Definition or name'
            );
        });
    });
});

describe('applySsmPreloadNodeOptions', () => {
    const appDefinition = {
        ssm: { enable: true },
        environment: { FOO: 'ssm' },
    };
    const savedSkip = process.env.FRIGG_SKIP_AWS_DISCOVERY;

    beforeEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        if (savedSkip === undefined) {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        } else {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = savedSkip;
        }
    });

    it('sets the preload NODE_OPTIONS on a skipEsbuild function with no existing value', () => {
        const functions = { auth: { skipEsbuild: true } };
        applySsmPreloadNodeOptions(appDefinition, functions);
        expect(functions.auth.environment.NODE_OPTIONS).toBe(
            SSM_PRELOAD_NODE_OPTIONS
        );
    });

    it('appends to an existing function-level NODE_OPTIONS instead of clobbering it', () => {
        const functions = {
            auth: {
                skipEsbuild: true,
                environment: { NODE_OPTIONS: '--enable-source-maps' },
            },
        };
        applySsmPreloadNodeOptions(appDefinition, functions);
        expect(functions.auth.environment.NODE_OPTIONS).toBe(
            `--enable-source-maps ${SSM_PRELOAD_NODE_OPTIONS}`
        );
    });

    it('folds in a provider-level NODE_OPTIONS (which the function env would otherwise shadow)', () => {
        const functions = { auth: { skipEsbuild: true } };
        applySsmPreloadNodeOptions(appDefinition, functions, {
            NODE_OPTIONS: '--require ./otel.js',
        });
        expect(functions.auth.environment.NODE_OPTIONS).toBe(
            `--require ./otel.js ${SSM_PRELOAD_NODE_OPTIONS}`
        );
    });

    it('prefers a function-level value over the provider-level one', () => {
        const functions = {
            auth: {
                skipEsbuild: true,
                environment: { NODE_OPTIONS: '--fn-flag' },
            },
        };
        applySsmPreloadNodeOptions(appDefinition, functions, {
            NODE_OPTIONS: '--provider-flag',
        });
        expect(functions.auth.environment.NODE_OPTIONS).toBe(
            `--fn-flag ${SSM_PRELOAD_NODE_OPTIONS}`
        );
    });

    it('never touches esbuild-bundled functions', () => {
        const functions = {
            websocket: { environment: { NODE_OPTIONS: '--keep-me' } },
        };
        applySsmPreloadNodeOptions(appDefinition, functions, {
            NODE_OPTIONS: '--provider',
        });
        expect(functions.websocket.environment.NODE_OPTIONS).toBe('--keep-me');
    });

    it('is a no-op when offload is inactive', () => {
        const functions = { auth: { skipEsbuild: true } };
        applySsmPreloadNodeOptions(
            { ssm: { enable: true } }, // no offloaded keys → inactive
            functions
        );
        expect(functions.auth.environment).toBeUndefined();
    });
});
