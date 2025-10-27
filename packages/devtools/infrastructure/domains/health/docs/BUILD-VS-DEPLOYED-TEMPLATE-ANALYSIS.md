# Build Template vs Deployed Template Analysis

**CRITICAL DISCOVERY**: The local build template and deployed CloudFormation template are DIFFERENT!

## The Discrepancy

### Local Build Template (.serverless/cloudformation-template-update-stack.json)

**Contains VPC Resources:**
```json
{
  "Resources": {
    "FriggVPC": { "Type": "AWS::EC2::VPC" },
    "FriggPrivateSubnet1": { "Type": "AWS::EC2::Subnet" },
    "FriggPrivateSubnet2": { "Type": "AWS::EC2::Subnet" },
    "FriggPublicSubnet": { "Type": "AWS::EC2::Subnet" },
    "FriggPublicSubnet2": { "Type": "AWS::EC2::Subnet" },
    "FriggLambdaSecurityGroup": { "Type": "AWS::EC2::SecurityGroup" },
    "FriggVPCEndpointSecurityGroup": { "Type": "AWS::EC2::SecurityGroup" }
  }
}
```

**Lambda VPC Config uses Refs:**
```json
{
  "VpcConfig": {
    "SecurityGroupIds": [{ "Ref": "FriggLambdaSecurityGroup" }],
    "SubnetIds": [
      { "Ref": "FriggPrivateSubnet1" },
      { "Ref": "FriggPrivateSubnet2" }
    ]
  }
}
```

### Deployed CloudFormation Template (in AWS)

**Does NOT contain VPC Resources:**
- ✅ Has Lambda functions
- ✅ Has SQS queues
- ✅ Has IAM roles
- ❌ **NO VPC resources** (FriggVPC, FriggPrivateSubnet1, FriggPrivateSubnet2, etc.)

**Lambda VPC Config uses Hardcoded Physical IDs:**
```json
{
  "VpcConfig": {
    "SecurityGroupIds": ["sg-07c01370e830b6ad6"],    // Hardcoded physical ID
    "SubnetIds": [
      "subnet-00ab9e0502e66aac3",                     // Hardcoded physical ID
      "subnet-00d085a52937aaf91"                      // Hardcoded physical ID
    ]
  }
}
```

## What This Means

### 1. VPC Resources Were Removed from Stack

At some point, the VPC resources were removed from CloudFormation management:
- VPC was created by CloudFormation originally
- VPC was later removed from the template/stack (but physical resources left in AWS)
- Lambda functions still reference the VPC subnets/SG by physical ID

### 2. Local Build != Deployed State

**If you deploy the local build template now:**
- CloudFormation will try to CREATE new VPC resources (FriggVPC, subnets, SG)
- CloudFormation will FAIL because resources with those logical IDs already exist physically
- OR it will create NEW resources with different physical IDs
- Lambda functions will reference the NEW resources (via Ref)

### 3. Import Operation is Complex

When you import `vpc-0eadd96976d29ede7`:
- You need to map it to the logical ID `FriggVPC` in the template
- You need to import ALL related resources:
  - `FriggPrivateSubnet1` → `subnet-00ab9e0502e66aac3`
  - `FriggPrivateSubnet2` → `subnet-00d085a52937aaf91`
  - `FriggLambdaSecurityGroup` → `sg-07c01370e830b6ad6`
  - etc.

## CloudFormation Import Process

### How Import Works

**Q: Will it know to grab the right VPC?**

**A:** ❌ **NO, you must explicitly tell it which physical ID maps to which logical ID**

CloudFormation import requires:
```json
{
  "Resources": [
    {
      "ResourceType": "AWS::EC2::VPC",
      "LogicalResourceId": "FriggVPC",
      "ResourceIdentifier": {
        "VpcId": "vpc-0eadd96976d29ede7"  // You specify this
      }
    },
    {
      "ResourceType": "AWS::EC2::Subnet",
      "LogicalResourceId": "FriggPrivateSubnet1",
      "ResourceIdentifier": {
        "SubnetId": "subnet-00ab9e0502e66aac3"  // You specify this
      }
    },
    // ... more resources
  ]
}
```

**Q: Will it clear or delete the old resources?**

**A:** ❌ **NO, you must manually delete unused resources**

