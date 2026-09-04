/**
 * TDD Test for Orphan Detection with CloudFormation Tags
 *
 * BUG DISCOVERED: Resources can have aws:cloudformation:stack-name tags
 * but NOT actually be in the CloudFormation stack. This happens when:
 * 1. Resources are manually created and tagged with CloudFormation tags
 * 2. Resources are removed from stack but tags remain
 * 3. Resources are imported but import fails/reverts
 *
 * Real-world example from quo-integrations-dev:
 * - 2 VPCs both tagged with aws:cloudformation:stack-name=quo-integrations-dev
 * - CloudFormation stack has 0 VPCs in it (verified via DescribeStackResources)
 * - Both VPCs are orphans despite having CloudFormation tags
 *
 * SOLUTION: Don't trust CloudFormation tags. Instead:
 * 1. Get actual stack resources from CloudFormation (we already have this!)
 * 2. Build Set of physical IDs that are IN the stack
 * 3. Compare discovered resources against this Set
 * 4. If resource has CFN tag but physical ID not in Set = ORPHAN
 */

const AWSResourceDetector = require('../aws-resource-detector');
const StackIdentifier = require('../../../domain/value-objects/stack-identifier');

// Mock AWS SDK
jest.mock('@aws-sdk/client-ec2', () => ({
    EC2Client: jest.fn(),
    DescribeVpcsCommand: jest.fn(),
    DescribeSubnetsCommand: jest.fn(),
    DescribeSecurityGroupsCommand: jest.fn(),
    DescribeRouteTablesCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-rds', () => ({
    RDSClient: jest.fn(),
    DescribeDBClustersCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-kms', () => ({
    KMSClient: jest.fn(),
    ListKeysCommand: jest.fn(),
    DescribeKeyCommand: jest.fn(),
    ListAliasesCommand: jest.fn(),
}));

