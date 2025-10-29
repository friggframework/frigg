const ResourceDeletionPlanner = require('./resource-deletion-planner');

describe('ResourceDeletionPlanner', () => {
    let planner;

    beforeEach(() => {
        planner = new ResourceDeletionPlanner();
    });

    describe('createDeletionPlan', () => {
        it('should create plan with all deletable resources when no blocking dependencies', () => {
            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
                { physicalId: 'sg-123', resourceType: 'AWS::EC2::SecurityGroup', logicalId: 'FriggSG' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {
                    'subnet-123': { hasBlockingDependencies: false, blocking: [], dependent: [] },
                    'sg-123': { hasBlockingDependencies: false, blocking: [], dependent: [] },
                },
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.totalResources).toBe(2);
            expect(plan.deletableCount).toBe(2);
            expect(plan.blockedCount).toBe(0);
            expect(plan.phases.phase2).toHaveLength(2);
        });

        it('should filter out blocked resources from deletion plan', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: false,
                blockedResources: [
                    {
                        resource: resources[0],
                        blockingDependencies: [{ type: 'subnets', count: 1, ids: ['subnet-456'] }],
                    },
                ],
                dependencies: {
                    'vpc-123': {
                        hasBlockingDependencies: true,
                        blocking: [{ type: 'subnets', count: 1 }],
                        dependent: [],
                    },
                    'subnet-123': { hasBlockingDependencies: false, blocking: [], dependent: [] },
                },
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.totalResources).toBe(2);
            expect(plan.deletableCount).toBe(1);
            expect(plan.blockedCount).toBe(1);
            expect(plan.phases.phase2).toHaveLength(1);
            expect(plan.phases.phase2[0].physicalId).toBe('subnet-123');
            expect(plan.blockedResources).toHaveLength(1);
        });

        it('should organize resources into correct deletion phases', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
                { physicalId: 'vpce-123', resourceType: 'AWS::EC2::VPCEndpoint', logicalId: 'FriggVPCE' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.phases.phase1).toHaveLength(1);
            expect(plan.phases.phase1[0].resourceType).toBe('AWS::EC2::VPCEndpoint');
            expect(plan.phases.phase2).toHaveLength(1);
            expect(plan.phases.phase2[0].resourceType).toBe('AWS::EC2::Subnet');
            expect(plan.phases.phase3).toHaveLength(1);
            expect(plan.phases.phase3[0].resourceType).toBe('AWS::EC2::VPC');
        });

        it('should calculate cost savings for VPC resources', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'vpc-456', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC2' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.costSavings.monthly).toBe(72);
            expect(plan.costSavings.annual).toBe(864);
        });

        it('should calculate cost savings for NAT Gateways', () => {
            const resources = [
                { physicalId: 'nat-123', resourceType: 'AWS::EC2::NatGateway', logicalId: 'FriggNAT' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.costSavings.monthly).toBe(36);
            expect(plan.costSavings.annual).toBe(432);
        });

        it('should calculate cost savings for Elastic IPs', () => {
            const resources = [
                { physicalId: 'eip-123', resourceType: 'AWS::EC2::EIP', logicalId: 'FriggEIP' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.costSavings.monthly).toBeCloseTo(3.65, 2);
        });

        it('should generate standard warnings', () => {
            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.warnings).toContain('This operation cannot be easily undone');
            expect(plan.warnings).toContain('Resources will be permanently deleted from AWS');
            expect(plan.warnings).toContain('Verify no applications depend on these resources');
        });

        it('should add VPC-specific warning when deleting VPCs', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.warnings).toContain(
                'Deleting VPCs will also delete associated default resources'
            );
        });

        it('should add warning when resources are blocked', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: false,
                blockedResources: [
                    {
                        resource: resources[0],
                        blockingDependencies: [{ type: 'subnets', count: 1 }],
                    },
                ],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.warnings).toContain(
                '1 resources cannot be deleted due to dependencies'
            );
        });

        it('should handle empty resource list', () => {
            const resources = [];
            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.totalResources).toBe(0);
            expect(plan.deletableCount).toBe(0);
            expect(plan.blockedCount).toBe(0);
            expect(plan.costSavings.monthly).toBe(0);
        });

        it('should handle mixed resource types with varying costs', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'nat-123', resourceType: 'AWS::EC2::NatGateway', logicalId: 'FriggNAT' },
                { physicalId: 'eip-123', resourceType: 'AWS::EC2::EIP', logicalId: 'FriggEIP' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            const expectedMonthlyCost = 36 + 36 + 3.65;
            expect(plan.costSavings.monthly).toBeCloseTo(expectedMonthlyCost, 2);
            expect(plan.costSavings.annual).toBeCloseTo(expectedMonthlyCost * 12, 2);
        });
    });

    describe('resource counting by type', () => {
        it('should count resources by type in deletion plan', () => {
            const resources = [
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC', logicalId: 'FriggVPC' },
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet1' },
                { physicalId: 'subnet-456', resourceType: 'AWS::EC2::Subnet', logicalId: 'FriggSubnet2' },
                { physicalId: 'sg-123', resourceType: 'AWS::EC2::SecurityGroup', logicalId: 'FriggSG' },
            ];

            const dependencyAnalysis = {
                canDeleteAll: true,
                blockedResources: [],
                dependencies: {},
            };

            const plan = planner.createDeletionPlan({ resources, dependencyAnalysis });

            expect(plan.resourcesByType).toEqual({
                'AWS::EC2::VPC': 1,
                'AWS::EC2::Subnet': 2,
                'AWS::EC2::SecurityGroup': 1,
            });
        });
    });
});
