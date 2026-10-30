# acme-integrations-dev Stack Drift Analysis

**Date**: 2025-10-27
**Stack**: acme-integrations-dev (us-east-1)
**Status**: 65/100 Health Score (degraded)

## Executive Summary

The Lambda functions were **manually moved from Frigg VPC to Default VPC**, causing:
- ✅ 16 orphaned resources (3 VPCs, 10 subnets, 3 security groups) - correctly detected
- ⚠️ 32 property mismatch warnings (VPC drift on all 16 Lambda functions)

**The template expects** Lambdas to use Frigg-managed VPC `vpc-0eadd96976d29ede7`.
**But Lambdas actually use** AWS default VPC `vpc-01f21101d4ed6db59`.

## Detailed Analysis

### CloudFormation Template Expectations

The template specifies Lambda functions should use:

```yaml
VpcConfig:
  SecurityGroupIds:
    - sg-07c01370e830b6ad6        # Frigg Lambda SG (in vpc-0eadd96976d29ede7)
  SubnetIds:
    - subnet-00ab9e0502e66aac3      # Private subnet 1 (in vpc-0eadd96976d29ede7)
    - subnet-00d085a52937aaf91      # Private subnet 2 (in vpc-0eadd96976d29ede7)
```

**These resources belong to:** `vpc-0eadd96976d29ede7` (10.0.0.0/16)

### Actual Lambda Configuration

Lambda functions are actually running in:

```json
{
  "VpcId": "vpc-01f21101d4ed6db59",    // AWS Default VPC (172.31.0.0/16)
  "SecurityGroupIds": [
    "sg-0aca40438d17344c4"             // Default VPC security group (NOT in template)
  ],
  "SubnetIds": [
    "subnet-020d32e3ca398a041",        // Default VPC subnet 1 (NOT in template)
    "subnet-0c186318804aba790"         // Default VPC subnet 2 (NOT in template)
  ]
}
```

**These resources belong to:** `vpc-01f21101d4ed6db59` (172.31.0.0/16) - AWS Default VPC

### Orphaned Resources Analysis

#### 1. VPC: vpc-0eadd96976d29ede7 (10.0.0.0/16) ✅ CORRECT VPC TO IMPORT

**Status:**
- Has CloudFormation tags: `stack-name=acme-integrations-dev`, `logical-id=FriggVPC`
- NOT in CloudFormation stack (stack has 0 VPCs managed)
- Contains subnets that are **EXPECTED by template**:
  - `subnet-00ab9e0502e66aac3` (10.0.0.0/24) - Expected by template ✅
  - `subnet-00d085a52937aaf91` (10.0.1.0/24) - Expected by template ✅
- Contains security group that is **EXPECTED by template**:
  - `sg-07c01370e830b6ad6` - Expected by template ✅

**Conclusion:** This is the **CORRECT VPC** that should be imported! The template expects Lambdas to use this VPC, but they were manually moved to default VPC.

**Stage Verification:** Has `STAGE=dev` tag ✅

#### 2. VPC: vpc-0e2351eac99adcb83 (10.0.0.0/16) - OLD/DUPLICATE

**Status:**
- Has CloudFormation tags: `stack-name=acme-integrations-dev`, `logical-id=FriggVPC`
- NOT in CloudFormation stack
- Contains orphaned subnets NOT referenced by template
- Same CIDR as vpc-0eadd96976d29ede7 (duplicate)

**Conclusion:** Old/duplicate VPC, should be **DELETED**

**Stage Verification:** Has `STAGE=dev` tag

#### 3. VPC: vpc-020a0365610c05f0b (10.0.0.0/16) - OLD/DUPLICATE

**Status:**
- Has CloudFormation tags: `stack-name=acme-integrations-dev`, `logical-id=FriggVPC`
- NOT in CloudFormation stack
- Contains orphaned subnets NOT referenced by template
- Same CIDR as vpc-0eadd96976d29ede7 (duplicate)

**Conclusion:** Old/duplicate VPC, should be **DELETED**

**Stage Verification:** Has `STAGE=dev` tag

## What Happened?

1. **Initial Deployment**: CloudFormation created `vpc-0eadd96976d29ede7` with subnets and security groups
2. **VPC Removed from Stack**: VPC was removed from CloudFormation management (but resources still exist)
3. **Manual Migration**: Lambda functions were manually updated to use default VPC instead
4. **Result**: Template expects Frigg VPC, but Lambdas use default VPC → drift

## Recommended Actions

### Option 1: Import Frigg VPC and Let CloudFormation Fix Drift (RECOMMENDED)

**Steps:**

1. **Import the correct VPC and its resources:**
   ```bash
   # Import vpc-0eadd96976d29ede7 and its subnets/SG
   frigg repair --import quo-integrations-dev
   # When prompted, select ONLY vpc-0eadd96976d29ede7
   ```

2. **CloudFormation will automatically update Lambdas:**
   - CloudFormation will detect the VPC/subnet/SG mismatch
   - Next stack update will **automatically** update Lambda VPC configs
   - Lambdas will be moved from default VPC back to Frigg VPC

3. **Delete the duplicate VPCs:**
   ```bash
   aws ec2 delete-vpc --vpc-id vpc-0e2351eac99adcb83
   aws ec2 delete-vpc --vpc-id vpc-020a0365610c05f0b
   ```

