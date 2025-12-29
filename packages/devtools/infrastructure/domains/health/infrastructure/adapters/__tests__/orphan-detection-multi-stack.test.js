/**
 * TDD Test for Orphan Detection with Multiple Stacks
 *
 * Bug: findOrphanedResources marks ALL resources in region as orphaned,
 * including resources from other CloudFormation stacks and default AWS resources.
 *
 * Expected Behavior:
 * - Only detect resources with frigg:stack tag matching target stack
 * - Exclude resources managed by CloudFormation (aws:cloudformation:stack-name tag)
 * - Exclude default AWS resources (default VPC, AWS-managed KMS keys)
 * - Only check resource types that exist in stack template
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

jest.mock('@aws-sdk/client-cloudformation', () => ({
    CloudFormationClient: jest.fn(),
    DescribeStackResourcesCommand: jest.fn(),
}));

describe('Orphan Detection with Multiple Stacks (TDD)', () => {
    let detector;
    let mockEC2Send;
    let mockRDSSend;
    let mockKMSSend;
    let mockCFSend;

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

        // Mock CloudFormation client
        mockCFSend = jest.fn();
        const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
        CloudFormationClient.mockImplementation(() => ({ send: mockCFSend }));

        detector = new AWSResourceDetector({ region: 'us-east-1' });
    });

    describe('Scenario: Multiple stacks and default resources in same region', () => {
        test('should only detect orphans with frigg:stack tag matching target stack', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'quo-integrations-dev',
                region: 'us-east-1',
            });

            // Stack resources from CloudFormation (what's in the template)
            const stackResources = [
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-stack-managed',
                    resourceType: 'AWS::EC2::VPC',
                },
                {
                    logicalId: 'MyDBCluster',
                    physicalId: 'dev-cluster',
                    resourceType: 'AWS::RDS::DBCluster',
                },
            ];

            // Mock CloudFormation stack resources
            mockCFSend.mockResolvedValue({
                StackResources: [
                    {
                        LogicalResourceId: 'MyVPC',
                        PhysicalResourceId: 'vpc-stack-managed',
                        ResourceType: 'AWS::EC2::VPC',
                    },
                    {
                        LogicalResourceId: 'MyDBCluster',
                        PhysicalResourceId: 'dev-cluster',
                        ResourceType: 'AWS::RDS::DBCluster',
                    },
                ],
            });

            // Mock EC2 DescribeVpcs - returns 5 VPCs in region
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        // VPC #1: Managed by CloudFormation for this stack - NOT orphaned
                        VpcId: 'vpc-stack-managed',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'quo-integrations-dev' },
                            { Key: 'frigg:stack', Value: 'quo-integrations-dev' },
                        ],
                    },
                    {
                        // VPC #2: Has frigg:stack tag but not in CloudFormation - IS ORPHANED
                        VpcId: 'vpc-orphan',
                        CidrBlock: '10.1.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'frigg:stack', Value: 'quo-integrations-dev' },
                            // No aws:cloudformation:stack-name tag = orphan
                        ],
                    },
                    {
                        // VPC #3: Managed by DIFFERENT CloudFormation stack - NOT orphaned
                        VpcId: 'vpc-other-stack',
                        CidrBlock: '10.2.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'quo-integrations-prod' },
                            { Key: 'frigg:stack', Value: 'quo-integrations-prod' },
                        ],
                    },
                    {
                        // VPC #4: Default VPC (no tags) - NOT orphaned
                        VpcId: 'vpc-default',
                        CidrBlock: '172.31.0.0/16',
                        State: 'available',
                        IsDefault: true,
                        Tags: [],
                    },
                    {
                        // VPC #5: Random VPC with no frigg tags - NOT orphaned
                        VpcId: 'vpc-unrelated',
                        CidrBlock: '192.168.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'Team', Value: 'platform' }],
                    },
                ],
            });

            // Mock RDS DescribeDBClusters - returns 2 clusters in region
            mockRDSSend.mockResolvedValue({
                DBClusters: [
                    {
                        // Cluster #1: Managed by CloudFormation for this stack - NOT orphaned
                        DBClusterIdentifier: 'dev-cluster',
                        Engine: 'aurora-postgresql',
                        Status: 'available',
                        ClusterCreateTime: new Date('2024-01-01'),
                        TagList: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'quo-integrations-dev' },
                            { Key: 'frigg:stack', Value: 'quo-integrations-dev' },
                        ],
                    },
                    {
                        // Cluster #2: From different stack - NOT orphaned (wrong frigg:stack tag)
                        DBClusterIdentifier: 'prod-cluster',
                        Engine: 'aurora-postgresql',
                        Status: 'available',
                        ClusterCreateTime: new Date('2024-01-01'),
                        TagList: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'quo-integrations-prod' },
                            { Key: 'frigg:stack', Value: 'quo-integrations-prod' },
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
            // Should ONLY find vpc-orphan (has frigg:stack=quo-integrations-dev but no CloudFormation tag)
            expect(orphans).toHaveLength(1);
            expect(orphans[0].physicalId).toBe('vpc-orphan');
            expect(orphans[0].resourceType).toBe('AWS::EC2::VPC');

            // Should NOT include:
            // - vpc-stack-managed (managed by CloudFormation)
            // - vpc-other-stack (different stack)
            // - vpc-default (no frigg tag)
            // - vpc-unrelated (no frigg tag)
            // - dev-cluster (managed by CloudFormation)
            // - prod-cluster (different stack)
        });

        test('should handle case where stack has no orphans', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'perfect-stack',
                region: 'us-east-1',
            });

            const stackResources = [
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-perfect',
                    resourceType: 'AWS::EC2::VPC',
                },
            ];

            mockCFSend.mockResolvedValue({
                StackResources: [
                    {
                        LogicalResourceId: 'MyVPC',
                        PhysicalResourceId: 'vpc-perfect',
                        ResourceType: 'AWS::EC2::VPC',
                    },
                ],
            });

            // All VPCs are either CloudFormation-managed or belong to other stacks
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-perfect',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [
                            { Key: 'aws:cloudformation:stack-name', Value: 'perfect-stack' },
                            { Key: 'frigg:stack', Value: 'perfect-stack' },
                        ],
                    },
                    {
                        VpcId: 'vpc-other',
                        CidrBlock: '10.1.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'frigg:stack', Value: 'other-stack' }],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should find NO orphans
            expect(orphans).toEqual([]);
        });

        test('should check all supported resource types for orphans (not just types in stack)', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'simple-stack',
                region: 'us-east-1',
            });

            // Stack only has VPC resources - no RDS, no KMS
            const stackResources = [
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-simple',
                    resourceType: 'AWS::EC2::VPC',
                },
            ];

            mockCFSend.mockResolvedValue({
                StackResources: [
                    {
                        LogicalResourceId: 'MyVPC',
                        PhysicalResourceId: 'vpc-simple',
                        ResourceType: 'AWS::EC2::VPC',
                    },
                ],
            });

            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-simple',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'simple-stack' }],
                    },
                ],
            });

            await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should check ALL resource types (EC2, RDS, KMS) even if stack only has VPC
            // This is because orphaned resources by definition are NOT in the stack
            expect(mockEC2Send).toHaveBeenCalled();
            expect(mockRDSSend).toHaveBeenCalled(); // Changed: now checks all types
            expect(mockKMSSend).toHaveBeenCalled(); // Changed: now checks all types
        });

        test('should filter out default VPCs', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'my-stack',
                region: 'us-east-1',
            });

            const stackResources = [
                {
                    logicalId: 'MyVPC',
                    physicalId: 'vpc-custom',
                    resourceType: 'AWS::EC2::VPC',
                },
            ];

            mockCFSend.mockResolvedValue({
                StackResources: [
                    {
                        LogicalResourceId: 'MyVPC',
                        PhysicalResourceId: 'vpc-custom',
                        ResourceType: 'AWS::EC2::VPC',
                    },
                ],
            });

            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-custom',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'my-stack' }],
                    },
                    {
                        // Default VPC - should be filtered out even with frigg tag
                        VpcId: 'vpc-default',
                        CidrBlock: '172.31.0.0/16',
                        State: 'available',
                        IsDefault: true,
                        Tags: [{ Key: 'frigg:stack', Value: 'my-stack' }],
                    },
                ],
            });

            const orphans = await detector.findOrphanedResources({
                stackIdentifier,
                stackResources,
            });

            // Should NOT include default VPC
            expect(orphans).toEqual([]);
        });
    });
});
