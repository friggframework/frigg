/**
 * TDD Test for Orphan Detection with Relationship Analysis
 *
 * PROBLEM: When multiple orphaned resources of the same type are detected,
 * we need to help users identify which ones are actually relevant to import.
 *
 * Real-world example from acme-integrations-dev:
 * - 3 orphaned VPCs detected (vpc-0eadd96976d29ede7, vpc-0e2351eac99adcb83, vpc-020a0365610c05f0b)
 * - 10 orphaned subnets detected
 * - 3 orphaned security groups detected
 * - 16 Lambda functions with VPC drift (all reference same VPC/subnets/SGs)
 *
 * ACTUAL AWS REALITY (verified 2025-10-27):
 * - Lambda functions use DEFAULT VPC: vpc-01f21101d4ed6db59 (172.31.0.0/16, no Frigg tags)
 * - Lambda subnets: subnet-020d32e3ca398a041, subnet-0c186318804aba790 (in default VPC)
 * - Lambda security group: sg-0aca40438d17344c4 (in default VPC)
 * - 3 orphaned VPCs are ALL unused (10.0.0.0/16, all have Frigg CFN tags but not in stack)
 * - CloudFormation stack has ZERO VPCs (stack doesn't manage VPC)
 *
 * SOLUTION: Analyze relationships between drifted resources and orphaned resources
 * to identify which orphaned resources are actually being referenced.
 *
 * Key Insight: If 16 Lambda functions are all drifted to use:
 * - VPC: vpc-01f21101d4ed6db59 (default VPC, no tags)
 * - SecurityGroup: sg-0aca40438d17344c4
 * - Subnets: subnet-020d32e3ca398a041, subnet-0c186318804aba790
 *
 * But we detect 3 orphaned VPCs with Frigg tags:
 * - vpc-0eadd96976d29ede7 (10.0.0.0/16)
 * - vpc-0e2351eac99adcb83 (10.0.0.0/16)
 * - vpc-020a0365610c05f0b (10.0.0.0/16)
 *
 * Then NONE of these orphaned VPCs are actually being used! They're old unused
 * resources from previous deployments that should be cleaned up, not imported.
 *
 * RELATIONSHIP ANALYSIS:
 * 1. Extract referenced resource IDs from drift issues
 *    - Lambda VpcConfig.SecurityGroupIds → extract SG IDs
 *    - Lambda VpcConfig.SubnetIds → extract subnet IDs
 *    - Subnets reference VPCs
 *    - Security groups reference VPCs
 *
 * 2. Group orphaned resources by type and count
 *
 * 3. For each orphaned resource:
 *    - Check if it's referenced by any drifted resource
 *    - If yes, mark as "actively used" (high priority to import)
 *    - If no, mark as "unused orphan" (likely old/irrelevant)
 *
 * 4. Add relationship metadata to orphaned resources:
 *    - referencedBy: [list of resources that reference this orphan]
 *    - relatedOrphans: [other orphans in same VPC/group]
 *
 * 5. When multiple resources of same type exist, show warning:
 *    "Multiple VPCs detected. Review relationships before importing."
 */

const AWSResourceDetector = require('../aws-resource-detector');
const StackIdentifier = require('../../../domain/value-objects/stack-identifier');
const Issue = require('../../../domain/entities/issue');
const PropertyMismatch = require('../../../domain/entities/property-mismatch');
const PropertyMutability = require('../../../domain/value-objects/property-mutability');

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

