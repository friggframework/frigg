# Orphan Detection: Relationship Analysis & Multiple Resource Warning System

## Problem Statement

When `frigg doctor` detects multiple orphaned resources of the same type (e.g., 3 VPCs, 10 subnets), users cannot easily determine:
1. Which orphaned resources are actually relevant to import
2. Which orphaned resources are old/unused and should be deleted
3. Whether any orphaned resources are being actively referenced by drifted resources

## Real-World Example: acme-integrations-dev Stack

### AWS Reality (Verified 2025-10-27)

**CloudFormation Stack State:**
- Stack Name: `acme-integrations-dev`
- VPCs in stack: **0** (stack doesn't manage VPC)
- Lambda functions: 16 (all with VPC configuration drift)

**Lambda Functions Configuration:**
```json
{
  "VpcId": "vpc-01f21101d4ed6db59",  // AWS Default VPC (172.31.0.0/16)
  "SubnetIds": [
    "subnet-020d32e3ca398a041",       // In default VPC
    "subnet-0c186318804aba790"        // In default VPC
  ],
  "SecurityGroupIds": [
    "sg-0aca40438d17344c4"             // In default VPC
  ]
}
```

**Orphaned Resources Detected:**

**3 VPCs (ALL with Frigg CloudFormation tags):**
1. `vpc-0eadd96976d29ede7` (10.0.0.0/16)
   - Tags: `aws:cloudformation:stack-name=acme-integrations-dev`, `aws:cloudformation:logical-id=FriggVPC`
   - Status: **NOT in CloudFormation stack, NOT used by Lambdas**
   - Conclusion: **Old unused VPC, should be deleted**

2. `vpc-0e2351eac99adcb83` (10.0.0.0/16)
   - Tags: `aws:cloudformation:stack-name=acme-integrations-dev`, `aws:cloudformation:logical-id=FriggVPC`
   - Status: **NOT in CloudFormation stack, NOT used by Lambdas**
   - Conclusion: **Old unused VPC, should be deleted**

3. `vpc-020a0365610c05f0b` (10.0.0.0/16)
   - Tags: `aws:cloudformation:stack-name=acme-integrations-dev`, `aws:cloudformation:logical-id=FriggVPC`
   - Status: **NOT in CloudFormation stack, NOT used by Lambdas**
   - Conclusion: **Old unused VPC, should be deleted**

**10 Subnets:** All belong to the 3 orphaned VPCs (not the default VPC being used)

**3 Security Groups:** All belong to the 3 orphaned VPCs (not the default VPC being used)

### Key Insights

1. **CloudFormation tags are misleading**: All 3 VPCs have identical CFN tags but NONE are in the stack
2. **Lambda drift is expected**: Lambdas use default VPC which has NO Frigg tags
3. **All orphaned resources are unused**: None of the 16 orphaned resources are being referenced
4. **Old deployment artifacts**: The orphaned VPCs are likely from previous Frigg deployments that failed cleanup

## Solution Design

### Phase 1: Relationship Analysis

Analyze connections between:
- **Drift Issues** → Resources being referenced in actual values
- **Orphaned Resources** → Resources detected but not in stack
- **Resource Hierarchies** → VPCs contain subnets/SGs, subnets belong to VPCs

### Phase 2: Extract Referenced Resource IDs

From property mismatch drift issues, extract resource IDs that are **actually being used**:

```javascript
// Example drift issue:
{
  propertyPath: "VpcConfig.SubnetIds",
  expectedValue: "subnet-old-1,subnet-old-2",
  actualValue: "subnet-020d32e3ca398a041,subnet-0c186318804aba790"
}

// Extract: ["subnet-020d32e3ca398a041", "subnet-0c186318804aba790"]
// These are the subnets actually being used (even if not orphaned)
```

**Property Paths to Analyze:**
- `VpcConfig.SubnetIds` → Subnet IDs
- `VpcConfig.SecurityGroupIds` → Security Group IDs
- `VpcId` → VPC IDs
- `SubnetId` → Subnet IDs (for other resources)

### Phase 3: Build Resource Relationship Graph

```javascript
{
  orphanedResources: [
    {
      physicalId: "vpc-0eadd96976d29ede7",
      resourceType: "AWS::EC2::VPC",
      metadata: {
        isReferencedByDrift: false,        // NOT referenced in any drift
        containsReferencedResources: false, // No subnets/SGs in this VPC are referenced
        relatedOrphans: [                  // Other orphans in this VPC
          "subnet-0ad31b5ee6814b8fa",
          "sg-03abddb7fb50aeaff"
        ],
        priority: "LOW"                    // Unused, should delete not import
      }
    },
    {
      physicalId: "subnet-020d32e3ca398a041",
      resourceType: "AWS::EC2::Subnet",
      vpcId: "vpc-01f21101d4ed6db59",      // In default VPC (not orphaned)
      metadata: {
        isReferencedByDrift: true,          // ✅ Referenced by 16 Lambda functions
        referencedBy: [                     // Which resources reference this
          "acme-integrations-dev-attio",
          "acme-integrations-dev-auth",
          // ... 14 more
        ],
        priority: "N/A"                     // Not orphaned, just drift reference
      }
    }
  ]
}
```

### Phase 4: Multi-Resource Warning System

When multiple resources of the same type are detected, show contextual warnings:

```
⚠ WARNING: Multiple VPCs detected (3 orphaned)

Analysis:
  • vpc-0eadd96976d29ede7 - No active references, contains 3 orphaned subnets [UNUSED]
  • vpc-0e2351eac99adcb83 - No active references, contains 4 orphaned subnets [UNUSED]
  • vpc-020a0365610c05f0b - No active references, contains 3 orphaned subnets [UNUSED]

Recommendation:
  ❌ Do NOT import these VPCs - they are old deployment artifacts
  ✅ Lambda functions use default VPC (vpc-01f21101d4ed6db59) - drift is expected
  🧹 Consider cleaning up orphaned VPCs to reduce clutter:
     $ aws ec2 delete-vpc --vpc-id vpc-0eadd96976d29ede7
```

## Implementation Plan

### 1. Add Relationship Analysis to AWSResourceDetector

```javascript
class AWSResourceDetector {
  /**
   * Find orphaned resources with relationship metadata
   */
  async findOrphanedResourcesWithRelationships({
    stackIdentifier,
    stackResources,
    driftIssues = []
  }) {
    // 1. Find orphaned resources (existing logic)
    const orphans = await this.findOrphanedResources({
      stackIdentifier,
      stackResources
    });

    // 2. Extract referenced resource IDs from drift
    const referencedIds = this._extractReferencedResourceIds(driftIssues);

    // 3. Enrich orphans with relationship metadata
    return this._enrichWithRelationshipMetadata(orphans, referencedIds);
  }

  /**
   * Extract resource IDs being referenced in drift actualValue
   */
  _extractReferencedResourceIds(driftIssues) {
    const referenced = {
      vpcIds: new Set(),
      subnetIds: new Set(),
      securityGroupIds: new Set()
    };

    for (const issue of driftIssues) {
      if (issue.type !== 'PROPERTY_MISMATCH') continue;

      const { propertyPath, actualValue } = issue.mismatch;

      // Extract subnet IDs from VpcConfig.SubnetIds
      if (propertyPath === 'VpcConfig.SubnetIds') {
        const subnetIds = actualValue.split(',');
        subnetIds.forEach(id => referenced.subnetIds.add(id));
      }

      // Extract SG IDs from VpcConfig.SecurityGroupIds
      if (propertyPath === 'VpcConfig.SecurityGroupIds') {
        const sgIds = actualValue.split(',');
        sgIds.forEach(id => referenced.securityGroupIds.add(id));
      }
    }

    return {
      vpcIds: Array.from(referenced.vpcIds),
      subnetIds: Array.from(referenced.subnetIds),
      securityGroupIds: Array.from(referenced.securityGroupIds)
    };
  }

  /**
   * Add relationship metadata to orphaned resources
   */
  _enrichWithRelationshipMetadata(orphans, referencedIds) {
    return orphans.map(orphan => {
      const metadata = {
        isReferencedByDrift: false,
        referencedBy: [],
        relatedOrphans: [],
        priority: 'LOW'
      };

      // Check if this orphan is actually referenced
      if (orphan.resourceType === 'AWS::EC2::Subnet') {
        metadata.isReferencedByDrift = referencedIds.subnetIds.includes(orphan.physicalId);
      } else if (orphan.resourceType === 'AWS::EC2::SecurityGroup') {
        metadata.isReferencedByDrift = referencedIds.securityGroupIds.includes(orphan.physicalId);
      }

      if (metadata.isReferencedByDrift) {
        metadata.priority = 'HIGH';
      }

      return { ...orphan, metadata };
    });
  }

  /**
   * Analyze orphan summary for warnings
   */
  analyzeOrphanSummary(orphans) {
    const summary = {
      warnings: [],
      multipleResourceTypes: []
    };

    // Group by resource type
    const grouped = {};
    for (const orphan of orphans) {
      grouped[orphan.resourceType] = grouped[orphan.resourceType] || [];
      grouped[orphan.resourceType].push(orphan);
    }

    // Check for multiples
    for (const [type, resources] of Object.entries(grouped)) {
      if (resources.length > 1) {
        const shortType = type.replace('AWS::EC2::', '');
        summary.warnings.push(
          `Multiple ${shortType}s detected (${resources.length}). Review relationships before importing.`
        );
        summary.multipleResourceTypes.push(type);
      }
    }

    return summary;
  }
}
```

### 2. Update Health Check to Use Relationship Analysis

```javascript
// domains/health/application/use-cases/check-stack-health-use-case.js

class CheckStackHealthUseCase {
  async execute({ stackName, region }) {
    // ... existing drift detection ...

    // Enhanced orphan detection with relationships
    const orphanedResources = await this.resourceDetector.findOrphanedResourcesWithRelationships({
      stackIdentifier,
      stackResources,
      driftIssues: issues  // Pass drift issues for analysis
    });

    // Analyze for warnings
    const orphanSummary = this.resourceDetector.analyzeOrphanSummary(orphanedResources);

    return {
      // ... existing fields ...
      orphanedResources,
      orphanAnalysis: orphanSummary
    };
  }
}
```

### 3. Update Frigg Doctor Output

```javascript
// Show relationship warnings
if (orphanAnalysis.warnings.length > 0) {
  console.log('\n⚠ ORPHAN ANALYSIS WARNINGS:\n');
  for (const warning of orphanAnalysis.warnings) {
    console.log(`  ${warning}`);
  }
}

// Show orphan details with metadata
console.log('\n  CRITICAL ISSUES:');
for (const orphan of orphanedResources) {
  console.log(`    [ORPHANED_RESOURCE] ${orphan.physicalId}`);
  console.log(`       Resource: ${orphan.resourceType}`);

  if (orphan.metadata) {
    if (orphan.metadata.isReferencedByDrift) {
      console.log(`       ✅ ACTIVELY USED - Referenced by ${orphan.metadata.referencedBy.length} drifted resources`);
      console.log(`       Fix: Import to CloudFormation stack`);
    } else {
      console.log(`       ❌ UNUSED - Not referenced by any stack resources`);
      console.log(`       Fix: Consider deleting instead of importing`);
    }
  }
}
```

### 4. Update Frigg Repair to Handle Multiples

```javascript
// frigg repair --import <stack-name>

if (orphanAnalysis.multipleResourceTypes.includes('AWS::EC2::VPC')) {
  console.log('\n⚠ WARNING: Multiple VPCs detected');
  console.log('Please review and select which VPC to import:\n');

  const vpcs = orphanedResources.filter(o => o.resourceType === 'AWS::EC2::VPC');
  for (let i = 0; i < vpcs.length; i++) {
    const vpc = vpcs[i];
    console.log(`  ${i + 1}. ${vpc.physicalId} (${vpc.cidrBlock})`);
    console.log(`     Referenced: ${vpc.metadata.isReferencedByDrift ? 'Yes' : 'No'}`);
    console.log(`     Related Resources: ${vpc.metadata.relatedOrphans.length} subnets/SGs\n`);
  }

  // Prompt user to select or skip
  const selection = await promptUser('Select VPC number to import (or "skip" to skip all): ');

  if (selection === 'skip') {
    console.log('Skipping VPC import');
    // Remove VPCs from import list
  }
}
```

## Testing Strategy

### Test 1: Detect Unused Orphans
✅ 3 VPCs with CFN tags but NOT in stack, NOT referenced → mark as unused

### Test 2: Detect Referenced Non-Orphans
✅ Subnets in default VPC referenced by Lambdas but NOT orphaned → show in analysis

### Test 3: Multi-Resource Warning
✅ Multiple VPCs detected → show warning + require user selection

### Test 4: VPC Hierarchy Analysis
✅ VPC contains subnets → link orphaned subnets to orphaned VPC

## Benefits

1. **Prevents Bad Imports**: Users won't accidentally import unused old VPCs
2. **Clarifies Drift**: Explains why drift exists (using default VPC vs Frigg VPC)
3. **Cleanup Guidance**: Identifies resources that should be deleted, not imported
4. **Informed Decisions**: Shows relationships between resources before action
5. **Reduces Errors**: Requires explicit selection when multiple resources exist

## Next Steps

1. ✅ Write TDD tests for relationship analysis
2. ⬜ Implement `findOrphanedResourcesWithRelationships` method
3. ⬜ Implement `_extractReferencedResourceIds` helper
4. ⬜ Implement `_enrichWithRelationshipMetadata` helper
5. ⬜ Implement `analyzeOrphanSummary` method
6. ⬜ Update `CheckStackHealthUseCase` to use new method
7. ⬜ Update `frigg doctor` output to show warnings
8. ⬜ Update `frigg repair` to handle multiple resources
9. ⬜ Test with real acme-integrations-dev data
10. ⬜ Document relationship analysis in HEALTH.md
