# CloudFormation Resource Discovery Issue - Root Cause Analysis

## Executive Summary

**The Problem:** Every redeployment tries to delete and recreate resources instead of reusing them, ultimately failing with:
```
Template format error: Unresolved resource dependencies [FriggLambdaSecurityGroup]
```

**Root Cause:** Architectural mismatch between resource discovery and template generation. When resources are discovered from CloudFormation, they are NOT added to the new template, but other resources still reference them using CloudFormation `Ref` intrinsic functions, causing unresolved dependencies.

## The Fundamental Issue

### What's Happening Now (WRONG ❌)

1. **Discovery Phase:** CloudFormation discovery finds existing stack resources
   - VPC: `vpc-0cd17c0e06cb28b28`
   - Security Group: `sg-069629001ade41c9a` (logical ID: `FriggLambdaSecurityGroup`)
   - Aurora Cluster: `create-frigg-app-production-frigg-kms`

2. **VPC Builder Logic** (vpc-builder.js:432-443):
   ```javascript
   if (fromCfStack && existingLogicalIds.length > 0) {
       console.log('Skipping resource creation - will reuse existing CloudFormation resources');

       // ✅ CORRECT: Use physical ID
       if (discoveredResources.securityGroupId) {
           result.vpcConfig.securityGroupIds = [discoveredResources.securityGroupId];
           // e.g., ['sg-069629001ade41c9a']
       }

       // ❌ PROBLEM: Early return - doesn't add FriggLambdaSecurityGroup to template
       return;
   }
   ```

3. **Aurora Builder Logic** (aurora-builder.js:236-237, 291, 569):
   ```javascript
   // When creating new Aurora cluster
   VpcSecurityGroupIds: discoveredResources.vpcSecurityGroupIds || [
       { Ref: 'FriggLambdaSecurityGroup' },  // ❌ ALWAYS uses Ref
   ],

   // When creating ingress rule
   result.resources.FriggAuroraIngressRule = {
       Properties: {
           GroupId: { Ref: 'FriggLambdaSecurityGroup' },  // ❌ ALWAYS uses Ref
           SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },  // ❌ ALWAYS uses Ref
       },
   };
   ```

4. **Result:** CloudFormation template has:
   ```yaml
   Resources:
     # FriggLambdaSecurityGroup: NOT DEFINED (was discovered, not created)

     FriggAuroraIngressRule:
       Type: AWS::EC2::SecurityGroupIngress
       Properties:
         GroupId: !Ref FriggLambdaSecurityGroup  # ❌ UNRESOLVED DEPENDENCY
         SourceSecurityGroupId: !Ref FriggLambdaSecurityGroup  # ❌ UNRESOLVED
   ```

5. **CloudFormation Error:**
   ```
   Template format error: Unresolved resource dependencies [FriggLambdaSecurityGroup]
   ```

## Why This Happens

### Conceptual Misunderstanding

The current code conflates two different CloudFormation patterns:

**Pattern A: Resources in SAME Stack**
- Use CloudFormation intrinsic functions (`Ref`, `Fn::GetAtt`)
- Resources must be defined in the SAME template
- Example: `{ Ref: 'FriggLambdaSecurityGroup' }` expects `FriggLambdaSecurityGroup` in template

**Pattern B: Resources from DIFFERENT Stack or External**
- Use physical IDs directly (strings)
- Resources are NOT in the current template
- Example: `'sg-069629001ade41c9a'` (physical security group ID)

### Current Architecture Mix-Up

