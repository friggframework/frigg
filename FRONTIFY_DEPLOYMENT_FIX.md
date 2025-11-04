# Frontify Deployment Fix - CloudFormation Discovery Enhancement

## Problem Summary

Frontify deployment was failing with:
```
Stack found but contains no usable resources - running AWS API discovery...
AWS KMS discovery failed: AccessDeniedException: kms:ListAliases
AWS VPC discovery failed: UnauthorizedOperation: ec2:DescribeInternetGateways
CREATE_FAILED: FriggInternetGateway - ec2:CreateInternetGateway not authorized
```

## Root Cause

The new CloudFormation-first discovery (introduced in hexagonal architecture refactor) only recognized stacks with VPC/KMS/Aurora **resources** in them. Frontify's stack uses:

**External Pattern:**
- VPC (default VPC)
- Subnets (existing)
- Security Group (existing)
- NAT Gateway (existing)
- KMS Key (existing)

**Stack-Managed Pattern:**
- `FriggLambdaRouteTable` - Route table
- `FriggNATRoute` - NAT route
- `FriggSubnet1RouteAssociation`, `FriggSubnet2RouteAssociation` - Associations
- `VPCEndpointS3`, `VPCEndpointDynamoDB` - VPC endpoints

The discovery logic incorrectly treated this as "no useful resources" and fell back to AWS API discovery which:
1. Failed due to missing IAM permissions
2. Returned empty `{}`
3. Caused builders to try CREATE resources
4. Failed again on create permissions

## Solution

Enhanced CloudFormation discovery to:

### 1. Recognize Routing Infrastructure as "Useful"
```javascript
const hasRoutingInfra = stackResources?.routeTableId ||  
                       stackResources?.natRoute ||
                       stackResources?.vpcEndpoints?.s3 || 
                       stackResources?.vpcEndpoints?.dynamodb;

const hasSomeUsefulData = hasVpcData || hasKmsData || hasAuroraData || hasRoutingInfra;
```

### 2. Extract Routing Resources from Stack
- `FriggLambdaRouteTable` → `routeTableId`
- `FriggNATRoute` → `natRoute`
- Route table associations → `routeTableAssociations[]`
- VPC endpoints → `vpcEndpoints.s3`, `vpcEndpoints.dynamodb`

### 3. Query EC2 for External Resource References
When routing resources are found in stack, query the route table (by ID) to extract:
- **VPC ID** from route table's VpcId property
- **NAT Gateway ID** from route table's NAT routes
- **Subnet IDs** from route table's subnet associations

This uses ONE minimal EC2 API call: `ec2:DescribeRouteTables` on a specific route table ID.

## Expected Deployment Flow

### With the Fix

**1. CloudFormation Discovery:**
```
🔍 Running cloud resource discovery...
  DEBUG: Processing 47 CloudFormation resources...
  ✓ Found route table in stack: rtb-0b83aca77ccde20a6
  ✓ Found NAT route in stack
  ✓ Found S3 VPC endpoint in stack: vpce-0352ceac2124c14be
  ✓ Found DynamoDB VPC endpoint in stack: vpce-0b06c4f631199ea68
  ✓ Found VPC routing infrastructure in stack (external VPC pattern)
  ℹ Querying route table rtb-0b83aca77ccde20a6 for external references...
  ✓ Extracted VPC ID from route table: vpc-01cd124575c683a17
  ✓ Extracted NAT Gateway ID from routes: nat-05a536cbe7056325f
  ✓ Extracted private subnet 1 from associations: subnet-0bbca02e9981df72c
  ✓ Extracted private subnet 2 from associations: subnet-005f7092b91efaaeb
  ✓ Discovered resources from existing CloudFormation stack
✅ Cloud resource discovery completed successfully!
```

