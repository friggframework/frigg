# Frigg IAM Policy Templates

This directory contains IAM policy templates for deploying Frigg applications with the appropriate permissions.

## Quick Start

For immediate deployment, you have two ready-to-use IAM policy options:

### Option 1: Basic Policy (Recommended for getting started)
```bash
# Use the basic policy for core Frigg functionality
aws iam put-user-policy \
  --user-name frigg-deployment-user \
  --policy-name FriggBasicDeploymentPolicy \
  --policy-document file://iam-policy-basic.json
```

**Includes permissions for:**
- ✅ AWS Discovery (finding your VPC, subnets, security groups)
- ✅ CloudFormation stacks (deploy/update Frigg applications)
- ✅ Lambda functions (create and manage serverless functions)
- ✅ Lambda EventSourceMappings (connect Lambda to SQS, SNS, Kinesis)
- ✅ API Gateway (HTTP endpoints for your integrations)
- ✅ SQS/SNS (message queues and notifications)
- ✅ S3 (deployment artifacts, including bucket tagging)
- ✅ CloudWatch/Logs (monitoring and logging)
- ✅ IAM roles (Lambda execution roles)

### Option 2: Full Policy (All features enabled)
```bash
# Use the full policy for advanced Frigg features
aws iam put-user-policy \
  --user-name frigg-deployment-user \
  --policy-name FriggFullDeploymentPolicy \
  --policy-document file://iam-policy-full.json
```

**Includes everything from Basic Policy PLUS:**
- ✅ **VPC Management** - Create route tables, NAT gateways, VPC endpoints
- ✅ **KMS Encryption** - Field-level encryption for sensitive data
- ✅ **SSM Parameter Store** - Secure configuration management

## When to Use Which Policy

### Use Basic Policy When:
- Getting started with Frigg
- Building simple integrations without VPC requirements
- You want minimal AWS permissions
- You're not handling sensitive data requiring encryption

### Use Full Policy When:
- You need VPC isolation for security/compliance
- You're handling sensitive data requiring KMS encryption
- You want to use SSM Parameter Store for configuration
- You're deploying production applications

## Current Issue Resolution

**If you're seeing the error:** `User is not authorized to perform: ec2:CreateRouteTable`

This means your current deployment user doesn't have VPC permissions. You have two options:

### Quick Fix: Apply Full Policy
```bash
aws iam put-user-policy \
  --user-name frigg-deployment-user \
  --policy-name FriggFullDeploymentPolicy \
  --policy-document file://iam-policy-full.json
```

### Alternative: Update CloudFormation Stack
If you deployed using the CloudFormation template, update it with VPC support:
```bash
aws cloudformation update-stack \
  --stack-name frigg-deployment-iam \
  --template-body file://frigg-deployment-iam-stack.yaml \
  --parameters ParameterKey=EnableVPCSupport,ParameterValue=true \
  --capabilities CAPABILITY_IAM
```

## Using the IAM Generator

For custom policy generation based on your app definition:

```javascript
const { generateIAMPolicy, generateIAMCloudFormation, getFeatureSummary } = require('./iam-generator');

// Generate basic JSON policy
const basicPolicy = generateIAMPolicy('basic');

// Generate full JSON policy
const fullPolicy = generateIAMPolicy('full');

// Generate CloudFormation template with auto-detected features
const summary = getFeatureSummary(appDefinition);
const template = generateIAMCloudFormation({
    appName: summary.appName,
    features: summary.features,
    userPrefix: 'frigg-deployment-user',
    stackName: 'frigg-deployment-iam'
});

// Or manually specify features
const customTemplate = generateIAMCloudFormation({
    appName: 'my-app',
    features: {
        vpc: true,
        kms: true,
        ssm: true,
        websockets: false
    },
    userPrefix: 'my-deployment-user',
    stackName: 'my-deployment-stack'
});
```

### Feature Detection

Use `getFeatureSummary(appDefinition)` to automatically detect features from your app definition:

```javascript
const summary = getFeatureSummary(appDefinition);
// Returns: { appName, features: { core, vpc, kms, ssm, websockets }, integrationCount }
```

## Security Best Practices

### Resource Scoping
Both policies are scoped to resources containing "frigg" in their names:
- ✅ `my-frigg-app-prod` (will work)
- ❌ `my-integration-app` (won't work - missing "frigg")

### Account-Specific Resources
Replace `*` with your AWS account ID for tighter security:
```json
{
  "Resource": [
    "arn:aws:lambda:us-east-1:123456789012:function:*frigg*"
  ]
}
```

### Environment-Specific Policies
Consider separate policies for different environments:
- `frigg-dev-policy` (full permissions for development)
- `frigg-prod-policy` (restricted permissions for production)

## Troubleshooting

### Common Permission Errors

1. **"ec2:CreateRouteTable" error** → Use Full Policy
2. **"kms:GenerateDataKey" error** → Enable KMS in your policy
3. **"ssm:GetParameter" error** → Enable SSM in your policy
4. **Lambda VPC errors** → Ensure VPC permissions are enabled
5. **"lambda:DeleteEventSourceMapping" error** → Update to latest policy (includes EventSourceMapping permissions)
6. **"ec2:DeleteVpcEndpoints" error** → Update IAM policy to use `ec2:DeleteVpcEndpoints` (plural) instead of `ec2:DeleteVpcEndpoint`
7. **"s3:PutBucketTagging" error** → Update to latest policy (includes S3 bucket tagging permissions)

### Validation
Test your policy by deploying a simple Frigg app:
```bash
npx create-frigg-app test-deployment
cd test-deployment
frigg deploy
```

### Policy Comparison

| Feature | Basic Policy | Full Policy | CloudFormation Template |
|---------|--------------|-------------|-------------------------|
| Core Deployment | ✅ | ✅ | ✅ |
| VPC Management | ❌ | ✅ | ✅ (conditional) |
| KMS Encryption | ❌ | ✅ | ✅ (conditional) |
| SSM Parameters | ❌ | ✅ | ✅ (conditional) |
| Format | JSON | JSON | YAML with parameters |
| Use Case | Getting started | Production ready | Infrastructure as Code |

## Files in this Directory

- `iam-policy-basic.json` - Core Frigg permissions only (JSON format)
- `iam-policy-full.json` - All features enabled (JSON format)
- `frigg-deployment-iam-stack.yaml` - CloudFormation template with conditional parameters
- `iam-generator.js` - Programmatic policy generation with basic/full/auto modes
- `AWS-IAM-CREDENTIAL-NEEDS.md` - Detailed permission explanations and troubleshooting
- `IAM-POLICY-TEMPLATES.md` - This file - Quick start guide and usage examples

## Support

If you encounter permission issues:
1. Check the error message for the specific missing permission
2. Verify your resource names contain "frigg"
3. Consider upgrading from Basic to Full policy
4. Review the AWS-IAM-CREDENTIAL-NEEDS.md for detailed explanations