**CloudFormation Behavior:**
- ✅ YES, CloudFormation WILL automatically update Lambda VPC configs
- ✅ CloudFormation will handle the migration safely (blue-green deployment)
- ✅ No downtime - new Lambda versions created, traffic switched over

**Benefits:**
- ✅ Stack returns to intended state (Lambdas in Frigg VPC)
- ✅ Health score improves to 100/100
- ✅ Proper VPC isolation restored
- ✅ CloudFormation manages all resources again

**Risks:**
- ⚠️ Lambda cold starts during VPC migration (~10-30 seconds)
- ⚠️ Must ensure Frigg VPC networking is configured correctly

### Option 2: Update Template to Use Default VPC (NOT RECOMMENDED)

**Steps:**

1. Update serverless.yml to remove VPC configuration
2. Deploy stack update
3. Delete all 3 orphaned Frigg VPCs

**Why NOT recommended:**
- ❌ Loses VPC isolation benefits
- ❌ Lambda functions exposed to internet (less secure)
- ❌ Shared default VPC across all accounts
- ❌ No control over networking

### Option 3: Delete All and Let CloudFormation Recreate (RISKY)

**Steps:**

1. Delete all 3 orphaned VPCs
2. Add VPC back to CloudFormation template
3. Deploy stack update

**Why RISKY:**
- ❌ CloudFormation will create NEW VPC with different ID
- ❌ Requires stack update to fix Lambda drift
- ❌ More disruptive than import

## Answering Your Questions

### Q1: What are the drifted properties?

**Answer:**
- **Expected** (from template): Subnets in `vpc-0eadd96976d29ede7` (Frigg VPC)
- **Actual** (in AWS): Subnets in `vpc-01f21101d4ed6db59` (default VPC)
- **Cause**: Lambdas were manually moved to default VPC

### Q2: Will CloudFormation migrate Lambdas if we import the VPC?

**Answer:** ✅ **YES!**

When you import `vpc-0eadd96976d29ede7` and its subnets/SG:
1. CloudFormation will recognize the resources exist
2. Next stack update will detect Lambda VPC config drift
3. CloudFormation will automatically update Lambda functions to use imported VPC
4. Migration happens safely with blue-green deployment (no downtime)

### Q3: What's the right approach?

**Answer:** **Import `vpc-0eadd96976d29ede7` and delete the other 2 VPCs**

This VPC is the one the template expects, and it contains the correct subnets/SG that match the template.

### Q4: Are these VPCs intended for -dev stage?

**Answer:** ✅ **YES, all 3 VPCs have `STAGE=dev` tags**

But only `vpc-0eadd96976d29ede7` contains the resources referenced by the template. The other 2 are duplicates/old deployments.

## Implementation Plan

1. ✅ **Verify VPC networking is correct:**
   ```bash
   # Check route tables, NAT gateways, internet gateways
   aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0eadd96976d29ede7"
   aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=vpc-0eadd96976d29ede7"
   ```

2. ✅ **Import the correct VPC:**
   ```bash
   frigg repair --import quo-integrations-dev
   # Select: vpc-0eadd96976d29ede7 ONLY
   # Select: All subnets in vpc-0eadd96976d29ede7
   # Select: sg-07c01370e830b6ad6
   ```

3. ✅ **Deploy stack update to fix Lambda drift:**
   ```bash
   frigg deploy --stage dev
   # CloudFormation will update Lambda VPC configs automatically
   ```

4. ✅ **Verify Lambdas migrated successfully:**
   ```bash
   aws lambda get-function-configuration --function-name quo-integrations-dev-attio \
     --query 'VpcConfig.{VpcId:VpcId,SubnetIds:SubnetIds}'
   ```

5. ✅ **Delete duplicate VPCs:**
   ```bash
   # Delete subnets first, then VPCs
   aws ec2 delete-vpc --vpc-id vpc-0e2351eac99adcb83
   aws ec2 delete-vpc --vpc-id vpc-020a0365610c05f0b
   ```

6. ✅ **Re-run health check:**
   ```bash
   frigg doctor quo-integrations-dev
   # Should show 100/100 health score
   ```

## Next Steps for Relationship Analysis Implementation

Based on this real-world scenario, the relationship analysis should:

1. **Detect template-expected resources:**
   - Parse CloudFormation template to find expected VPC config
   - Extract subnet IDs, security group IDs from template

2. **Match orphans against expected resources:**
   - `vpc-0eadd96976d29ede7` contains expected subnets → **HIGH priority import**
   - Other VPCs don't contain expected resources → **LOW priority (delete)**

3. **Show recommendation:**
   ```
   ⚠ Multiple VPCs detected (3 orphaned)

   Analysis:
     1. vpc-0eadd96976d29ede7 - Contains resources expected by template [IMPORT THIS]
        - subnet-00ab9e0502e66aac3 (expected)
        - subnet-00d085a52937aaf91 (expected)
        - sg-07c01370e830b6ad6 (expected)

     2. vpc-0e2351eac99adcb83 - No expected resources [DELETE]
     3. vpc-020a0365610c05f0b - No expected resources [DELETE]

   Recommendation:
     ✅ Import vpc-0eadd96976d29ede7 to restore template compliance
     ❌ Delete vpc-0e2351eac99adcb83 and vpc-020a0365610c05f0b (old/unused)
   ```
