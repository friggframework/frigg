# AWS IAM Credential Requirements for Frigg Applications

This document outlines the minimum AWS IAM permissions required to build and deploy Frigg applications with VPC, KMS, and SSM support.

## Overview

Frigg applications require two distinct sets of permissions:

1. **Discovery-Time Permissions** - Used during the build process to discover default AWS resources
2. **Deployment-Time Permissions** - Used during actual deployment to create CloudFormation resources

The AWS discovery process runs during the `before:package:initialize` serverless hook to automatically find your default VPC, subnets, security groups, and KMS keys, eliminating the need for manual resource ID lookup.

## Discovery-Time Permissions (Build Process)

These permissions are required when `aws-discovery.js` runs during the build to find your default AWS resources:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSDiscoveryPermissions",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets", 
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeRouteTables",
        "ec2:DescribeNatGateways",
        "ec2:DescribeAddresses",
        "kms:ListKeys",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### What Each Permission Does:
- **`sts:GetCallerIdentity`** - Gets your AWS account ID for KMS key ARN construction
- **`ec2:DescribeVpcs`** - Finds your default VPC or first available VPC
- **`ec2:DescribeSubnets`** - Identifies private subnets within your VPC
- **`ec2:DescribeSecurityGroups`** - Locates default security group or Frigg-specific security group
- **`ec2:DescribeRouteTables`** - Determines which subnets are private (no direct internet gateway route)
- **`ec2:DescribeNatGateways`** - Finds existing NAT Gateways to reuse (prevents duplicate resource creation)
- **`ec2:DescribeAddresses`** - Finds available Elastic IPs to reuse (prevents allocation conflicts)
- **`kms:ListKeys`** - Lists available KMS keys in your account
- **`kms:DescribeKey`** - Gets details about KMS keys to find customer-managed keys

## Core Deployment Permissions

Required for basic Frigg application deployment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationFriggStacks",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:DescribeStackResource",
        "cloudformation:ListStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate",
        "cloudformation:DescribeChangeSet",
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ExecuteChangeSet"
      ],
      "Resource": [
        "arn:aws:cloudformation:*:*:stack/*frigg*/*"
      ]
    },
    {
      "Sid": "S3DeploymentBucket",
      "Effect": "Allow", 
      "Action": [
        "s3:CreateBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:PutBucketTagging",
        "s3:GetBucketTagging"
      ],
      "Resource": [
        "arn:aws:s3:::*serverless*",
        "arn:aws:s3:::*serverless*/*"
      ]
    },
    {
      "Sid": "LambdaFriggFunctions",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:ListFunctions",
        "lambda:PublishVersion",
        "lambda:CreateAlias",
        "lambda:UpdateAlias",
        "lambda:DeleteAlias",
        "lambda:GetAlias",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:PutProvisionedConcurrencyConfig",
        "lambda:DeleteProvisionedConcurrencyConfig",
        "lambda:PutConcurrency",
        "lambda:DeleteConcurrency",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListVersionsByFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:*frigg*"
      ]
    },
    {
      "Sid": "FriggLambdaEventSourceMapping",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:GetEventSourceMapping",
        "lambda:UpdateEventSourceMapping",
        "lambda:ListEventSourceMappings"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:event-source-mapping:*"
      ]
    },
    {
      "Sid": "IAMRolesForFriggLambda",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole", 
        "iam:GetRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/*frigg*",
        "arn:aws:iam::*:role/*frigg*LambdaRole*"
      ]
    },
    {
      "Sid": "IAMPolicyVersionPermissions",
      "Effect": "Allow",
      "Action": [
        "iam:ListPolicyVersions"
      ],
      "Resource": [
        "arn:aws:iam::*:policy/*"
      ]
    },
    {
      "Sid": "FriggMessagingServices",
      "Effect": "Allow",
      "Action": [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueAttributes",
        "sqs:SetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:TagQueue",
        "sqs:UntagQueue"
      ],
      "Resource": [
        "arn:aws:sqs:*:*:*frigg*",
        "arn:aws:sqs:*:*:internal-error-queue-*"
      ]
    },
    {
      "Sid": "FriggSNSTopics",
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic", 
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:TagResource",
        "sns:UntagResource"
      ],
      "Resource": [
        "arn:aws:sns:*:*:*frigg*"
      ]
    },
    {
      "Sid": "FriggMonitoringAndLogs",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:DeleteLogGroup",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:FilterLogEvents",
        "logs:PutLogEvents",
        "logs:PutRetentionPolicy"
      ],
      "Resource": [
        "arn:aws:logs:*:*:log-group:/aws/lambda/*frigg*",
        "arn:aws:logs:*:*:log-group:/aws/lambda/*frigg*:*",
        "arn:aws:cloudwatch:*:*:alarm:*frigg*"
      ]
    },
    {
      "Sid": "FriggAPIGateway",
      "Effect": "Allow", 
      "Action": [
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:DELETE",
        "apigateway:GET",
        "apigateway:PATCH"
      ],
      "Resource": [
        "arn:aws:apigateway:*::/restapis",
        "arn:aws:apigateway:*::/restapis/*",
        "arn:aws:apigateway:*::/domainnames",
        "arn:aws:apigateway:*::/domainnames/*"
      ]
    }
  ]
}
```

**What the Lambda permissions enable:**
- **Function Management**: Create, update, delete, and configure Lambda functions
- **Version & Alias Management**: Publish new versions and manage aliases for deployments
- **Permission Management**: Add/remove function permissions for API Gateway and other services
- **Concurrency Management**: Configure provisioned and reserved concurrency
- **EventSourceMapping Management**: Connect Lambda functions to event sources like SQS, SNS, Kinesis, and DynamoDB streams. These permissions are crucial for:
  - Creating mappings between SQS queues and Lambda functions
  - Managing event-driven architectures
  - Handling queue-based processing (e.g., HubSpot integration queues)
  - Cleaning up event source mappings during stack deletion

## Feature-Specific Permissions

### VPC Support

Additional permissions needed when your app definition includes `vpc: { enable: true }`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FriggVPCEndpointManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateVpcEndpoint",
        "ec2:DeleteVpcEndpoint", 
        "ec2:DescribeVpcEndpoints",
        "ec2:ModifyVpcEndpoint",
        "ec2:CreateNatGateway",
        "ec2:DeleteNatGateway",
        "ec2:DescribeNatGateways",
        "ec2:AllocateAddress",
        "ec2:ReleaseAddress",
        "ec2:DescribeAddresses",
        "ec2:CreateRouteTable",
        "ec2:DeleteRouteTable",
        "ec2:DescribeRouteTables",
        "ec2:CreateRoute",
        "ec2:DeleteRoute",
        "ec2:AssociateRouteTable",
        "ec2:DisassociateRouteTable",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress"
      ],
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "ec2:CreateAction": [
            "CreateVpcEndpoint",
            "CreateNatGateway", 
            "CreateRouteTable",
            "CreateRoute",
            "CreateSecurityGroup"
          ]
        }
      }
    }
  ]
}
```