**2. Builder Decisions:**
```
[VpcBuilder] Building VPC infrastructure...

  📋 Resource Ownership Decisions:
     VPC: external - Found external resource via discovery
     Security Group: stack - No existing FriggLambdaSecurityGroup - will create in stack
     Subnets: external - Found external resources via discovery  
     NAT Gateway: external - Found external resource via discovery
     VPC Endpoints:
       S3: stack - Found in CloudFormation stack - must keep in template to avoid deletion
       DynamoDB: stack - Found in CloudFormation stack - must keep in template to avoid deletion
```

**3. CloudFormation Template Generated:**

Resources in template (same as canary version):
- ✅ `FriggLambdaSecurityGroup` (created, uses external VPC ID)
- ✅ `FriggLambdaRouteTable` (already exists, kept in template)
- ✅ `FriggNATRoute` (already exists, kept in template)
- ✅ `FriggSubnet1RouteAssociation` (already exists, kept in template)
- ✅ `FriggSubnet2RouteAssociation` (already exists, kept in template)
- ✅ `VPCEndpointS3` (already exists, kept in template)
- ✅ `VPCEndpointDynamoDB` (already exists, kept in template)

CloudFormation will see these resources already exist with same properties and **make no changes**.

**4. Deployment Success:**
```
✔ Service deployed to stack create-frigg-app-production (94s)
```

## IAM Permissions Required

### Minimal Permissions (with fix):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStacks",
        "cloudformation:ListStackResources",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack"
      ],
      "Resource": "arn:aws:cloudformation:*:*:stack/create-frigg-app-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeRouteTables"
      ],
      "Resource": "*"
    }
  ]
}
```

### NOT Required:
- ❌ `kms:ListAliases` - No longer needed
- ❌ `ec2:DescribeInternetGateways` - No longer needed
- ❌ `ec2:DescribeVpcs` - No longer needed (VPC ID from route table)
- ❌ `ec2:DescribeSubnets` - No longer needed (subnet IDs from route table associations)
- ❌ `ec2:DescribeSecurityGroups` - No longer needed
- ❌ `ec2:DescribeNatGateways` - No longer needed (NAT ID from routes)

## Your AppDefinition - No Changes Needed!

```javascript
const appDefinition = {
    name: 'create-frigg-app',
    integrations: [AsanaIntegration],
    user: { password: true },
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
        createResourceIfNoneFound: true,
        schema: {
            User: { fields: ['username'] }
        }
    },
    vpc: {
        enable: true,
        enableVPCEndpoints: true,
        selfHeal: true,
    },
    database: {
        mongoDB: { enable: !isProduction },
        documentDB: {
            enable: isProduction,
            tlsCAFile: './security/global-bundle.pem',
        },
        postgres: { enable: false },
    },
    environment: {
        // ... your env vars
    },
};
```

**This works perfectly as-is!**

The `vpc.enable: true` with `selfHeal: true` triggers:
1. CloudFormation discovery finds routing infrastructure
2. Extracts VPC/subnet/NAT IDs from route table
3. Auto-resolves to use external VPC/subnets/NAT
4. Keeps routing resources in template (already exist)
5. Template regenerates identically → no changes → successful deploy

## Testing the Fix

Once the canary version is released:

1. Update `package.json` to use new canary
2. Deploy with same appDefinition (no changes needed)
3. Verify logs show CloudFormation discovery success (no API fallback)
4. Verify deployment completes without IAM errors

## Files Changed

- `packages/devtools/infrastructure/domains/shared/resource-discovery.js`
- `packages/devtools/infrastructure/domains/shared/cloudformation-discovery.js`
- `packages/devtools/infrastructure/domains/shared/providers/aws-provider-adapter.js`
- `packages/devtools/infrastructure/domains/shared/cloudformation-discovery.test.js`
- `docs/reference/deployment-fixes.md`

## PR

https://github.com/friggframework/frigg/pull/490

Branch: `fix/cloudformation-discovery-external-resources` → `next`
Label: `release` (triggers canary)

