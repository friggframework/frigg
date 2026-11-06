# Specification: Cleanup Command for Orphaned Resources

**Version**: 1.0.0
**Status**: Draft
**Created**: 2025-10-27
**Author**: Claude Code (following user requirements)

## Overview

Create a new `frigg cleanup --orphaned` command to safely delete duplicate orphaned resources that are not part of the current CloudFormation stack template. This command helps users clean up leftover resources from previous deployments or failed stacks.

## Business Context

### Problem Statement

After implementing logical ID mapping and deduplication for `frigg repair --import`, we discovered that many stacks have duplicate orphaned resources:

- Resources with CloudFormation tags (indicating they were once managed)
- NOT referenced in the current build template (indicating they're no longer needed)
- Example: 3 VPCs all tagged `FriggVPC`, but only 1 is in the current template

These duplicate resources:
- Cost money (especially VPCs, NAT Gateways, Elastic IPs)
- Clutter AWS accounts
- Cause confusion during troubleshooting
- Are potential security risks (orphaned security groups with open rules)

### User Story

> As a DevOps engineer managing Frigg applications
> I want to safely delete duplicate orphaned resources
> So that I can reduce costs, improve account hygiene, and eliminate security risks
> While avoiding accidental deletion of resources that are still in use

### Real-World Example

From `quo-integrations-dev` stack:
- **16 orphaned resources detected**
- **5 will be imported** (in build template)
- **11 are duplicates** that should be cleaned up:
  - 2 extra VPCs ($36/month each for NAT Gateway)
  - 7 extra Subnets ($0 but clutter)
  - 2 extra SecurityGroups (potential security risk)

**Estimated monthly savings**: ~$72 for just the NAT Gateways

## Requirements

### Functional Requirements

#### FR-1: Command Interface

```bash
# Dry-run mode (default) - show what would be deleted
frigg cleanup --orphaned
frigg cleanup --orphaned --dry-run

# Execute deletion
frigg cleanup --orphaned --execute

# Target specific stack
frigg cleanup --orphaned --stack quo-integrations-dev --execute

# Auto-confirm (skip confirmation prompts)
frigg cleanup --orphaned --execute --yes

# Clean up specific resource types only
frigg cleanup --orphaned --resource-type AWS::EC2::VPC --execute
frigg cleanup --orphaned --resource-type AWS::EC2::Subnet --execute

# Filter by logical ID pattern
frigg cleanup --orphaned --logical-id "Frigg*" --execute

# JSON output for scripting
frigg cleanup --orphaned --output json
```

#### FR-2: Safety Features

**CRITICAL SAFETY REQUIREMENTS**:

1. **Dry-run by default**: Unless `--execute` is specified, only show what would be deleted
2. **Dependency checking**: Detect and warn about dependencies before deletion
3. **Confirmation prompts**: Require explicit user confirmation before deletion
4. **Deletion order**: Delete resources in correct order (subnets before VPCs, etc.)
5. **Rollback protection**: Create snapshots/backups where possible
6. **Audit logging**: Log all deletion attempts and results

**Dependency Detection Examples**:

```javascript
// VPC dependency check
if (resourceType === 'AWS::EC2::VPC') {
  const dependencies = [
    await checkForSubnets(vpcId),
    await checkForSecurityGroups(vpcId),
    await checkForNATGateways(vpcId),
    await checkForInternetGateways(vpcId),
    await checkForVPCEndpoints(vpcId),
    await checkForRouteTables(vpcId),
    await checkForNetworkACLs(vpcId),
  ];

  if (dependencies.some(d => d.hasResources)) {
    throw new Error('Cannot delete VPC: has dependent resources');
  }
}

// Security Group dependency check
if (resourceType === 'AWS::EC2::SecurityGroup') {
  const usage = [
    await checkForEC2Instances(sgId),
    await checkForRDSInstances(sgId),
    await checkForLambdaFunctions(sgId),
    await checkForLoadBalancers(sgId),
  ];

  if (usage.some(u => u.hasResources)) {
    throw new Error('Cannot delete SecurityGroup: in use by other resources');
  }
}
```

#### FR-3: Deletion Order

Resources must be deleted in dependency order:

**Phase 1 - Detach Dependencies**:
1. VPC Endpoints
2. NAT Gateway attachments
3. Internet Gateway attachments
4. Route table associations

**Phase 2 - Delete Dependent Resources**:
1. NAT Gateways
2. Internet Gateways
3. Route Tables (non-default)
4. Network ACLs (non-default)
5. Subnets
6. Security Groups (non-default)

**Phase 3 - Delete Core Resources**:
1. VPCs

**Implementation**:

```javascript
const DELETION_ORDER = [
  { type: 'AWS::EC2::VPCEndpoint', phase: 1 },
  { type: 'AWS::EC2::NatGateway', phase: 2 },
  { type: 'AWS::EC2::InternetGateway', phase: 2 },
  { type: 'AWS::EC2::RouteTable', phase: 2 },
  { type: 'AWS::EC2::NetworkAcl', phase: 2 },
  { type: 'AWS::EC2::Subnet', phase: 2 },
  { type: 'AWS::EC2::SecurityGroup', phase: 2 },
  { type: 'AWS::EC2::VPC', phase: 3 },
];
```

#### FR-4: Terminal Output

**Dry-Run Mode** (default):

```bash
$ frigg cleanup --orphaned

🧹 Frigg Cleanup - Orphaned Resources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stack: quo-integrations-dev
Region: us-east-1
Mode: DRY-RUN (no resources will be deleted)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Analyzing duplicate orphaned resources...

Found 11 duplicate resources not in build template:

VPCs (2):
  ⚠️  vpc-0e2351eac99adcb83 (FriggVPC)
      • Tags: quo-integrations-dev, Stage: dev
      • Cost: ~$36/month (NAT Gateway)
      • Dependencies: 3 subnets, 1 security group
      • Status: Can be deleted (after dependencies)

  ⚠️  vpc-020a0365610c05f0b (FriggVPC)
      • Tags: quo-integrations-dev, Stage: dev
      • Cost: ~$36/month (NAT Gateway)
      • Dependencies: 2 subnets, 1 security group
      • Status: Can be deleted (after dependencies)

Subnets (7):
  ✓ subnet-0123456789abcdef0 (FriggPrivateSubnet1)
    • Parent VPC: vpc-0e2351eac99adcb83
    • Status: Can be deleted

  ✓ subnet-0123456789abcdef1 (FriggPrivateSubnet2)
    • Parent VPC: vpc-0e2351eac99adcb83
    • Status: Can be deleted

  ... (5 more subnets)

SecurityGroups (2):
  ⚠️  sg-0123456789abcdef0 (FriggLambdaSecurityGroup)
      • VPC: vpc-0e2351eac99adcb83
      • Rules: 2 ingress, 1 egress
      • In use by: 0 resources
      • Status: Can be deleted

  ⚠️  sg-0123456789abcdef1 (FriggLambdaSecurityGroup)
      • VPC: vpc-020a0365610c05f0b
      • Rules: 2 ingress, 1 egress
      • In use by: 0 resources
      • Status: Can be deleted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 CLEANUP SUMMARY

Total resources: 11
  • VPCs: 2 (can delete)
  • Subnets: 7 (can delete)
  • SecurityGroups: 2 (can delete)

Estimated monthly savings: $72

Deletion order:
  Phase 1: Remove attachments (0 resources)
  Phase 2: Delete dependent resources (9 resources)
  Phase 3: Delete core resources (2 VPCs)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  SAFETY WARNINGS

  • This operation cannot be easily undone
  • Resources will be permanently deleted from AWS
  • Verify no applications depend on these resources
  • Consider taking backups if needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To delete these resources, run:
  frigg cleanup --orphaned --execute

To review individual resources:
  frigg cleanup --orphaned --output json | jq .
```

**Execute Mode** (with confirmation):

```bash
$ frigg cleanup --orphaned --execute

🧹 Frigg Cleanup - Orphaned Resources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stack: quo-integrations-dev
Region: us-east-1
Mode: EXECUTE (resources WILL be deleted)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  WARNING: You are about to DELETE 11 AWS resources

This action:
  • Cannot be easily undone
  • Will permanently delete resources from AWS
  • May affect running applications if dependencies exist
  • Will save approximately $72/month

Resources to delete:
  • 2 VPCs
  • 7 Subnets
  • 2 SecurityGroups

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type 'delete quo-integrations-dev' to confirm: delete quo-integrations-dev

✓ Confirmation received. Starting deletion...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: Detaching dependencies...
  (no resources in this phase)

Phase 2: Deleting dependent resources...
  [1/9] Deleting subnet-0123456789abcdef0... ✓
  [2/9] Deleting subnet-0123456789abcdef1... ✓
  [3/9] Deleting subnet-0123456789abcdef2... ✓
  [4/9] Deleting subnet-0123456789abcdef3... ✓
  [5/9] Deleting subnet-0123456789abcdef4... ✓
  [6/9] Deleting subnet-0123456789abcdef5... ✓
  [7/9] Deleting subnet-0123456789abcdef6... ✓
  [8/9] Deleting sg-0123456789abcdef0... ✓
  [9/9] Deleting sg-0123456789abcdef1... ✓

Phase 3: Deleting core resources...
  [1/2] Deleting vpc-0e2351eac99adcb83... ✓ (20s)
  [2/2] Deleting vpc-020a0365610c05f0b... ✓ (18s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ CLEANUP COMPLETE

Successfully deleted: 11 resources
  • VPCs: 2
  • Subnets: 7
  • SecurityGroups: 2

Failed: 0 resources

Estimated monthly savings: $72

Total time: 45s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Next steps:
  1. Run 'frigg doctor' to verify health score improved
  2. Run 'frigg repair --import' to import remaining resources
```

**Execute Mode** (with --yes flag):

```bash
$ frigg cleanup --orphaned --execute --yes

🧹 Frigg Cleanup - Orphaned Resources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Auto-confirm enabled (--yes flag)

Deleting 11 resources without confirmation...

Phase 2: Deleting dependent resources...
  [1/9] Deleting subnet-0123456789abcdef0... ✓
  ... (progress shown)

✅ CLEANUP COMPLETE
```

#### FR-5: Error Handling

**Dependency Errors**:

```bash
$ frigg cleanup --orphaned --execute

Phase 3: Deleting core resources...
  [1/2] Deleting vpc-0e2351eac99adcb83... ✗ FAILED

❌ Error: Cannot delete VPC vpc-0e2351eac99adcb83
   Reason: DependencyViolation - The vpc has dependencies and cannot be deleted

   Remaining dependencies:
     • Internet Gateway: igw-0123456789abcdef0 (still attached)
     • NAT Gateway: nat-0123456789abcdef0 (still exists)

   💡 Run cleanup again to retry after dependency cleanup
```

**Permission Errors**:

```bash
❌ Error: Access Denied
   Reason: User lacks permission to delete VPCs

   Required IAM permissions:
     • ec2:DeleteVpc
     • ec2:DeleteSubnet
     • ec2:DeleteSecurityGroup

   💡 Update your IAM policy and try again
```

**Resource In Use**:

```bash
⚠️  Cannot delete sg-0123456789abcdef0

   Reason: Security group is in use by:
     • Lambda function: quo-integrations-dev-handler (12345678)
     • RDS instance: quo-integrations-db (i-12345678)

   ❌ This resource will NOT be deleted

   💡 Remove references from these resources first
```

#### FR-6: JSON Output

For scripting and automation:

```json
{
  "stack": {
    "name": "quo-integrations-dev",
    "region": "us-east-1"
  },
  "mode": "dry-run",
  "resources": {
    "total": 11,
    "canDelete": 11,
    "blocked": 0,
    "byType": {
      "AWS::EC2::VPC": 2,
      "AWS::EC2::Subnet": 7,
      "AWS::EC2::SecurityGroup": 2
    }
  },
  "duplicateResources": [
    {
      "physicalId": "vpc-0e2351eac99adcb83",
      "resourceType": "AWS::EC2::VPC",
      "logicalId": "FriggVPC",
      "tags": {
        "aws:cloudformation:stack-name": "quo-integrations-dev",
        "aws:cloudformation:logical-id": "FriggVPC",
        "Stage": "dev"
      },
      "dependencies": {
        "subnets": ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1", "subnet-0123456789abcdef2"],
        "securityGroups": ["sg-0123456789abcdef0"],
        "hasBlockingDependencies": false
      },
      "estimatedMonthlyCost": 36.00,
      "deletionPhase": 3,
      "canDelete": true,
      "blockingReason": null
    }
    // ... 10 more resources
  ],
  "deletionPlan": {
    "phase1": [],
    "phase2": [
      {
        "physicalId": "subnet-0123456789abcdef0",
        "resourceType": "AWS::EC2::Subnet",
        "order": 1
      }
      // ... 8 more
    ],
    "phase3": [
      {
        "physicalId": "vpc-0e2351eac99adcb83",
        "resourceType": "AWS::EC2::VPC",
        "order": 1
      },
      {
        "physicalId": "vpc-020a0365610c05f0b",
        "resourceType": "AWS::EC2::VPC",
        "order": 2
      }
    ]
  },
  "estimatedSavings": {
    "monthly": 72.00,
    "annual": 864.00
  },
  "warnings": [
    "This operation cannot be easily undone",
    "Resources will be permanently deleted from AWS",
    "Verify no applications depend on these resources"
  ],
  "timestamp": "2025-10-27T10:30:00Z"
}
```

### Non-Functional Requirements

#### NFR-1: Performance

- Dependency checking must complete within 30 seconds for 50 resources
- Deletion progress updates every 2 seconds
- Support parallel deletion where safe (independent resources)

#### NFR-2: Reliability

- Idempotent operations (safe to retry after failure)
- Continue on non-fatal errors
- Comprehensive error logging

#### NFR-3: Security

- Require explicit confirmation for destructive operations
- Log all deletion attempts to CloudWatch/audit log
- Support AWS CloudTrail integration
- Never expose credentials in logs

#### NFR-4: Usability

- Clear, informative error messages
- Progress indicators for long operations
- Cost estimates to help decision-making
- Helpful next-step suggestions

## Design

### Architecture

Following **Hexagonal Architecture** principles:

```
┌─────────────────────────────────────────────────────────────────┐
│ Adapter Layer (CLI Command)                                    │
│  cleanup-command/index.js                                      │
│  - Parse command line options                                  │
│  - Handle confirmation prompts                                 │
│  - Format output (terminal, JSON)                              │
│  - Display progress indicators                                 │
└────────────────┬────────────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────────────┐
│ Application Layer (Use Case)                                   │
│  CleanupOrphanedResourcesUseCase (NEW)                        │
│  - Orchestrate cleanup workflow                                │
│  - Identify duplicate resources                                │
│  - Check dependencies                                           │
│  - Plan deletion order                                          │
│  - Execute deletions with rollback                             │
└────────────────┬────────────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────────────┐
│ Domain Layer (Services)                                        │
│  OrphanedResourceCategorizerService (REUSE)                    │
│  - Identify duplicate orphaned resources                       │
│                                                                 │
│  ResourceDependencyAnalyzer (NEW)                              │
│  - Analyze resource dependencies                               │
│  - Determine deletion order                                    │
│  - Check for blocking dependencies                             │
│                                                                 │
│  ResourceDeletionPlanner (NEW)                                 │
│  - Create deletion plan with phases                            │
│  - Calculate cost savings                                      │
│  - Generate warnings                                           │
└────────────────┬────────────────────────────────────────────────┘
                 │ uses
┌────────────────▼────────────────────────────────────────────────┐
│ Infrastructure Layer (Repositories)                            │
│  ResourceDeleterRepository (NEW)                               │
│  - Execute AWS API calls for resource deletion                 │
│  - Check resource dependencies via AWS APIs                    │
│  - Handle AWS-specific errors                                  │
│                                                                 │
│  AuditLogRepository (NEW)                                      │
│  - Log deletion attempts and results                           │
│  - Store audit trail                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. ResourceDependencyAnalyzer (NEW)

**Location**: `packages/devtools/infrastructure/domains/health/domain/services/resource-dependency-analyzer.js`

**Responsibilities**:
- Analyze dependencies between resources
- Determine safe deletion order
- Detect blocking dependencies

**Public Methods**:

```javascript
class ResourceDependencyAnalyzer {
  constructor({ ec2Client, elbClient, rdsClient, lambdaClient }) {
    this.ec2 = ec2Client;
    this.elb = elbClient;
    this.rds = rdsClient;
    this.lambda = lambdaClient;
  }

  /**
   * Analyze dependencies for a list of resources
   *
   * @param {Array} resources - Resources to analyze
   * @returns {Promise<Object>} Dependency analysis
   */
  async analyzeDependencies(resources) {
    const analysis = {
      canDeleteAll: true,
      blockedResources: [],
      dependencies: {},
    };

    for (const resource of resources) {
      const deps = await this._checkResourceDependencies(resource);

      analysis.dependencies[resource.physicalId] = deps;

      if (deps.hasBlockingDependencies) {
        analysis.canDeleteAll = false;
        analysis.blockedResources.push({
          resource,
          blockingDependencies: deps.blocking,
        });
      }
    }

    return analysis;
  }

  /**
   * Determine deletion order based on dependencies
   *
   * @param {Array} resources - Resources to order
   * @returns {Object} Deletion plan with phases
   */
  determineDeletionOrder(resources) {
    const phases = {
      phase1: [], // Detach dependencies
      phase2: [], // Delete dependent resources
      phase3: [], // Delete core resources
    };

    for (const resource of resources) {
      const phase = this._getDeletionPhase(resource.resourceType);
      phases[`phase${phase}`].push(resource);
    }

    // Sort each phase by priority
    phases.phase1.sort(this._compareDeletionPriority);
    phases.phase2.sort(this._compareDeletionPriority);
    phases.phase3.sort(this._compareDeletionPriority);

    return phases;
  }

  /**
   * Check dependencies for a specific resource
   * @private
   */
  async _checkResourceDependencies(resource) {
    switch (resource.resourceType) {
      case 'AWS::EC2::VPC':
        return await this._checkVpcDependencies(resource.physicalId);
      case 'AWS::EC2::Subnet':
        return await this._checkSubnetDependencies(resource.physicalId);
      case 'AWS::EC2::SecurityGroup':
        return await this._checkSecurityGroupDependencies(resource.physicalId);
      default:
        return { hasBlockingDependencies: false, blocking: [], dependent: [] };
    }
  }

  /**
   * Check VPC dependencies
   * @private
   */
  async _checkVpcDependencies(vpcId) {
    const [subnets, securityGroups, natGateways, igws, endpoints] = await Promise.all([
      this.ec2.describeSubnets({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }),
      this.ec2.describeSecurityGroups({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }),
      this.ec2.describeNatGateways({ Filter: [{ Name: 'vpc-id', Values: [vpcId] }] }),
      this.ec2.describeInternetGateways({ Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }] }),
      this.ec2.describeVpcEndpoints({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }),
    ]);

    const blocking = [];

    // Filter out default resources that can be deleted with VPC
    const customSubnets = subnets.Subnets.filter(s => !s.DefaultForAz);
    const customSGs = securityGroups.SecurityGroups.filter(sg => sg.GroupName !== 'default');

    if (customSubnets.length > 0) {
      blocking.push({ type: 'subnets', count: customSubnets.length, ids: customSubnets.map(s => s.SubnetId) });
    }
    if (customSGs.length > 0) {
      blocking.push({ type: 'security_groups', count: customSGs.length, ids: customSGs.map(sg => sg.GroupId) });
    }
    if (natGateways.NatGateways?.length > 0) {
      blocking.push({ type: 'nat_gateways', count: natGateways.NatGateways.length });
    }
    if (igws.InternetGateways?.length > 0) {
      blocking.push({ type: 'internet_gateways', count: igws.InternetGateways.length });
    }
    if (endpoints.VpcEndpoints?.length > 0) {
      blocking.push({ type: 'vpc_endpoints', count: endpoints.VpcEndpoints.length });
    }

    return {
      hasBlockingDependencies: blocking.length > 0,
      blocking,
      dependent: [],
    };
  }

  /**
   * Check security group dependencies
   * @private
   */
  async _checkSecurityGroupDependencies(sgId) {
    // Check if security group is in use by any resources
    const [ec2Instances, rdsInstances, lambdaFunctions, loadBalancers] = await Promise.all([
      this.ec2.describeInstances({ Filters: [{ Name: 'instance.group-id', Values: [sgId] }] }),
      this.rds.describeDBInstances(),
      this.lambda.listFunctions(),
      this.elb.describeLoadBalancers(),
    ]);

    const blocking = [];

    // Check EC2 instances
    const instances = ec2Instances.Reservations.flatMap(r => r.Instances);
    if (instances.length > 0) {
      blocking.push({
        type: 'ec2_instances',
        count: instances.length,
        ids: instances.map(i => i.InstanceId),
      });
    }

    // Check RDS instances
    const rdsUsingThisSG = rdsInstances.DBInstances.filter(db =>
      db.VpcSecurityGroups?.some(sg => sg.VpcSecurityGroupId === sgId)
    );
    if (rdsUsingThisSG.length > 0) {
      blocking.push({
        type: 'rds_instances',
        count: rdsUsingThisSG.length,
        ids: rdsUsingThisSG.map(db => db.DBInstanceIdentifier),
      });
    }

    // Check Lambda functions
    const lambdaUsingThisSG = lambdaFunctions.Functions.filter(fn =>
      fn.VpcConfig?.SecurityGroupIds?.includes(sgId)
    );
    if (lambdaUsingThisSG.length > 0) {
      blocking.push({
        type: 'lambda_functions',
        count: lambdaUsingThisSG.length,
        ids: lambdaUsingThisSG.map(fn => fn.FunctionName),
      });
    }

    return {
      hasBlockingDependencies: blocking.length > 0,
      blocking,
      dependent: [],
    };
  }

  /**
   * Get deletion phase for resource type
   * @private
   */
  _getDeletionPhase(resourceType) {
    const phaseMap = {
      'AWS::EC2::VPCEndpoint': 1,
      'AWS::EC2::NatGateway': 2,
      'AWS::EC2::InternetGateway': 2,
      'AWS::EC2::RouteTable': 2,
      'AWS::EC2::NetworkAcl': 2,
      'AWS::EC2::Subnet': 2,
      'AWS::EC2::SecurityGroup': 2,
      'AWS::EC2::VPC': 3,
    };

    return phaseMap[resourceType] || 2;
  }

  /**
   * Compare deletion priority
   * @private
   */
  _compareDeletionPriority(a, b) {
    const priorityMap = {
      'AWS::EC2::VPCEndpoint': 1,
      'AWS::EC2::NatGateway': 2,
      'AWS::EC2::InternetGateway': 3,
      'AWS::EC2::RouteTable': 4,
      'AWS::EC2::Subnet': 5,
      'AWS::EC2::SecurityGroup': 6,
      'AWS::EC2::VPC': 7,
    };

    return (priorityMap[a.resourceType] || 99) - (priorityMap[b.resourceType] || 99);
  }
}
```

#### 2. ResourceDeletionPlanner (NEW)

**Location**: `packages/devtools/infrastructure/domains/health/domain/services/resource-deletion-planner.js`

**Responsibilities**:
- Create detailed deletion plan
- Calculate cost savings
- Generate warnings

**Public Methods**:

```javascript
class ResourceDeletionPlanner {
  /**
   * Create deletion plan with phases and cost estimates
   *
   * @param {Object} params
   * @param {Array} params.resources - Resources to delete
   * @param {Object} params.dependencyAnalysis - Dependency analysis result
   * @returns {Object} Deletion plan
   */
  createDeletionPlan({ resources, dependencyAnalysis }) {
    // 1. Filter out blocked resources
    const deletableResources = resources.filter(
      (r) => !dependencyAnalysis.blockedResources.some(
        (b) => b.resource.physicalId === r.physicalId
      )
    );

    // 2. Determine deletion order
    const deletionPhases = this._organizeDeletionPhases(deletableResources);

    // 3. Calculate cost savings
    const costSavings = this._calculateCostSavings(deletableResources);

    // 4. Generate warnings
    const warnings = this._generateWarnings(deletableResources, dependencyAnalysis);

    return {
      totalResources: resources.length,
      deletableCount: deletableResources.length,
      blockedCount: dependencyAnalysis.blockedResources.length,
      phases: deletionPhases,
      costSavings,
      warnings,
      blockedResources: dependencyAnalysis.blockedResources,
    };
  }