When resources are discovered from CloudFormation:
- VPC Builder treats them as **Pattern B** (doesn't add to template, uses physical IDs)
- Aurora Builder treats them as **Pattern A** (references logical IDs with `Ref`)
- Result: Unresolved dependencies

## What Should Happen

### Serverless Framework Best Practices (2025)

According to Serverless Framework best practices, there are **TWO valid approaches**:

---

### **Approach 1: Always Include All Resources in Template (Idempotent)**

**Concept:** Every deployment generates a COMPLETE template with ALL resources, even if they already exist.

**How CloudFormation Handles This:**
- When a resource already exists with the same logical ID and properties → **No action**
- When a resource already exists but properties changed → **Update**
- When a resource is missing from template but exists in stack → **Delete**
- When a resource is in template but doesn't exist in stack → **Create**

**Implementation:**
```javascript
// VPC Builder - ALWAYS create resources in template
async discoverVpc(appDefinition, discoveredResources, result) {
    const fromCfStack = discoveredResources.fromCloudFormationStack === true;

    if (fromCfStack) {
        // Resources exist in stack - still ADD them to template for idempotency
        result.resources.FriggLambdaSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: discoveredResources.defaultVpcId,  // Use discovered VPC
                // ... other properties
            },
        };

        // Reference using Ref (resource IS in template)
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];
    }
}

// Aurora Builder - can always use Ref
VpcSecurityGroupIds: [{ Ref: 'FriggLambdaSecurityGroup' }]
```

**Pros:**
✅ CloudFormation handles everything (idempotent)
✅ No unresolved dependencies
✅ Can use CloudFormation intrinsic functions (`Ref`, `Fn::GetAtt`)
✅ CloudFormation detects drift and configuration changes

**Cons:**
⚠️ Must ensure properties match exactly or CloudFormation will try to update/replace
⚠️ Requires careful handling of immutable properties (like VPC CIDR)

---

### **Approach 2: Use Physical IDs for External Resources**

**Concept:** Resources NOT in current template are referenced by physical ID (string), not logical ID.

**Implementation:**
```javascript
// VPC Builder - track if resource is in template
async discoverVpc(appDefinition, discoveredResources, result) {
    const fromCfStack = discoveredResources.fromCloudFormationStack === true;

    if (fromCfStack) {
        // DON'T add resource to template
        // Use physical ID directly
        result.vpcConfig.securityGroupIds = [discoveredResources.securityGroupId];
        // e.g., ['sg-069629001ade41c9a']

        // ✅ CRITICAL: Mark that this resource is NOT in template
        result.securityGroupIsExternal = true;
        result.externalSecurityGroupId = discoveredResources.securityGroupId;
    } else {
        // Add resource to template
        result.resources.FriggLambdaSecurityGroup = { ... };
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];
        result.securityGroupIsExternal = false;
    }
}

// Aurora Builder - check if resource is external
VpcSecurityGroupIds: buildResults.VpcBuilder.securityGroupIsExternal
    ? [buildResults.VpcBuilder.externalSecurityGroupId]  // Use physical ID
    : [{ Ref: 'FriggLambdaSecurityGroup' }]  // Use Ref

// Ingress rule
if (buildResults.VpcBuilder.securityGroupIsExternal) {
    result.resources.FriggAuroraIngressRule = {
        Properties: {
            GroupId: buildResults.VpcBuilder.externalSecurityGroupId,  // Physical ID
            SourceSecurityGroupId: buildResults.VpcBuilder.externalSecurityGroupId,
        },
    };
} else {
    result.resources.FriggAuroraIngressRule = {
        Properties: {
            GroupId: { Ref: 'FriggLambdaSecurityGroup' },  // Logical reference
            SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
        },
    };
}
```

**Pros:**
✅ Clear separation between managed vs. external resources
✅ Prevents accidental resource deletion
✅ Smaller CloudFormation templates

**Cons:**
⚠️ More complex logic to track which resources are in template
⚠️ Can't use CloudFormation intrinsic functions for external resources
⚠️ Harder to detect drift

---

## Recommended Solution: Approach 1 (Idempotent Templates)

**Recommendation: Use Approach 1** - Always include all resources in the template.

### Why Approach 1 is Better for Frigg

1. **Simpler Logic:** No need to track which resources are external vs. managed
2. **CloudFormation Native:** Leverages CloudFormation's built-in idempotency
3. **DDD/Hexagonal Friendly:** Each builder is responsible for its own resources
4. **TDD Friendly:** Easier to test - always generate complete template
5. **Drift Detection:** CloudFormation can detect configuration drift
6. **Resource Lifecycle:** CloudFormation manages full lifecycle (create, update, delete)

### Implementation Plan

#### Phase 1: Fix VPC Builder

**File:** `domains/networking/vpc-builder.js`

**Change:** Stop early-returning when resources are discovered. Always add resources to template.

```javascript
async discoverVpc(appDefinition, discoveredResources, result) {
    console.log('  Discovering existing VPC...');

    const fromCfStack = discoveredResources.fromCloudFormationStack === true;
    const existingLogicalIds = discoveredResources.existingLogicalIds || [];

    if (fromCfStack && existingLogicalIds.length > 0) {
        console.log(`  ✓ VPC discovered from CloudFormation stack: ${discoveredResources.stackName}`);
        console.log(`  ✓ Found ${existingLogicalIds.length} existing resources in stack`);
        console.log('  ℹ Adding resources to template for idempotent deployment');

        // ✅ ADD RESOURCES TO TEMPLATE (don't skip)
        // Use discovered physical IDs in resource properties

        // VPC - only if not already managed
        if (!existingLogicalIds.includes('FriggVPC')) {
            // VPC doesn't exist - this is just metadata, not creating
        }

        // Always create Lambda security group in template
        result.resources.FriggLambdaSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: discoveredResources.defaultVpcId,  // Use discovered VPC ID
                SecurityGroupEgress: [ /* ... */ ],
                Tags: [ /* ... */ ],
            },
        };

        // Reference using Ref (resource IS in template)
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

        // Don't return early - continue to add other resources
    } else {
        // VPC discovered from AWS API (not from CF stack)
        // Create security group in discovered VPC
        result.resources.FriggLambdaSecurityGroup = { /* ... */ };
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];
    }

    result.vpcId = discoveredResources.defaultVpcId;
    console.log(`  ✅ VPC configuration complete`);
}
```

#### Phase 2: Fix Aurora Builder

**File:** `domains/database/aurora-builder.js`

**Change:** No changes needed if VPC Builder always provides `FriggLambdaSecurityGroup` in template.

However, should handle case where Aurora cluster is discovered:

```javascript
async discoverAurora(discoveredResources, result) {
    const fromCfStack = discoveredResources.fromCloudFormationStack === true;

    if (fromCfStack && discoveredResources.existingLogicalIds.includes('FriggAuroraCluster')) {
        console.log('  ✓ Aurora cluster discovered from CloudFormation stack');
        console.log('  ℹ Adding Aurora resources to template for idempotent deployment');

        // ✅ ADD Aurora cluster to template (even though it exists)
        result.resources.FriggAuroraCluster = {
            Type: 'AWS::RDS::DBCluster',
            Properties: {
                Engine: 'aurora-postgresql',
                // Use discovered values to ensure idempotency
                MasterUsername: /* from discovered secret */,
                DBSubnetGroupName: { Ref: 'FriggDBSubnetGroup' },
                VpcSecurityGroupIds: [{ Ref: 'FriggLambdaSecurityGroup' }],
                // ... other properties
            },
        };

        // Always create ingress rule
        result.resources.FriggAuroraIngressRule = {
            Type: 'AWS::EC2::SecurityGroupIngress',
            Properties: {
                GroupId: { Ref: 'FriggLambdaSecurityGroup' },
                SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                // ... other properties
            },
        };
    } else {
        // Create new Aurora cluster (existing logic)
    }
}
```

#### Phase 3: Handle Immutable Properties

**Challenge:** Some CloudFormation resources have immutable properties (can't be changed without replacement).

**Examples:**
- VPC `CidrBlock` - can't be changed
- Aurora `MasterUsername` - can't be changed
- Security Group `VpcId` - can't be changed

**Solution:** When adding discovered resources to template, use exact same property values as original deployment.

**Implementation:** Store key properties in CloudFormation Outputs during first deployment, then read them during discovery:

```javascript
// First deployment - add outputs
outputs: {
    VpcCidrBlock: {
        Value: { 'Fn::GetAtt': ['FriggVPC', 'CidrBlock'] },
    },
    AuroraMasterUsername: {
        Value: '${self:custom.database.masterUsername}',
    },
}

// Subsequent deployments - use outputs
const vpcCidr = discoveredResources.outputs.VpcCidrBlock || '10.0.0.0/16';
const dbUsername = discoveredResources.outputs.AuroraMasterUsername || 'frigg_admin';
```

#### Phase 4: Update Tests

Update tests to expect resources to ALWAYS be in template:

**Example Test Change:**

```javascript
// OLD TEST (WRONG)
it('should NOT create FriggLambdaSecurityGroup when discovered from CloudFormation', () => {
    const result = await builder.build(appDefinition, discoveredResources);
    expect(result.resources.FriggLambdaSecurityGroup).toBeUndefined();  // ❌ WRONG
});

// NEW TEST (CORRECT)
it('should create FriggLambdaSecurityGroup in template even when discovered from CloudFormation', () => {
    const result = await builder.build(appDefinition, discoveredResources);
    expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();  // ✅ CORRECT
    expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-discovered');
    expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
});
```

---

## The Two Use Cases

### Case 1: Stack exists, built by serverless - use those resources and add new ones

**Scenario:** Redeploying to existing stage (e.g., `production`)

**Current Behavior (BROKEN):**
1. Discovery finds existing stack resources
2. VPC Builder skips creating resources in template
3. Aurora Builder references non-existent resources
4. Deployment fails

**Correct Behavior (FIXED):**
1. Discovery finds existing stack resources
2. VPC Builder ADDS resources to template (with same properties)
3. Aurora Builder references resources via `Ref` (they're in template)
4. CloudFormation sees resources already exist with same properties → **No action**
5. Deployment succeeds

**Key Insight:** CloudFormation is idempotent - it won't recreate resources if they already exist with same properties.

---

### Case 2: Stack exists with external resources - use those and add stack-managed ones

**Scenario:** Using existing VPC/Aurora from another stack or created manually

**Example:**
- Shared VPC across all stages: `vpc-shared-production`
- Stage-specific Aurora cluster: managed by this stack

**Current Behavior (BROKEN):**
1. Discovery finds external VPC
2. VPC Builder skips creating VPC (correct)
3. VPC Builder creates security group using external VPC ID
4. But references it with `Ref` → may or may not work depending on timing

**Correct Behavior (FIXED - Approach 1):**
1. Discovery finds external VPC: `vpc-shared-production`
2. VPC Builder creates security group in template:
   ```javascript
   FriggLambdaSecurityGroup: {
       Type: 'AWS::EC2::SecurityGroup',
       Properties: {
           VpcId: 'vpc-shared-production',  // ✅ External VPC (physical ID)
           // ...
       }
   }
   ```
3. Aurora Builder references security group:
   ```javascript
   VpcSecurityGroupIds: [{ Ref: 'FriggLambdaSecurityGroup' }]  // ✅ In template
   ```
4. CloudFormation creates security group in external VPC
5. Deployment succeeds

**Key Insight:** External resources (VPC) use physical IDs in Properties. Managed resources (Security Group) are in template and referenced via `Ref`.

---

## Alternative: Cross-Stack References (Advanced)

For truly shared infrastructure, use CloudFormation cross-stack references:

**Shared Infrastructure Stack:** `frigg-shared-production`
```yaml
Resources:
  SharedVPC:
    Type: AWS::EC2::VPC

Outputs:
  VpcId:
    Value: !Ref SharedVPC
    Export:
      Name: frigg-shared-production-VpcId
```

**Application Stack:** `create-frigg-app-production`
```yaml
Resources:
  FriggLambdaSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !ImportValue frigg-shared-production-VpcId  # Cross-stack reference
```

**Pros:**
✅ CloudFormation manages dependencies
✅ Prevents accidental deletion (can't delete exported value if imported)
✅ Type-safe references

**Cons:**
⚠️ More complex stack management
⚠️ Tight coupling between stacks
⚠️ Need to manage stack creation order

**Recommendation:** Keep using Approach 1 for now. Consider cross-stack references if you need strict dependency management across multiple teams/environments.

---

## Summary of Changes Needed

### 1. VPC Builder (vpc-builder.js)
- **Remove early return** when resources discovered from CloudFormation (line 443)
- **Always add resources to template** (even if they exist)
- **Use discovered physical IDs** in resource properties (e.g., VpcId)
- **Always use `Ref`** in vpcConfig (resources are in template)

### 2. Aurora Builder (aurora-builder.js)
- **Add discovered Aurora to template** when found in CloudFormation
- **Keep using `Ref`** for FriggLambdaSecurityGroup (will always be in template after fix #1)
- **Ensure subnet groups and security groups** are added to template

### 3. KMS Builder (kms-builder.js)
- **Add discovered KMS key to template** when found in CloudFormation
- **Keep using `Ref`** for key references

### 4. Tests
- **Update all tests** to expect resources in template even when discovered
- **Test idempotency** - deploying twice should succeed without changes

### 5. Discovery System
- **Add CloudFormation Outputs** for immutable properties
- **Read outputs during discovery** to use same values in template

---

## Testing Strategy (TDD)

### Test 1: Idempotent Deployment
```javascript
it('should deploy successfully twice with no changes', async () => {
    // First deployment
    const result1 = await deploy(appDefinition);
    expect(result1.status).toBe('success');

    // Second deployment (no changes)
    const result2 = await deploy(appDefinition);
    expect(result2.status).toBe('success');
    expect(result2.changeSet).toHaveLength(0);  // No changes
});
```

### Test 2: Resource Reuse
```javascript
it('should reuse discovered resources without recreation', async () => {
    const discoveredResources = {
        fromCloudFormationStack: true,
        securityGroupId: 'sg-existing',
        defaultVpcId: 'vpc-existing',
    };

    const result = await builder.build(appDefinition, discoveredResources);

    // Resource should be in template
    expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();

    // Should use discovered VPC
    expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-existing');

    // Should reference via Ref
    expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
});
```

### Test 3: External Resources
```javascript
it('should use external VPC with managed security group', async () => {
    const appDefinition = {
        vpc: {
            management: 'use-existing',
            vpcId: 'vpc-external-shared',
        },
    };

    const result = await builder.build(appDefinition, {});

    // Security group should be in template
    expect(result.resources.FriggLambdaSecurityGroup).toBeDefined();

    // Should use external VPC (physical ID)
    expect(result.resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe('vpc-external-shared');

    // Should reference security group via Ref
    expect(result.vpcConfig.securityGroupIds).toEqual([{ Ref: 'FriggLambdaSecurityGroup' }]);
});
```

---

## Next Steps

1. **Review this diagnosis** with team
2. **Confirm approach** (recommend Approach 1)
3. **Write failing tests** for idempotent deployments
4. **Implement VPC Builder fix**
5. **Implement Aurora Builder fix**
6. **Implement KMS Builder fix**
7. **Update all tests**
8. **Test against real AWS account**
9. **Document new behavior**

---

## References

- [Serverless Framework CloudFormation Resources](https://www.serverless.com/framework/docs/providers/aws/guide/resources)
- [CloudFormation Template Anatomy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html)
- [CloudFormation Intrinsic Functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)
- [CloudFormation Cross-Stack References](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/walkthrough-crossstackref.html)
- [Idempotency in Infrastructure as Code](https://theburningmonk.com/2023/01/this-is-why-you-should-keep-stateful-and-stateless-resources-together/)