describe('Orphan Detection with CloudFormation-Tagged Resources (TDD)', () => {
    let detector;
    let mockEC2Send;
    let mockRDSSend;
    let mockKMSSend;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock EC2 client
        mockEC2Send = jest.fn();
        const { EC2Client } = require('@aws-sdk/client-ec2');
        EC2Client.mockImplementation(() => ({ send: mockEC2Send }));

        // Mock RDS client - return empty arrays by default
        mockRDSSend = jest.fn().mockResolvedValue({ DBClusters: [] });
        const { RDSClient } = require('@aws-sdk/client-rds');
        RDSClient.mockImplementation(() => ({ send: mockRDSSend }));

        // Mock KMS client - return empty arrays by default
        mockKMSSend = jest.fn().mockResolvedValue({ Keys: [] });
        const { KMSClient } = require('@aws-sdk/client-kms');
        KMSClient.mockImplementation(() => ({ send: mockKMSSend }));

        detector = new AWSResourceDetector({ region: 'us-east-1' });
    });

    describe('Bug: Resources with CloudFormation tags but not in stack', () => {
        test('should detect VPCs with CloudFormation tags that are NOT in the actual stack', async () => {
            // Real-world scenario from quo-integrations-dev
            const stackIdentifier = new StackIdentifier({
                stackName: 'quo-integrations-dev',
                region: 'us-east-1',
            });

            // CloudFormation stack has 0 VPCs (stack uses existing VPC, doesn't manage it)
            const stackResources = [
                {
                    logicalId: 'MyLambda',
                    physicalId: 'quo-integrations-dev-lambda',
                    resourceType: 'AWS::Lambda::Function',
                },
                // NO VPCs in the stack!
            ];

            // Mock EC2 returns 2 VPCs both with CloudFormation tags
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        // VPC #1: Has CloudFormation tag for this stack BUT not in stack = ORPHAN
                        VpcId: 'vpc-0eadd96976d29ede7',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        IsDefault: false,
                        Tags: [
                            {
                                Key: 'aws:cloudformation:stack-name',
                                Value: 'quo-integrations-dev',
                            },
                            { Key: 'aws:cloudformation:stack-id', Value: 'arn:aws:cloudformation:...' },
                            { Key: 'aws:cloudformation:logical-id', Value: 'FriggVPC' },
                            { Key: 'Name', Value: 'quo-integrations-dev-vpc' },
                            { Key: 'ManagedBy', Value: 'Frigg' },
                        ],
                    },
                    {
                        // VPC #2: Has CloudFormation tag for this stack BUT not in stack = ORPHAN
                        VpcId: 'vpc-0e2351eac99adcb83',
                        CidrBlock: '10.1.0.0/16',
                        State: 'available',
                        IsDefault: false,
                        Tags: [
                            {
                                Key: 'aws:cloudformation:stack-name',
                                Value: 'quo-integrations-dev',
                            },
                            { Key: 'aws:cloudformation:stack-id', Value: 'arn:aws:cloudformation:...' },
                            { Key: 'aws:cloudformation:logical-id', Value: 'FriggVPC' },
                            { Key: 'Name', Value: 'quo-integrations-dev-vpc' },
                            { Key: 'ManagedBy', Value: 'Frigg' },
                        ],
                    },
                    {
                        // VPC #3: From different stack - NOT orphaned
                        VpcId: 'vpc-other-stack',
                        CidrBlock: '10.2.0.0/16',
                        State: 'available',
                        Tags: [
                            {
                                Key: 'aws:cloudformation:stack-name',
                                Value: 'quo-integrations-prod',
                            },
                        ],
                    },
                ],
            });

            // Act
            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Assert
            // Should find BOTH VPCs as orphans despite having CloudFormation tags
            expect(orphans).toHaveLength(2);

            // Both orphaned VPCs should be identified
            const orphanIds = orphans.map((o) => o.physicalId).sort();
            expect(orphanIds).toEqual(['vpc-0e2351eac99adcb83', 'vpc-0eadd96976d29ede7']);

            // Each orphan should have proper reason
            for (const orphan of orphans) {
                expect(orphan.isOrphaned).toBe(true);
                expect(orphan.reason).toContain(
                    'has CloudFormation tag for stack quo-integrations-dev but is not actually managed by the stack'
                );
            }
        });

        test('should NOT flag resources that are actually in the stack even with CloudFormation tags', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            // Stack HAS a VPC in CloudFormation
            const stackResources = [
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-in-stack',
                    resourceType: 'AWS::EC2::VPC',
                },
            ];

            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        // VPC is in the stack AND has CloudFormation tag - NOT orphaned
                        VpcId: 'vpc-in-stack',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'my-app-prod' },
                        ],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should find NO orphans - VPC is actually in the stack
            expect(orphans).toEqual([]);
        });

        test('should detect mixed scenario: some resources in stack, some orphaned with same tags', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            // Stack has 2 subnets
            const stackResources = [
                {
                    logicalId: 'Subnet1',
                    physicalId: 'subnet-in-stack-1',
                    resourceType: 'AWS::EC2::Subnet',
                },
                {
                    logicalId: 'Subnet2',
                    physicalId: 'subnet-in-stack-2',
                    resourceType: 'AWS::EC2::Subnet',
                },
            ];

            mockEC2Send.mockResolvedValue({
                Subnets: [
                    {
                        // Subnet #1: In stack - NOT orphaned
                        SubnetId: 'subnet-in-stack-1',
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.1.0/24',
                        AvailabilityZone: 'us-east-1a',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'test-stack' },
                        ],
                    },
                    {
                        // Subnet #2: In stack - NOT orphaned
                        SubnetId: 'subnet-in-stack-2',
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.2.0/24',
                        AvailabilityZone: 'us-east-1b',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'test-stack' },
                        ],
                    },
                    {
                        // Subnet #3: Has CloudFormation tag BUT not in stack - IS ORPHANED
                        SubnetId: 'subnet-orphan',
                        VpcId: 'vpc-123',
                        CidrBlock: '10.0.3.0/24',
                        AvailabilityZone: 'us-east-1c',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'test-stack' },
                            { Key: 'Note', Value: 'Manually created and tagged' },
                        ],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should find 1 orphan (subnet-orphan)
            expect(orphans).toHaveLength(1);
            expect(orphans[0].physicalId).toBe('subnet-orphan');
        });

        test('should handle stack with no resources of checked types', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'lambda-only-stack',
                region: 'us-east-1',
            });

            // Stack only has Lambda functions (no VPCs, no subnets)
            const stackResources = [
                {
                    logicalId: 'MyFunction',
                    physicalId: 'my-function',
                    resourceType: 'AWS::Lambda::Function',
                },
            ];

            // Region has VPCs with CloudFormation tags for this stack
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-orphan',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'lambda-only-stack' },
                        ],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should find 1 orphan VPC (stack doesn't manage any VPCs)
            expect(orphans).toHaveLength(1);
            expect(orphans[0].physicalId).toBe('vpc-orphan');
        });
    });
});