**What this enables:**
- Creates NAT Gateway for Lambda internet access to external APIs (Salesforce, HubSpot, etc.)
- Creates VPC endpoints for AWS services (S3, DynamoDB, KMS, SSM) to reduce NAT Gateway costs
- Creates route tables and subnet associations for proper Lambda networking
- Automatically configures your Lambda functions to run in your default VPC with full internet access

### KMS Support

Additional permissions needed when your app definition includes `encryption: { useDefaultKMSForFieldLevelEncryption: true }`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FriggKMSEncryptionRuntime",
      "Effect": "Allow",
      "Action": [
        "kms:GenerateDataKey",
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:kms:*:*:key/*"
      ],
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "lambda.*.amazonaws.com",
            "s3.*.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

**What this enables:**
- Lambda functions can encrypt and decrypt data using your default KMS key
- Automatic discovery and configuration of customer-managed KMS keys
- Fallback to AWS-managed keys if no customer keys are available

### SSM Parameter Store Support

Additional permissions needed when your app definition includes `ssm: { enable: true }`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FriggSSMParameterAccess",
      "Effect": "Allow", 
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/*frigg*",
        "arn:aws:ssm:*:*:parameter/*frigg*/*"
      ]
    }
  ]
}
```

**What this enables:**
- Lambda functions can retrieve configuration from SSM Parameter Store
- Automatic configuration of AWS Parameters and Secrets Lambda Extension layer
- Secure environment variable management through SSM

## Complete Policy Template

For convenience, here's a single IAM policy that includes all permissions needed for full Frigg functionality:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FriggCorePermissions",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "cloudformation:*",
        "lambda:*", 
        "apigateway:*",
        "logs:*",
        "sqs:*",
        "sns:*",
        "cloudwatch:*",
        "ec2:Describe*",
        "ec2:CreateVpcEndpoint",
        "ec2:DeleteVpcEndpoint",
        "ec2:ModifyVpcEndpoint",
        "kms:ListKeys",
        "kms:DescribeKey", 
        "kms:GenerateDataKey",
        "kms:Decrypt",
        "ssm:GetParameter*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3DeploymentBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": [
        "arn:aws:s3:::*serverless*",
        "arn:aws:s3:::*serverless*/*"
      ]
    },
    {
      "Sid": "IAMRoleManagement",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole", 
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListPolicyVersions"
      ],
      "Resource": "arn:aws:iam::*:role/*"
    }
  ]
}
```

## Security Improvements (Updated)

### Scoped Resource Permissions

This policy has been updated to follow the principle of least privilege by scoping permissions to Frigg-specific resources:

**Before (Overly Broad):**
```json
"Resource": "*"  // ❌ Too permissive
```

**After (Frigg-Specific):**
```json
"Resource": [
  "arn:aws:lambda:*:*:function:*frigg*"      // ✅ Only functions containing "frigg"
]
```

### Key Security Enhancements

