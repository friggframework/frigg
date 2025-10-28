/**
 * Tests for AWS Provider Adapter
 * 
 * Tests AWS-specific cloud resource discovery
 */

const { AWSProviderAdapter } = require('./aws-provider-adapter');

// Mock AWS SDK v3 clients
jest.mock('@aws-sdk/client-ec2');
jest.mock('@aws-sdk/client-kms');
jest.mock('@aws-sdk/client-rds');
jest.mock('@aws-sdk/client-ssm');
jest.mock('@aws-sdk/client-secrets-manager');

describe('AWSProviderAdapter', () => {
    let provider;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AWS_REGION;
    });

    describe('constructor()', () => {
        it('should initialize with provided region', () => {
            provider = new AWSProviderAdapter('eu-west-1');

            expect(provider.region).toBe('eu-west-1');
        });

        it('should default to us-east-1 if no region provided', () => {
            provider = new AWSProviderAdapter();

            expect(provider.region).toBe('us-east-1');
        });

        it('should use AWS_REGION environment variable', () => {
            process.env.AWS_REGION = 'ap-southeast-1';
            provider = new AWSProviderAdapter();

            expect(provider.region).toBe('ap-southeast-1');
        });

        it('should prefer provided region over environment variable', () => {
            process.env.AWS_REGION = 'us-west-2';
            provider = new AWSProviderAdapter('eu-central-1');

            expect(provider.region).toBe('eu-central-1');
        });

        it('should store credentials if provided', () => {
            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            };

            provider = new AWSProviderAdapter('us-east-1', credentials);

            expect(provider.credentials).toEqual(credentials);
        });

        it('should lazy-load clients (not instantiated on construction)', () => {
            provider = new AWSProviderAdapter('us-east-1');

            expect(provider.ec2).toBeNull();
            expect(provider.kms).toBeNull();
            expect(provider.rds).toBeNull();
            expect(provider.ssm).toBeNull();
            expect(provider.secretsManager).toBeNull();
        });
    });

    describe('getName()', () => {
        it('should return "aws"', () => {
            provider = new AWSProviderAdapter();

            expect(provider.getName()).toBe('aws');
        });
    });

    describe('getSupportedRegions()', () => {
        it('should return array of AWS regions', () => {
            provider = new AWSProviderAdapter();

            const regions = provider.getSupportedRegions();

            expect(Array.isArray(regions)).toBe(true);
            expect(regions.length).toBeGreaterThan(0);
        });

        it('should include common US regions', () => {
            provider = new AWSProviderAdapter();

            const regions = provider.getSupportedRegions();

            expect(regions).toContain('us-east-1');
            expect(regions).toContain('us-east-2');
            expect(regions).toContain('us-west-1');
            expect(regions).toContain('us-west-2');
        });

        it('should include common EU regions', () => {
            provider = new AWSProviderAdapter();

            const regions = provider.getSupportedRegions();

            expect(regions).toContain('eu-west-1');
            expect(regions).toContain('eu-central-1');
        });

        it('should include common APAC regions', () => {
            provider = new AWSProviderAdapter();

            const regions = provider.getSupportedRegions();

            expect(regions).toContain('ap-southeast-1');
            expect(regions).toContain('ap-northeast-1');
        });
    });

    describe('Lazy loading clients', () => {
        beforeEach(() => {
            provider = new AWSProviderAdapter('us-east-1');
        });

        it('should lazy-load EC2 client', () => {
            expect(provider.ec2).toBeNull();

            const client = provider.getEC2Client();

            expect(provider.ec2).not.toBeNull();
            expect(client).toBe(provider.ec2);
        });

        it('should lazy-load KMS client', () => {
            expect(provider.kms).toBeNull();

            const client = provider.getKMSClient();

            expect(provider.kms).not.toBeNull();
            expect(client).toBe(provider.kms);
        });

        it('should lazy-load RDS client', () => {
            expect(provider.rds).toBeNull();

            const client = provider.getRDSClient();

            expect(provider.rds).not.toBeNull();
            expect(client).toBe(provider.rds);
        });

        it('should lazy-load SSM client', () => {
            expect(provider.ssm).toBeNull();

            const client = provider.getSSMClient();

            expect(provider.ssm).not.toBeNull();
            expect(client).toBe(provider.ssm);
        });

        it('should lazy-load Secrets Manager client', () => {
            expect(provider.secretsManager).toBeNull();

            const client = provider.getSecretsManagerClient();

            expect(provider.secretsManager).not.toBeNull();
            expect(client).toBe(provider.secretsManager);
        });

        it('should lazy-load CloudFormation client', () => {
            expect(provider.cloudformation).toBeNull();

            const client = provider.getCloudFormationClient();

            expect(provider.cloudformation).not.toBeNull();
            expect(client).toBe(provider.cloudformation);
        });

        it('should reuse client on subsequent calls', () => {
            const client1 = provider.getEC2Client();
            const client2 = provider.getEC2Client();

            expect(client1).toBe(client2);
        });
    });

    describe('discoverVpc()', () => {
        beforeEach(() => {
            provider = new AWSProviderAdapter('us-east-1');
            const { EC2Client } = require('@aws-sdk/client-ec2');
            EC2Client.mockImplementation(() => ({
                send: jest.fn(),
            }));
        });

        it('should return VPC discovery results', async () => {
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ // VPCs
                    Vpcs: [
                        { VpcId: 'vpc-123', CidrBlock: '172.31.0.0/16' },
                    ],
                })
                .mockResolvedValueOnce({ Subnets: [] }) // Subnets
                .mockResolvedValueOnce({ SecurityGroups: [] }) // Security Groups
                .mockResolvedValueOnce({ RouteTables: [] }) // Route Tables
                .mockResolvedValueOnce({ NatGateways: [] }) // NAT Gateways
                .mockResolvedValueOnce({ InternetGateways: [] }) // Internet Gateways
                .mockResolvedValueOnce({ VpcEndpoints: [] }); // VPC Endpoints

            provider.getEC2Client = jest.fn().mockReturnValue({ send: mockSend });

            const result = await provider.discoverVpc({});

            expect(result.vpcId).toBe('vpc-123');
            expect(result.vpcCidr).toBe('172.31.0.0/16');
        });

        it('should handle discovery errors', async () => {
            provider.getEC2Client = jest.fn().mockReturnValue({
                send: jest.fn().mockRejectedValue(new Error('EC2 API Error')),
            });

            await expect(provider.discoverVpc({})).rejects.toThrow('Failed to discover AWS VPC');
        });

        it('should discover default VPC when no vpcId specified', async () => {
            const mockSend = jest.fn();
            provider.getEC2Client = jest.fn().mockReturnValue({ send: mockSend });

            await provider.discoverVpc({}).catch(() => { });

            // First call should filter for default VPC
            expect(mockSend).toHaveBeenCalled();
        });
    });

    describe('discoverKmsKeys()', () => {
        beforeEach(() => {
            provider = new AWSProviderAdapter('us-east-1');
            const { KMSClient } = require('@aws-sdk/client-kms');
            KMSClient.mockImplementation(() => ({
                send: jest.fn(),
            }));
        });

        it('should return KMS discovery results', async () => {
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ // ListKeys
                    Keys: [{ KeyId: 'key-123' }],
                })
                .mockResolvedValueOnce({ // DescribeKey
                    KeyMetadata: {
                        KeyId: 'key-123',
                        Arn: 'arn:aws:kms:us-east-1:123:key/abc',
                        Enabled: true,
                    },
                })
                .mockResolvedValueOnce({ // ListAliases
                    Aliases: [
                        { AliasName: 'alias/my-key', TargetKeyId: 'key-123' },
                    ],
                });

            provider.getKMSClient = jest.fn().mockReturnValue({ send: mockSend });

            const result = await provider.discoverKmsKeys({});

            expect(result.keys.length).toBeGreaterThan(0);
            expect(result.defaultKey).toBeDefined();
        });

        it('should handle discovery errors', async () => {
            provider.getKMSClient = jest.fn().mockReturnValue({
                send: jest.fn().mockRejectedValue(new Error('KMS API Error')),
            });

            await expect(provider.discoverKmsKeys({})).rejects.toThrow('Failed to discover AWS KMS keys');
        });
    });

    describe('discoverDatabase()', () => {
        beforeEach(() => {
            provider = new AWSProviderAdapter('us-east-1');
            const { RDSClient } = require('@aws-sdk/client-rds');
            RDSClient.mockImplementation(() => ({
                send: jest.fn(),
            }));
        });

        it('should return database discovery results', async () => {
            const mockSend = jest.fn()
                .mockResolvedValueOnce({ // Clusters
                    DBClusters: [
                        {
                            DBClusterIdentifier: 'cluster-1',
                            Endpoint: 'cluster-1.example.com',
                            Port: 5432,
                            Engine: 'aurora-postgresql',
                        },
                    ],
                })
                .mockResolvedValueOnce({ DBInstances: [] }); // Instances

            provider.getRDSClient = jest.fn().mockReturnValue({ send: mockSend });

            const result = await provider.discoverDatabase({});

            expect(result.endpoint).toBe('cluster-1.example.com');
            expect(result.port).toBe(5432);
            expect(result.engine).toBe('aurora-postgresql');
        });

        it('should handle discovery errors', async () => {
            provider.getRDSClient = jest.fn().mockReturnValue({
                send: jest.fn().mockRejectedValue(new Error('RDS API Error')),
            });

            await expect(provider.discoverDatabase({})).rejects.toThrow('Failed to discover AWS databases');
        });
    });

    describe('discoverParameters()', () => {
        beforeEach(() => {
            provider = new AWSProviderAdapter('us-east-1');
        });

        it('should return parameter discovery results', async () => {
            const mockSSMSend = jest.fn().mockResolvedValue({
                Parameters: [
                    { Name: '/my-app/api-key', Value: 'encrypted' },
                ],
            });

            const mockSMSend = jest.fn().mockResolvedValue({
                SecretList: [
                    { Name: 'my-app/secret', ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:my-app/secret' },
                ],
            });

            provider.getSSMClient = jest.fn().mockReturnValue({ send: mockSSMSend });
            provider.getSecretsManagerClient = jest.fn().mockReturnValue({ send: mockSMSend });

            const result = await provider.discoverParameters({
                parameterPath: '/my-app',
                includeSecrets: true,
            });

            expect(result.parameters).toHaveLength(1);
            expect(result.secrets).toHaveLength(1);
        });

        it('should handle discovery errors', async () => {
            provider.getSSMClient = jest.fn().mockReturnValue({
                send: jest.fn().mockRejectedValue(new Error('SSM API Error')),
            });

            await expect(provider.discoverParameters({ parameterPath: '/test' })).rejects.toThrow('Failed to discover AWS parameters');
        });

        it('should skip secrets when includeSecrets is false', async () => {
            const mockSSMSend = jest.fn().mockResolvedValue({ Parameters: [] });

            provider.getSSMClient = jest.fn().mockReturnValue({ send: mockSSMSend });

            const result = await provider.discoverParameters({
                includeSecrets: false,
            });

            expect(result.parameters).toEqual([]);
            expect(result.secrets).toEqual([]);
            // Behavior-based test: secrets should be empty when includeSecrets is false
            // (Implementation detail: getSecretsManagerClient shouldn't be called)
        });
    });
});