  /**
   * Calculate estimated monthly cost savings
   * @private
   */
  _calculateCostSavings(resources) {
    let monthlyCost = 0;

    for (const resource of resources) {
      switch (resource.resourceType) {
        case 'AWS::EC2::VPC':
          // Assume NAT Gateway cost (most expensive part of VPC)
          monthlyCost += 36; // $32.40 for NAT + $0.045/GB
          break;
        case 'AWS::EC2::NatGateway':
          monthlyCost += 36;
          break;
        case 'AWS::EC2::EIP':
          monthlyCost += 3.65; // $0.005/hour
          break;
        // Other resources have minimal direct costs
      }
    }

    return {
      monthly: monthlyCost,
      annual: monthlyCost * 12,
    };
  }

  /**
   * Generate warnings for deletion
   * @private
   */
  _generateWarnings(resources, dependencyAnalysis) {
    const warnings = [
      'This operation cannot be easily undone',
      'Resources will be permanently deleted from AWS',
      'Verify no applications depend on these resources',
    ];

    // Add specific warnings based on resource types
    if (resources.some(r => r.resourceType === 'AWS::EC2::VPC')) {
      warnings.push('Deleting VPCs will also delete associated default resources');
    }

    if (dependencyAnalysis.blockedResources.length > 0) {
      warnings.push(
        `${dependencyAnalysis.blockedResources.length} resources cannot be deleted due to dependencies`
      );
    }

    return warnings;
  }
}
```

#### 3. CleanupOrphanedResourcesUseCase (NEW)

**Location**: `packages/devtools/infrastructure/domains/health/application/use-cases/cleanup-orphaned-resources-use-case.js`

**Responsibilities**:
- Orchestrate complete cleanup workflow
- Coordinate categorizer, analyzer, planner, and deleter
- Handle errors and rollback

**Public Methods**:

```javascript
class CleanupOrphanedResourcesUseCase {
  constructor({
    orphanedResourceCategorizerService,
    resourceDependencyAnalyzer,
    resourceDeletionPlanner,
    resourceDeleterRepository,
    auditLogRepository,
  }) {
    this.categorizerService = orphanedResourceCategorizerService;
    this.dependencyAnalyzer = resourceDependencyAnalyzer;
    this.deletionPlanner = resourceDeletionPlanner;
    this.deleterRepo = resourceDeleterRepository;
    this.auditRepo = auditLogRepository;
  }