CloudFormation import:
- ✅ Adds existing resources to the stack (doesn't create or delete anything)
- ✅ Updates Lambda Refs to point to imported resources
- ❌ Does NOT delete the 2 unused VPCs
- ❌ Does NOT clean up orphaned resources

## The Right Approach

### Step 1: Update Local Build Template to Match Deployed State

**OPTION A: Remove VPC from local template (quick fix)**

Remove VPC resources from `serverless.yml`:
```yaml
# Comment out or remove:
# resources:
#   Resources:
#     FriggVPC: ...
#     FriggPrivateSubnet1: ...
```

Then use hardcoded subnet/SG IDs:
```yaml
provider:
  vpc:
    securityGroupIds:
      - sg-07c01370e830b6ad6
    subnetIds:
      - subnet-00ab9e0502e66aac3
      - subnet-00d085a52937aaf91
```

**OPTION B: Import VPC resources to stack (proper fix)**

1. Create import template with mappings
2. Run CloudFormation import operation
3. Redeploy with local template

### Step 2: Decision Point

**CRITICAL QUESTION: Do you want CloudFormation to manage the VPC?**

**If YES (recommended for Frigg framework):**
- ✅ Import `vpc-0eadd96976d29ede7` and its resources
- ✅ CloudFormation will manage VPC lifecycle
- ✅ Template and reality stay in sync
- ✅ Proper infrastructure as code

**If NO (simpler but less controlled):**
- ✅ Remove VPC from local template
- ✅ Use hardcoded subnet/SG IDs in serverless.yml
- ✅ Manually manage VPC outside CloudFormation
- ⚠️ Template drift will always exist

## Recommended Action (CloudFormation Import)

### Phase 1: Prepare Import Template

```bash
# 1. Get the local template
cd /Users/sean/Documents/GitHub/quo--frigg/backend

# 2. Create import-resources.json
cat > import-resources.json <<EOF
[
  {
    "ResourceType": "AWS::EC2::VPC",
    "LogicalResourceId": "FriggVPC",
    "ResourceIdentifier": { "VpcId": "vpc-0eadd96976d29ede7" }
  },
  {
    "ResourceType": "AWS::EC2::Subnet",
    "LogicalResourceId": "FriggPrivateSubnet1",
    "ResourceIdentifier": { "SubnetId": "subnet-00ab9e0502e66aac3" }
  },
  {
    "ResourceType": "AWS::EC2::Subnet",
    "LogicalResourceId": "FriggPrivateSubnet2",
    "ResourceIdentifier": { "SubnetId": "subnet-00d085a52937aaf91" }
  },
  {
    "ResourceType": "AWS::EC2::SecurityGroup",
    "LogicalResourceId": "FriggLambdaSecurityGroup",
    "ResourceIdentifier": { "GroupId": "sg-07c01370e830b6ad6" }
  }
  // ... add other resources (public subnets, SGs, etc.)
]
EOF
```

### Phase 2: Create Change Set for Import

```bash
aws cloudformation create-change-set \
  --stack-name quo-integrations-dev \
  --change-set-name import-vpc-resources \
  --change-set-type IMPORT \
  --resources-to-import file://import-resources.json \
  --template-body file://.serverless/cloudformation-template-update-stack.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### Phase 3: Review and Execute

```bash
# Review the change set
aws cloudformation describe-change-set \
  --stack-name quo-integrations-dev \
  --change-set-name import-vpc-resources \
  --region us-east-1

# Execute if looks good
aws cloudformation execute-change-set \
  --stack-name quo-integrations-dev \
  --change-set-name import-vpc-resources \
  --region us-east-1
```

### Phase 4: Update Lambda VPC Configs

After import, CloudFormation will:
- ✅ Recognize VPC resources are in the stack
- ✅ Lambda Refs will resolve to imported physical IDs
- ✅ Next deploy will update Lambda VPC configs from default VPC back to Frigg VPC

### Phase 5: Clean Up

```bash
# Delete unused VPCs
aws ec2 delete-vpc --vpc-id vpc-0e2351eac99adcb83 --region us-east-1
aws ec2 delete-vpc --vpc-id vpc-020a0365610c05f0b --region us-east-1
```

## Alternative: Simpler Approach (Remove VPC from Template)

If you don't want CloudFormation to manage VPC:

### Step 1: Update serverless.yml

```yaml
provider:
  name: aws
  vpc:
    # Hardcode the VPC resources
    securityGroupIds:
      - sg-07c01370e830b6ad6
    subnetIds:
      - subnet-00ab9e0502e66aac3
      - subnet-00d085a52937aaf91

# Remove VPC resource definitions
# resources:
#   Resources:
#     FriggVPC: ...
```

### Step 2: Deploy

```bash
serverless deploy --stage dev
```

### Step 3: Clean Up

```bash
# Delete all 3 orphaned VPCs
aws ec2 delete-vpc --vpc-id vpc-0eadd96976d29ede7
aws ec2 delete-vpc --vpc-id vpc-0e2351eac99adcb83
aws ec2 delete-vpc --vpc-id vpc-020a0365610c05f0b
```

## Recommendation

**For Frigg Framework consistency: Import VPC resources**

Why:
- ✅ Maintains infrastructure as code principles
- ✅ VPC lifecycle managed by CloudFormation
- ✅ Consistent with Frigg framework design
- ✅ Template matches deployed state
- ✅ `frigg doctor` will show 100/100 health

**Trade-offs:**
- ⚠️ More complex import process
- ⚠️ Must map all VPC resources correctly
- ⚠️ One-time effort but proper long-term solution

## Next Steps for Relationship Analysis

The relationship analysis should:

1. **Parse local build template** (not just deployed template)
2. **Detect CloudFormation Refs** in Lambda VPC configs
3. **Resolve Refs to physical IDs** from deployed stack
4. **Match orphaned resources** against resolved physical IDs
5. **Identify import mapping**:
   - `FriggVPC` (logical) → `vpc-0eadd96976d29ede7` (physical)
   - `FriggPrivateSubnet1` → `subnet-00ab9e0502e66aac3`
   - etc.

This will enable `frigg repair --import` to:
- Show correct VPC to import
- Generate import-resources.json automatically
- Handle CloudFormation import operation