describe('Orphan Detection with Relationship Analysis (TDD)', () => {
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

        // Mock RDS client
        mockRDSSend = jest.fn().mockResolvedValue({ DBClusters: [] });
        const { RDSClient } = require('@aws-sdk/client-rds');
        RDSClient.mockImplementation(() => ({ send: mockRDSSend }));

        // Mock KMS client
        mockKMSSend = jest.fn().mockResolvedValue({ Keys: [] });
        const { KMSClient } = require('@aws-sdk/client-kms');
        KMSClient.mockImplementation(() => ({ send: mockKMSSend }));

        detector = new AWSResourceDetector({ region: 'us-east-1' });
    });

    describe('Real-world scenario: acme-integrations-dev multiple VPCs', () => {
        test('should analyze relationships between drifted Lambdas and orphaned VPC resources', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'acme-integrations-dev',
                region: 'us-east-1',
            });

            // Stack has 16 Lambda functions (all with VPC drift)
            const stackResources = [
                {
                    logicalId: 'AttioFunction',
                    physicalId: 'acme-integrations-dev-attio',
                    resourceType: 'AWS::Lambda::Function',
                },
                {
                    logicalId: 'AuthFunction',
                    physicalId: 'acme-integrations-dev-auth',
                    resourceType: 'AWS::Lambda::Function',
                },
                // ... 14 more Lambda functions
            ];

            // Mock EC2 responses - 3 VPCs, 10 subnets, 3 security groups
            mockEC2Send.mockImplementation((command) => {
                if (command.constructor.name === 'DescribeVpcsCommand') {
                    return Promise.resolve({
                        Vpcs: [
                            {
                                // VPC #1: Old VPC with Frigg tags but not in stack
                                VpcId: 'vpc-0eadd96976d29ede7',
                                CidrBlock: '10.0.0.0/16',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                    { Key: 'Name', Value: 'Old VPC' },
                                ],
                            },
                            {
                                // VPC #2: Another old VPC
                                VpcId: 'vpc-0e2351eac99adcb83',
                                CidrBlock: '10.1.0.0/16',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            {
                                // VPC #3: Current VPC that Lambdas actually use
                                VpcId: 'vpc-020a0365610c05f0b',
                                CidrBlock: '10.2.0.0/16',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                    { Key: 'Name', Value: 'Current VPC' },
                                ],
                            },
                        ],
                    });
                }

                if (command.constructor.name === 'DescribeSubnetsCommand') {
                    return Promise.resolve({
                        Subnets: [
                            // Subnets in VPC #3 (current VPC) - these are the ones Lambdas reference
                            {
                                SubnetId: 'subnet-020d32e3ca398a041',
                                VpcId: 'vpc-020a0365610c05f0b',
                                CidrBlock: '10.2.1.0/24',
                                AvailabilityZone: 'us-east-1a',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            {
                                SubnetId: 'subnet-0c186318804aba790',
                                VpcId: 'vpc-020a0365610c05f0b',
                                CidrBlock: '10.2.2.0/24',
                                AvailabilityZone: 'us-east-1b',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            // Subnets in old VPCs (unused)
                            {
                                SubnetId: 'subnet-0ad31b5ee6814b8fa',
                                VpcId: 'vpc-0eadd96976d29ede7',
                                CidrBlock: '10.0.1.0/24',
                                AvailabilityZone: 'us-east-1a',
                                State: 'available',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            // ... 7 more unused subnets
                        ],
                    });
                }

                if (command.constructor.name === 'DescribeSecurityGroupsCommand') {
                    return Promise.resolve({
                        SecurityGroups: [
                            // SG in current VPC (unused orphan - Lambdas use different SG)
                            {
                                GroupId: 'sg-07c01370e830b6ad6',
                                GroupName: 'default',
                                VpcId: 'vpc-020a0365610c05f0b',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            // SGs in old VPCs (unused)
                            {
                                GroupId: 'sg-03abddb7fb50aeaff',
                                GroupName: 'default',
                                VpcId: 'vpc-0eadd96976d29ede7',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                            {
                                GroupId: 'sg-027f44ad46727df93',
                                GroupName: 'default',
                                VpcId: 'vpc-0e2351eac99adcb83',
                                Tags: [
                                    {
                                        Key: 'aws:cloudformation:stack-name',
                                        Value: 'acme-integrations-dev',
                                    },
                                ],
                            },
                        ],
                    });
                }

                return Promise.resolve({});
            });

            // Drift issues: Lambda functions reference subnets in current VPC
            const driftIssues = [
                Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'acme-integrations-dev-attio',
                    mismatch: new PropertyMismatch({
                        propertyPath: 'VpcConfig.SubnetIds',
                        expectedValue: 'subnet-00ab9e0502e66aac3,subnet-00d085a52937aaf91',
                        actualValue: 'subnet-020d32e3ca398a041,subnet-0c186318804aba790', // ← References current VPC subnets
                        mutability: PropertyMutability.MUTABLE,
                    }),
                }),
                Issue.propertyMismatch({
                    resourceType: 'AWS::Lambda::Function',
                    resourceId: 'acme-integrations-dev-auth',
                    mismatch: new PropertyMismatch({
                        propertyPath: 'VpcConfig.SubnetIds',
                        expectedValue: 'subnet-00ab9e0502e66aac3,subnet-00d085a52937aaf91',
                        actualValue: 'subnet-020d32e3ca398a041,subnet-0c186318804aba790', // ← Same subnets
                        mutability: PropertyMutability.MUTABLE,
                    }),
                }),
                // ... 14 more Lambda functions with same subnet drift
            ];

            // Act
            const orphans = await detector.findOrphanedResourcesWithRelationships({
                stackIdentifier,
                stackResources,
                driftIssues,
            });

            // Assert: Should identify relationship metadata
            expect(orphans.length).toBeGreaterThan(0);

            // Find the orphaned subnets that are actually referenced
            const referencedSubnets = orphans.filter(
                (o) =>
                    o.resourceType === 'AWS::EC2::Subnet' &&
                    (o.physicalId === 'subnet-020d32e3ca398a041' ||
                        o.physicalId === 'subnet-0c186318804aba790')
            );

            // These subnets should be marked as "actively used"
            for (const subnet of referencedSubnets) {
                expect(subnet.metadata).toHaveProperty('referencedBy');
                expect(subnet.metadata.referencedBy.length).toBeGreaterThan(0);
                expect(subnet.metadata.isActivelyUsed).toBe(true);
            }

            // Find the VPC that contains these subnets
            const currentVpc = orphans.find((o) => o.physicalId === 'vpc-020a0365610c05f0b');

            if (currentVpc) {
                expect(currentVpc.metadata).toHaveProperty('containsReferencedResources');
                expect(currentVpc.metadata.containsReferencedResources).toBe(true);
            }

            // Old VPCs should NOT be marked as actively used
            const oldVpc1 = orphans.find((o) => o.physicalId === 'vpc-0eadd96976d29ede7');
            if (oldVpc1) {
                expect(oldVpc1.metadata?.isActivelyUsed).toBeFalsy();
            }
        });

        test('should flag multiple resources of same type for manual review', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'acme-integrations-dev',
                region: 'us-east-1',
            });

            const stackResources = [
                {
                    logicalId: 'MyLambda',
                    physicalId: 'my-lambda',
                    resourceType: 'AWS::Lambda::Function',
                },
            ];

            // Mock 3 orphaned VPCs
            mockEC2Send.mockResolvedValue({
                Vpcs: [
                    {
                        VpcId: 'vpc-1',
                        CidrBlock: '10.0.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'acme-integrations-dev' }],
                    },
                    {
                        VpcId: 'vpc-2',
                        CidrBlock: '10.1.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'acme-integrations-dev' }],
                    },
                    {
                        VpcId: 'vpc-3',
                        CidrBlock: '10.2.0.0/16',
                        State: 'available',
                        Tags: [{ Key: 'aws:cloudformation:stack-name', Value: 'acme-integrations-dev' }],
                    },
                ],
            });

            const result = await detector.findOrphanedResourcesWithRelationships({
                stackIdentifier,
                stackResources,
                driftIssues: [],
            });

            // Should include warning metadata
            const summary = detector.analyzeOrphanSummary(result);

            expect(summary.warnings).toContain(
                'Multiple VPCs detected (3). Review relationships before importing.'
            );
            expect(summary.multipleResourceTypes).toContain('AWS::EC2::VPC');
        });
    });

    describe('Helper method: extractReferencedResourceIds', () => {
        test('should extract subnet IDs from VpcConfig.SubnetIds drift', () => {
            const driftIssue = Issue.propertyMismatch({
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-lambda',
                mismatch: new PropertyMismatch({
                    propertyPath: 'VpcConfig.SubnetIds',
                    expectedValue: 'subnet-old-1,subnet-old-2',
                    actualValue: 'subnet-020d32e3ca398a041,subnet-0c186318804aba790',
                    mutability: PropertyMutability.MUTABLE,
                }),
            });

            const detector = new AWSResourceDetector({ region: 'us-east-1' });
            const referenced = detector._extractReferencedResourceIds([driftIssue]);

            expect(referenced.subnetIds).toContain('subnet-020d32e3ca398a041');
            expect(referenced.subnetIds).toContain('subnet-0c186318804aba790');
        });

        test('should extract security group IDs from VpcConfig.SecurityGroupIds drift', () => {
            const driftIssue = Issue.propertyMismatch({
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-lambda',
                mismatch: new PropertyMismatch({
                    propertyPath: 'VpcConfig.SecurityGroupIds',
                    expectedValue: 'sg-old',
                    actualValue: 'sg-0aca40438d17344c4',
                    mutability: PropertyMutability.MUTABLE,
                }),
            });

            const detector = new AWSResourceDetector({ region: 'us-east-1' });
            const referenced = detector._extractReferencedResourceIds([driftIssue]);

            expect(referenced.securityGroupIds).toContain('sg-0aca40438d17344c4');
        });
    });
});