  /**
   * Execute cleanup workflow
   *
   * @param {Object} params
   * @param {StackIdentifier} params.stackIdentifier
   * @param {string} params.buildTemplatePath
   * @param {boolean} params.dryRun - If true, only plan, don't execute
   * @param {string} params.resourceTypeFilter - Optional resource type filter
   * @param {string} params.logicalIdPattern - Optional logical ID pattern
   * @returns {Promise<Object>} Cleanup result
   */
  async execute({
    stackIdentifier,
    buildTemplatePath,
    dryRun = true,
    resourceTypeFilter = null,
    logicalIdPattern = null,
  }) {
    // 1. Get duplicate orphaned resources
    const categorization = await this.categorizerService.categorize({
      orphanedResources: [], // Will be fetched internally
      stackIdentifier,
      buildTemplatePath,
    });

    let duplicates = categorization.duplicates || [];

    // 2. Apply filters
    if (resourceTypeFilter) {
      duplicates = duplicates.filter((r) => r.resourceType === resourceTypeFilter);
    }
    if (logicalIdPattern) {
      const regex = new RegExp(logicalIdPattern.replace('*', '.*'));
      duplicates = duplicates.filter((r) => regex.test(r.logicalId));
    }

    if (duplicates.length === 0) {
      return {
        success: true,
        message: 'No duplicate orphaned resources found',
        deletedCount: 0,
        skippedCount: 0,
      };
    }

    // 3. Analyze dependencies
    const dependencyAnalysis = await this.dependencyAnalyzer.analyzeDependencies(duplicates);

    // 4. Create deletion plan
    const deletionPlan = this.deletionPlanner.createDeletionPlan({
      resources: duplicates,
      dependencyAnalysis,
    });

    // 5. If dry-run, return plan without executing
    if (dryRun) {
      return {
        dryRun: true,
        deletionPlan,
        message: 'Dry-run complete. No resources were deleted.',
      };
    }

    // 6. Execute deletions
    const deletionResult = await this._executeDeletionPlan(
      deletionPlan,
      stackIdentifier
    );

    // 7. Log to audit trail
    await this.auditRepo.logCleanupOperation({
      stackIdentifier,
      deletionPlan,
      result: deletionResult,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      dryRun: false,
      deletedCount: deletionResult.successCount,
      failedCount: deletionResult.failedCount,
      skippedCount: deletionPlan.blockedCount,
      deletionResult,
      costSavings: deletionPlan.costSavings,
    };
  }

  /**
   * Execute deletion plan phase by phase
   * @private
   */
  async _executeDeletionPlan(deletionPlan, stackIdentifier) {
    const results = {
      successCount: 0,
      failedCount: 0,
      deleted: [],
      failed: [],
    };

    // Execute in order: phase1, phase2, phase3
    for (const phase of ['phase1', 'phase2', 'phase3']) {
      const resources = deletionPlan.phases[phase];

      for (const resource of resources) {
        try {
          await this.deleterRepo.deleteResource({
            resourceType: resource.resourceType,
            physicalId: resource.physicalId,
            region: stackIdentifier.region,
          });

          results.successCount++;
          results.deleted.push({
            physicalId: resource.physicalId,
            resourceType: resource.resourceType,
          });
        } catch (error) {
          results.failedCount++;
          results.failed.push({
            physicalId: resource.physicalId,
            resourceType: resource.resourceType,
            error: error.message,
          });
        }

        // Small delay between deletions to avoid throttling
        await this._delay(500);
      }

      // Delay between phases to allow AWS to clean up
      if (resources.length > 0) {
        await this._delay(5000);
      }
    }

    return results;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

#### 4. ResourceDeleterRepository (NEW)

**Location**: `packages/devtools/infrastructure/domains/health/infrastructure/repositories/resource-deleter-repository.js`

**Responsibilities**:
- Execute AWS API calls for resource deletion
- Handle AWS-specific errors

**Public Methods**:

```javascript
class ResourceDeleterRepository {
  constructor({ ec2Client, region }) {
    this.ec2 = ec2Client;
    this.region = region;
  }

  /**
   * Delete a resource from AWS
   *
   * @param {Object} params
   * @param {string} params.resourceType - CloudFormation resource type
   * @param {string} params.physicalId - Physical resource ID
   * @param {string} params.region - AWS region
   * @returns {Promise<Object>} Deletion result
   */
  async deleteResource({ resourceType, physicalId, region }) {
    try {
      switch (resourceType) {
        case 'AWS::EC2::VPC':
          return await this._deleteVpc(physicalId);
        case 'AWS::EC2::Subnet':
          return await this._deleteSubnet(physicalId);
        case 'AWS::EC2::SecurityGroup':
          return await this._deleteSecurityGroup(physicalId);
        // Add more resource types as needed
        default:
          throw new Error(`Unsupported resource type: ${resourceType}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to delete ${resourceType} ${physicalId}: ${error.message}`
      );
    }
  }

  /**
   * Delete VPC
   * @private
   */
  async _deleteVpc(vpcId) {
    await this.ec2.deleteVpc({ VpcId: vpcId });
    return { success: true, physicalId: vpcId };
  }

  /**
   * Delete Subnet
   * @private
   */
  async _deleteSubnet(subnetId) {
    await this.ec2.deleteSubnet({ SubnetId: subnetId });
    return { success: true, physicalId: subnetId };
  }

  /**
   * Delete Security Group
   * @private
   */
  async _deleteSecurityGroup(sgId) {
    await this.ec2.deleteSecurityGroup({ GroupId: sgId });
    return { success: true, physicalId: sgId };
  }
}
```

### Data Flow

```
User runs: frigg cleanup --orphaned --execute
         ↓
cleanup-command/index.js
         ↓ calls
CleanupOrphanedResourcesUseCase.execute()
         ↓ calls
OrphanedResourceCategorizerService.categorize()
         ↓ returns
{ duplicates: [...] }
         ↓
ResourceDependencyAnalyzer.analyzeDependencies()
         ↓ returns
{ blockedResources: [...], dependencies: {...} }
         ↓
ResourceDeletionPlanner.createDeletionPlan()
         ↓ returns
{ phases: {...}, costSavings: {...}, warnings: [...] }
         ↓
Display confirmation prompt (unless --yes)
         ↓ if confirmed
_executeDeletionPlan()
         ↓ phase by phase
ResourceDeleterRepository.deleteResource()
         ↓ for each resource
AWS API calls (deleteVpc, deleteSubnet, etc.)
         ↓
AuditLogRepository.logCleanupOperation()
         ↓
Display result summary
```

## Implementation Plan

### Phase 1: Core Dependency Analysis (TDD)

1. **Write tests** for `ResourceDependencyAnalyzer`
   - Test VPC dependency checking
   - Test security group dependency checking
   - Test deletion order determination
   - Test blocking dependency detection

2. **Implement** `ResourceDependencyAnalyzer`
   - Implement dependency checking methods
   - Implement deletion order logic
   - Handle AWS API calls

3. **Verify** tests pass

### Phase 2: Deletion Planning (TDD)

1. **Write tests** for `ResourceDeletionPlanner`
   - Test deletion plan creation
   - Test cost calculation
   - Test warning generation
   - Test phase organization

2. **Implement** `ResourceDeletionPlanner`
   - Implement plan creation
   - Implement cost calculator
   - Implement warning generator

3. **Verify** tests pass

### Phase 3: Use Case Orchestration (TDD)

1. **Write tests** for `CleanupOrphanedResourcesUseCase`
   - Test dry-run mode
   - Test execute mode
   - Test filtering (resource type, logical ID)
   - Test error handling
   - Test rollback behavior

2. **Implement** use case
   - Orchestrate all services
   - Implement deletion execution
   - Handle errors gracefully

3. **Verify** tests pass

### Phase 4: Infrastructure Repository (TDD)

1. **Write tests** for `ResourceDeleterRepository`
   - Test VPC deletion
   - Test subnet deletion
   - Test security group deletion
   - Test error handling

2. **Implement** repository
   - AWS SDK integration
   - Error handling and retries

3. **Verify** tests pass

### Phase 5: CLI Integration

1. **Create** `cleanup-command/index.js`
   - Command line parsing
   - Confirmation prompts
   - Output formatting
   - Progress indicators

2. **Test** with real data
   - Test dry-run mode
   - Test execute mode
   - Test error scenarios
   - Test with `quo-integrations-dev`

3. **Update documentation**

## Testing Strategy

### Unit Tests

**ResourceDependencyAnalyzer**:
- ✅ Analyze VPC with dependencies
- ✅ Analyze VPC without dependencies
- ✅ Analyze security group in use
- ✅ Analyze security group not in use
- ✅ Determine deletion order correctly
- ✅ Handle API errors gracefully

**ResourceDeletionPlanner**:
- ✅ Create plan with multiple phases
- ✅ Calculate cost savings accurately
- ✅ Generate appropriate warnings
- ✅ Handle blocked resources
- ✅ Filter resources correctly

**CleanupOrphanedResourcesUseCase**:
- ✅ Dry-run returns plan without deleting
- ✅ Execute mode deletes resources
- ✅ Stop on first error (optional behavior)
- ✅ Continue on non-fatal errors
- ✅ Filter by resource type
- ✅ Filter by logical ID pattern
- ✅ Log to audit trail

**ResourceDeleterRepository**:
- ✅ Delete VPC successfully
- ✅ Delete subnet successfully
- ✅ Delete security group successfully
- ✅ Handle dependency errors
- ✅ Handle permission errors
- ✅ Retry on throttling

### Integration Tests

- ✅ End-to-end cleanup with mock AWS data
- ✅ Verify deletion order is correct
- ✅ Verify blocked resources are not deleted
- ✅ Verify audit log is written
- ✅ Test with `quo-integrations-dev` stack (11 duplicate resources)

### Real-World Validation

Use `quo-integrations-dev` stack as reference:
- 11 duplicate orphaned resources
- 2 VPCs with dependencies (9 total)
- Verify all dependencies are detected
- Verify deletion plan is safe
- Execute in isolated test environment

## Security Considerations

### 1. Permission Requirements

**Minimum IAM Policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DeleteVpc",
        "ec2:DeleteSubnet",
        "ec2:DeleteSecurityGroup",
        "ec2:DeleteInternetGateway",
        "ec2:DeleteNatGateway",
        "ec2:DeleteRouteTable",
        "ec2:DeleteVpcEndpoint",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeInstances",
        "ec2:DescribeNatGateways",
        "ec2:DescribeInternetGateways",
        "ec2:DescribeVpcEndpoints"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/ManagedBy": "Frigg"
        }
      }
    }
  ]
}
```

### 2. Audit Logging

All cleanup operations must be logged:

```javascript
{
  "operation": "cleanup_orphaned_resources",
  "timestamp": "2025-10-27T10:30:00Z",
  "user": "user@example.com",
  "stackName": "quo-integrations-dev",
  "region": "us-east-1",
  "mode": "execute",
  "resources": {
    "total": 11,
    "deleted": 11,
    "failed": 0
  },
  "deletedResources": [
    {
      "physicalId": "vpc-0e2351eac99adcb83",
      "resourceType": "AWS::EC2::VPC",
      "logicalId": "FriggVPC",
      "deletedAt": "2025-10-27T10:30:15Z"
    }
    // ... 10 more
  ],
  "costSavings": {
    "monthly": 72.00,
    "annual": 864.00
  }
}
```

### 3. Safety Mechanisms

- ✅ Dry-run by default
- ✅ Explicit confirmation required
- ✅ Dependency checking before deletion
- ✅ Deletion order enforcement
- ✅ Audit trail for all operations
- ✅ Support for --yes flag (automation)
- ✅ Permission checks before deletion
- ✅ Resource tagging verification (only delete Frigg-managed resources)

## Success Criteria

1. ✅ Command correctly identifies duplicate orphaned resources
2. ✅ Dependency analysis detects blocking dependencies
3. ✅ Deletion plan orders resources correctly
4. ✅ Dry-run mode shows plan without deleting
5. ✅ Execute mode deletes resources safely
6. ✅ Error handling is robust (permissions, dependencies, API errors)
7. ✅ All deletions are logged to audit trail
8. ✅ Cost savings are calculated accurately
9. ✅ All tests pass (unit, integration, real-world validation)
10. ✅ Documentation is complete

## Open Questions

1. **Rollback strategy**: Should we support rollback if deletion fails partway through? (Complex: resources can't be "undeleted")
2. **Backup before delete**: Should we export resource configurations before deletion for recovery purposes?
3. **Concurrent deletion**: Should we delete independent resources in parallel for speed?
4. **Retry policy**: How many retries for throttling errors? What backoff strategy?
5. **Confirmation format**: Is `delete <stack-name>` sufficient, or should we require typing the exact resource count?
6. **Cost estimation**: Should we call AWS Pricing API for accurate costs, or use hardcoded estimates?

## Related Specifications

- [SPEC-ENHANCED-HEALTH-REPORT.md](./SPEC-ENHANCED-HEALTH-REPORT.md) - Enhanced health report with resource categorization
- [FIX-SUMMARY.md](../debug/FIX-SUMMARY.md) - Root cause analysis and fixes for logical ID mapping

## References

- User testing with `quo-integrations-dev` stack (11 duplicate resources)
- Real-world data documented in `ACTUAL-DATA-SHAPE.md`
- AWS EC2 API documentation for resource deletion
- CloudFormation resource import documentation
