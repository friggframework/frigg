# AWS Discovery Troubleshooting Guide

## Overview

AWS Discovery automatically finds your default AWS resources (VPC, subnets, security groups, KMS keys) during the build process. This eliminates the need to manually specify resource IDs in your configuration.

## When AWS Discovery Runs

AWS Discovery runs automatically during `frigg build` and `frigg deploy` when your AppDefinition includes:

- `vpc.enable: true` - VPC support
- `encryption.useDefaultKMSForFieldLevelEncryption: true` - KMS encryption
- `ssm.enable: true` - SSM Parameter Store

## Fail-Fast Behavior

⚠️ **Important:** If you enable these features, discovery **must succeed**. The build will fail if:
- AWS credentials are missing or invalid
- Required AWS permissions are not granted
- No VPC/subnets exist in your region
- Discovery times out or encounters errors

This prevents deployments with incorrect or missing AWS resources, which could cause security issues or deployment failures.

## Common Issues

### 1. "Variables resolution errored" - Environment Variables Not Found

**Error:**
```
Cannot resolve variable at "provider.vpc.securityGroupIds.0": Value not found at "env" source
Cannot resolve variable at "provider.vpc.subnetIds.0": Value not found at "env" source
```

**Cause:** AWS discovery didn't run or failed to set environment variables.

**Solutions:**

#### Option A: Run Discovery Manually
```bash
# Run discovery before building
node node_modules/@friggframework/devtools/infrastructure/run-discovery.js

# Then build
npx frigg build
```

#### Option B: Check Prerequisites
1. **AWS Credentials:** Ensure AWS CLI is configured
   ```bash
   aws configure list
   aws sts get-caller-identity
   ```

2. **IAM Permissions:** User needs discovery permissions (see [AWS-IAM-CREDENTIAL-NEEDS.md](./AWS-IAM-CREDENTIAL-NEEDS.md))
   - `sts:GetCallerIdentity`
   - `ec2:DescribeVpcs`
   - `ec2:DescribeSubnets`
   - `ec2:DescribeSecurityGroups`
   - `ec2:DescribeRouteTables`
   - `kms:ListKeys`
   - `kms:DescribeKey`

3. **Default VPC:** Ensure you have a VPC in your AWS region
   ```bash
   aws ec2 describe-vpcs --region us-east-1
   ```

### 2. AWS SDK Not Installed

**Error:**
```bash
🚨 AWS SDK not installed!
Cannot find module '@aws-sdk/client-ec2'
```

**Cause:** AWS SDK dependencies are only installed when needed to keep bundle size minimal.

**Solution:**
```bash
# Install required AWS SDK packages
npm install @aws-sdk/client-ec2 @aws-sdk/client-kms @aws-sdk/client-sts

# Then run discovery
npx frigg build
```

**Note:** AWS SDK is optional - only install if you use VPC/KMS/SSM features.

### 3. No Default VPC Found

**Error:**
```
No VPC found in the account
```

**Cause:** Your AWS account doesn't have a default VPC or any VPCs in the current region.

**Solutions:**

#### Option A: Create Default VPC
```bash
aws ec2 create-default-vpc --region us-east-1
```

#### Option B: Disable VPC in AppDefinition
```javascript
// backend/index.js
const appDefinition = {
    // ... other config
    vpc: {
        enable: false  // Disable VPC support
    }
};
```

### 4. Permission Denied During Discovery

**Error:**
```
User: arn:aws:iam::123456789012:user/my-user is not authorized to perform: ec2:DescribeVpcs
```

**Cause:** IAM user lacks discovery permissions.

**Solution:**
1. Update IAM policy with discovery permissions
2. Or generate a custom IAM stack:
   ```bash
   npx frigg generate-iam
   aws cloudformation deploy --template-file backend/infrastructure/frigg-deployment-iam.yaml --stack-name frigg-deployment-iam --capabilities CAPABILITY_NAMED_IAM
   ```

### 5. Region Configuration Issues

**Error:**
```
No subnets found in VPC vpc-123456789
```

**Cause:** AWS discovery is looking in the wrong region or region has no subnets.

**Solutions:**

#### Option A: Set AWS Region
```bash
export AWS_REGION=us-east-1
npx frigg build
```

#### Option B: Check Current Region
```bash
aws configure get region
aws ec2 describe-availability-zones --query 'AvailabilityZones[0].RegionName'
```

## Manual Override

If AWS discovery continues to fail, you can manually set environment variables:

```bash
# Find your actual resource IDs
aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-12345678" --query 'Subnets[0:2].SubnetId' --output text

# Set before building
export AWS_DISCOVERY_VPC_ID=vpc-12345678
export AWS_DISCOVERY_SECURITY_GROUP_ID=sg-12345678
export AWS_DISCOVERY_SUBNET_ID_1=subnet-12345678
export AWS_DISCOVERY_SUBNET_ID_2=subnet-87654321
export AWS_DISCOVERY_PUBLIC_SUBNET_ID=subnet-abcdef12
export AWS_DISCOVERY_ROUTE_TABLE_ID=rtb-12345678
export AWS_DISCOVERY_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012

npx frigg build
```

**⚠️ Important:** Use real AWS resource IDs, not placeholder values. Fake IDs will cause deployment failures.

## Debugging Discovery

### Enable Verbose Logging
```bash
npx frigg build --verbose
```

### Test Discovery Standalone
```bash
# Test discovery without building
node node_modules/@friggframework/devtools/infrastructure/run-discovery.js
```

### Check Environment Variables
```bash
# After running discovery
printenv | grep AWS_DISCOVERY
```

## Recovery Steps

If you're stuck, try this recovery process:

1. **Verify AWS Setup**
   ```bash
   aws sts get-caller-identity
   aws ec2 describe-vpcs --region us-east-1
   ```

2. **Check App Definition**
   ```bash
   # Ensure your backend/index.js exports Definition correctly
   node -e "console.log(require('./backend/index.js').Definition)"
   ```

3. **Run Discovery Manually**
   ```bash
   node node_modules/@friggframework/devtools/infrastructure/run-discovery.js
   ```

4. **Disable Features Temporarily**
   ```javascript
   // backend/index.js - temporarily disable problematic features
   const appDefinition = {
       vpc: { enable: false },
       encryption: { useDefaultKMSForFieldLevelEncryption: false },
       ssm: { enable: false }
   };
   ```

5. **Build and Test**
   ```bash
   npx frigg build
   ```

## Getting Help

If discovery continues to fail:

1. **Check logs** for specific error messages
2. **Verify IAM permissions** using the generated IAM stack
3. **Test AWS CLI access** in your target region
4. **Review AppDefinition** for correct feature flags
5. **Try fallback values** as a temporary workaround

The discovery system is designed to be resilient, but AWS environment differences can cause issues. Most problems are related to IAM permissions or missing AWS resources in the target region.