1. **CloudFormation Stacks**: Limited to stacks containing "frigg" in the name
2. **Lambda Functions**: Scoped to functions containing "frigg" in the name
3. **IAM Roles**: Restricted to roles containing "frigg" (including Lambda execution roles)
4. **SQS/SNS**: Limited to queues and topics containing "frigg" in the name
5. **Logs & Monitoring**: Scoped to Lambda log groups for Frigg functions and CloudWatch alarms containing "frigg"
6. **KMS**: Added ViaService condition to restrict usage to Lambda and S3 services only
7. **SSM Parameters**: Limited to parameter paths containing "frigg" in the path structure

### Naming Convention Requirements

For these permissions to work properly, ensure your Frigg applications follow the naming convention of including "frigg" in resource names:

✅ **Good Examples:**
- `my-frigg-app-dev` (CloudFormation stack)
- `integration-frigg-service-auth` (Lambda function)
- `customer-frigg-platform-prod-auth` (Lambda function)
- `/my-frigg-app/prod/database-url` (SSM parameter)
- `internal-error-queue-dev` (SQS queue - special pattern for error queues)

❌ **Won't Match:**
- `my-integration-app-dev` (no "frigg" in name)
- `customer-platform-prod` (no "frigg" in name)

**Note:** The `internal-error-queue-*` pattern is specifically allowed for error handling queues.

## Security Best Practices

### Principle of Least Privilege

For production deployments, consider creating separate policies for different environments:

1. **Development Policy** - Includes all permissions for full feature testing
2. **Production Policy** - Only includes permissions for features actually used in production
3. **CI/CD Policy** - Includes discovery and deployment permissions but restricts sensitive operations

### Resource-Specific Restrictions

You can further restrict permissions by:

```json
{
  "Resource": [
    "arn:aws:cloudformation:us-east-1:YOUR-ACCOUNT-ID:stack/your-app-*/*",
    "arn:aws:lambda:us-east-1:YOUR-ACCOUNT-ID:function:your-app-*"
  ]
}
```

### Environment Variables for Discovery

The discovery process sets these environment variables during build:

- `AWS_DISCOVERY_VPC_ID` - Your default VPC ID
- `AWS_DISCOVERY_SECURITY_GROUP_ID` - Default security group ID
- `AWS_DISCOVERY_SUBNET_ID_1` - First private subnet ID (for Lambda functions)
- `AWS_DISCOVERY_SUBNET_ID_2` - Second private subnet ID (for Lambda functions, or same as first if only one exists)
- `AWS_DISCOVERY_PUBLIC_SUBNET_ID` - Public subnet ID (for NAT Gateway placement)
- `AWS_DISCOVERY_ROUTE_TABLE_ID` - Private route table ID for VPC endpoints
- `AWS_DISCOVERY_KMS_KEY_ID` - Default KMS key ARN
- `AWS_DISCOVERY_NAT_GATEWAY_ID` - Existing NAT Gateway ID (if found)
- `AWS_DISCOVERY_ELASTIC_IP_ALLOCATION_ID` - Existing Elastic IP allocation ID (if found)

## Troubleshooting

### Common Permission Issues

1. **Discovery Fails** - Check that you have the discovery-time permissions
2. **VPC Endpoint Creation Fails** - Ensure you have `ec2:CreateVpcEndpoint` permission
3. **KMS Operations Fail** - Verify KMS key permissions and that the key exists
4. **SSM Parameter Access Fails** - Check SSM parameter path permissions
5. **IAM ListPolicyVersions Error** - If you see "User is not authorized to perform: iam:ListPolicyVersions", ensure your deployment user has this permission (added in recent versions)
6. **SQS SetQueueAttributes Error** - If you see errors for queues like "internal-error-queue-dev", ensure your IAM policy includes the pattern `arn:aws:sqs:*:*:internal-error-queue-*`
7. **CloudFormation ListStackResources Error** - If you see "User is not authorized to perform: cloudformation:ListStackResources", update your IAM stack with the latest template that includes this permission
8. **Elastic IP Already Associated Error** - If you see "Elastic IP address is already associated", the discovery process will now find and reuse existing NAT Gateways and EIPs to prevent conflicts
9. **Lambda EventSourceMapping Error** - If you see "User is not authorized to perform: lambda:DeleteEventSourceMapping", update your IAM stack with the latest template that includes EventSourceMapping permissions

### Fallback Behavior

If AWS discovery fails during build, the framework will:
- Log a warning message
- Set fallback environment variables
- Continue with deployment using safe default values
- Not fail the build process

### Regional Considerations

Ensure your IAM policy includes permissions for the AWS region where you're deploying:
- Discovery permissions work across all regions (use `*` in resource ARNs)
- Deployment permissions should match your target region
- Some services like IAM are global, others are region-specific

## Using with CI/CD

For automated deployments, ensure your CI/CD system has:

1. **AWS Credentials** configured (access key or IAM role)
2. **Region** set via `AWS_REGION` environment variable
3. **This IAM policy** attached to the deployment user/role
4. **Proper build order** - discovery runs before packaging

Example GitHub Actions configuration:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1

- name: Deploy Frigg App
  run: |
    frigg deploy
```

This policy ensures your Frigg application can successfully discover AWS resources during build time and deploy all necessary infrastructure components during deployment.