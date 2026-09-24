# Template Comparison Implementation - Fix for frigg repair --import

**Date**: 2025-10-27
**Status**: ✅ Core implementation completed
**Branch**: claude/investigate-deployment-issue-011CUQnhtGchP5yhseqHN7ch

## Problem Summary

`frigg repair --import` was broken and generating incorrect logical IDs:

```javascript
// ❌ WRONG (before fix)
const resourcesToImport = orphanedResources.map((resource, idx) => ({
    logicalId: `ImportedResource${idx + 1}`,  // Generic sequential ID
    physicalId: resource.physicalId,
    resourceType: resource.resourceType,
}));

// Result: ImportedResource1, ImportedResource2, etc.
// CloudFormation import would fail because these don't match template
```

**Why This Was Broken:**
1. Logical IDs didn't match build template expectations (FriggVPC vs ImportedResource1)
2. No template parsing to find correct logical IDs
3. No relationship analysis between orphaned resources
4. No warning system for multiple resources of same type
5. CloudFormation import would fail with ID mismatch errors

## Solution Architecture

### Three-Layer Implementation

```
┌──────────────────────────────────────────────────────────┐
│ Use Case Layer (RepairViaImportUseCase)                 │
│ - Orchestrates template comparison workflow             │
│ - Validates build template exists                        │
│ - Generates import-resources.json                        │
│ - Detects multi-resource conflicts                       │
└────────────────┬─────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼──────┐
│ TemplateParser│  │LogicalIdMapper│
│ - Parse templates│ │ - Match orphans │
│ - Extract IDs    │ │ - Tag analysis  │
│ - Find Refs      │ │ - Containment   │
└─────────────────┘ └─────────────────┘
```

## Implementation Details

### 1. TemplateParser Service

**File**: `domains/health/domain/services/template-parser.js`

**Purpose**: Parse and compare CloudFormation templates to extract resource mappings

**Key Methods**:

```javascript
class TemplateParser {
  // Parse template from file or object
  parseTemplate(template) {
    // Returns: { resources, version, description, outputs }
  }

  // Get VPC-related resources
  getVpcResources(template) {
    // Returns: [{ logicalId, resourceType, properties }]
  }

  // Extract hardcoded physical IDs from deployed template
  extractHardcodedIds(template) {
    // Returns: { vpcIds: [], subnetIds: [], securityGroupIds: [] }
  }

  // Extract Refs from build template
  extractRefs(template) {
    // Returns: { vpcRefs: [], subnetRefs: [], securityGroupRefs: [] }
  }

  // Find logical ID for physical ID by comparison
  findLogicalIdForPhysicalId(physicalId, deployedTemplate, buildTemplate) {
    // Returns: 'FriggVPC' | null
  }
}
```

**Template Comparison Logic**:

```javascript
// Build Template (.serverless/cloudformation-template-update-stack.json)
{
  "Resources": {
    "FriggVPC": { "Type": "AWS::EC2::VPC" },
    "FriggPrivateSubnet1": { "Type": "AWS::EC2::Subnet" }
  },
  "AttioLambdaFunction": {
    "Properties": {
      "VpcConfig": {
        "SubnetIds": [{ "Ref": "FriggPrivateSubnet1" }]  // ← Ref
      }
    }
  }
}

// Deployed Template (from CloudFormation)
{
  "AttioLambdaFunction": {
    "Properties": {
      "VpcConfig": {
        "SubnetIds": ["subnet-00ab9e0502e66aac3"]  // ← Hardcoded
      }
    }
  }
}

// Parser extracts:
// - Build template has Ref: FriggPrivateSubnet1
// - Deployed template has hardcoded: subnet-00ab9e0502e66aac3
// - Therefore: FriggPrivateSubnet1 → subnet-00ab9e0502e66aac3
```

### 2. LogicalIdMapper Service

**File**: `domains/health/domain/services/logical-id-mapper.js`

**Purpose**: Match orphaned resources to their correct logical IDs using multiple strategies

**Matching Strategies**:

1. **CloudFormation Tags** (Primary, highest confidence)
   ```javascript
   // Check for aws:cloudformation:logical-id tag
   const logicalIdTag = tags.find(t => t.Key === 'aws:cloudformation:logical-id');
   // Confidence: HIGH
   ```

2. **VPC Containment Analysis** (For VPCs)
   ```javascript
   // Check if VPC contains expected subnets from template
   const expectedSubnetIds = extractSubnetIdsFromTemplate(deployedTemplate);
   const actualSubnets = await getSubnetsInVpc(vpc.physicalId);

   const containsExpectedSubnets = expectedSubnetIds.every(expectedId =>
     actualSubnets.some(subnet => subnet.SubnetId === expectedId)
   );

   // If matches: FriggVPC → vpc-0eadd96976d29ede7
   // Confidence: HIGH
   ```

3. **Lambda VPC Usage** (For Subnets/Security Groups)
   ```javascript
   // Check if subnet is referenced in Lambda VPC configs
   const templateSubnetIds = extractSubnetIdsFromTemplate(deployedTemplate);

   if (templateSubnetIds.includes(subnet.physicalId)) {
     const subnetIndex = templateSubnetIds.indexOf(subnet.physicalId);
     const subnetRefs = extractSubnetRefsFromTemplate(buildTemplate);
     return subnetRefs[subnetIndex]; // FriggPrivateSubnet1
   }

   // Confidence: MEDIUM
   ```

**Mapping Result Format**:

```javascript
{
  logicalId: 'FriggVPC',
  physicalId: 'vpc-0eadd96976d29ede7',
  resourceType: 'AWS::EC2::VPC',
  matchMethod: 'contained-resources',
  confidence: 'high'
}
```

### 3. Updated RepairViaImportUseCase

**File**: `domains/health/application/use-cases/repair-via-import-use-case.js`

**New Method**: `importWithLogicalIdMapping()`

**Workflow**:

```javascript
async importWithLogicalIdMapping({ stackIdentifier, orphanedResources, buildTemplatePath }) {
  // 1. Validate build template exists
  if (!fs.existsSync(buildTemplatePath)) {
    throw new Error('Build template not found. Run serverless package first.');
  }

  // 2. Parse build template
  const buildTemplate = this.templateParser.parseTemplate(buildTemplatePath);

  // 3. Get deployed template from CloudFormation
  const deployedTemplate = await this.stackRepository.getTemplate(stackIdentifier);

  // 4. Map orphaned resources to logical IDs
  const mappings = await this.logicalIdMapper.mapOrphanedResourcesToLogicalIds({
    orphanedResources,
    buildTemplate,
    deployedTemplate,
  });

  // 5. Check for multiple resources of same type
  const multiResourceWarnings = this._checkForMultipleResources(mappings);

  // 6. Filter mapped vs unmapped resources
  const mappedResources = mappings.filter(m => m.logicalId !== null);
  const unmappedResources = mappings.filter(m => m.logicalId === null);

  // 7. Generate CloudFormation import format
  const resourcesToImport = mappedResources.map(mapping => ({
    ResourceType: mapping.resourceType,
    LogicalResourceId: mapping.logicalId,  // ✅ Correct: FriggVPC
    ResourceIdentifier: this._getResourceIdentifier(mapping),
  }));

  return {
    success: true,
    mappedCount: mappedResources.length,
    unmappedCount: unmappedResources.length,
    mappings: mappedResources,
    resourcesToImport,
    warnings: multiResourceWarnings,
  };
}
```

**Multi-Resource Detection**:

```javascript
_checkForMultipleResources(mappings) {
  const warnings = [];
  const byType = {};

  // Group by resource type
  mappings.forEach(mapping => {
    if (!byType[mapping.resourceType]) {
      byType[mapping.resourceType] = [];
    }
    byType[mapping.resourceType].push(mapping);
  });

  // Check for multiples
  Object.entries(byType).forEach(([type, resources]) => {
    if (resources.length > 1) {
      warnings.push({
        type: 'MULTIPLE_RESOURCES',
        resourceType: type,
        count: resources.length,
        message: `Multiple VPCs detected (${resources.length}). Review relationships before importing.`,
        resources: resources.map(r => ({
          physicalId: r.physicalId,
          logicalId: r.logicalId,
          matchMethod: r.matchMethod,
          confidence: r.confidence,
        })),
      });
    }
  });

  return warnings;
}
```

**Resource Identifier Mapping**:

```javascript
_getResourceIdentifier(mapping) {
  const identifierMap = {
    'AWS::EC2::VPC': { VpcId: physicalId },
    'AWS::EC2::Subnet': { SubnetId: physicalId },
    'AWS::EC2::SecurityGroup': { GroupId: physicalId },
    'AWS::EC2::InternetGateway': { InternetGatewayId: physicalId },
    'AWS::EC2::NatGateway': { NatGatewayId: physicalId },
    'AWS::EC2::RouteTable': { RouteTableId: physicalId },
    'AWS::EC2::VPCEndpoint': { VpcEndpointId: physicalId },
  };

  return identifierMap[resourceType] || { Id: physicalId };
}
```

## Example Output

### Successful Mapping

```json
{
  "success": true,
  "mappedCount": 4,
  "unmappedCount": 0,
  "mappings": [
    {
      "logicalId": "FriggVPC",
      "physicalId": "vpc-0eadd96976d29ede7",
      "resourceType": "AWS::EC2::VPC",
      "matchMethod": "contained-resources",
      "confidence": "high"
    },
    {
      "logicalId": "FriggPrivateSubnet1",
      "physicalId": "subnet-00ab9e0502e66aac3",
      "resourceType": "AWS::EC2::Subnet",
      "matchMethod": "vpc-usage",
      "confidence": "high"
    },
    {
      "logicalId": "FriggPrivateSubnet2",
      "physicalId": "subnet-00d085a52937aaf91",
      "resourceType": "AWS::EC2::Subnet",
      "matchMethod": "vpc-usage",
      "confidence": "high"
    },
    {
      "logicalId": "FriggLambdaSecurityGroup",
      "physicalId": "sg-07c01370e830b6ad6",
      "resourceType": "AWS::EC2::SecurityGroup",
      "matchMethod": "usage",
      "confidence": "medium"
    }
  ],
  "resourcesToImport": [
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
  ],
  "warnings": []
}
```

### Multiple Resources Warning

```json
{
  "success": true,
  "mappedCount": 3,
  "warnings": [
    {
      "type": "MULTIPLE_RESOURCES",
      "resourceType": "AWS::EC2::VPC",
      "count": 3,
      "message": "Multiple VPCs detected (3). Review relationships before importing.",
      "resources": [
        {
          "physicalId": "vpc-0eadd96976d29ede7",
          "logicalId": "FriggVPC",
          "matchMethod": "contained-resources",
          "confidence": "high"
        },
        {
          "physicalId": "vpc-0e2351eac99adcb83",
          "logicalId": "FriggVPC",
          "matchMethod": "tag",
          "confidence": "high"
        },
        {
          "physicalId": "vpc-020a0365610c05f0b",
          "logicalId": "FriggVPC",
          "matchMethod": "tag",
          "confidence": "high"
        }
      ]
    }
  ]
}
```

## Benefits

### 1. Correct Logical IDs
✅ **Before**: `ImportedResource1`, `ImportedResource2`
✅ **After**: `FriggVPC`, `FriggPrivateSubnet1`, `FriggLambdaSecurityGroup`

### 2. Template-Aware Mapping
- Compares build template with deployed template
- Understands CloudFormation Refs vs hardcoded IDs
- Matches orphaned resources to template expectations

### 3. Multi-Resource Detection
- Warns when multiple VPCs detected
- Shows confidence level for each match
- Helps users choose correct resource to import

### 4. Confidence Levels
- **HIGH**: CloudFormation tags or VPC containment match
- **MEDIUM**: Lambda VPC usage pattern match
- **NONE**: No match found (unmapped resource)

### 5. Error Handling
```
❌ Build template not found at: /path/to/.serverless/cloudformation-template-update-stack.json

Please run one of:
  • serverless package
  • frigg build
  • frigg deploy --stage dev

Then try again:
  frigg repair --import acme-integrations-dev
```

## Remaining Work

### 1. Update frigg repair CLI Command

**File**: `packages/frigg-cli/repair-command/index.js`

**Required Changes**:
```javascript
// Replace broken logic at lines 94-98
async function handleImportRepair(stackIdentifier, report, options) {
  const orphanedResources = report.getOrphanedResources();

  // Find build template
  const buildTemplatePath = path.join(
    process.cwd(),
    '.serverless',
    'cloudformation-template-update-stack.json'
  );

  if (!fs.existsSync(buildTemplatePath)) {
    throw new Error('Build template not found. Run `serverless package` first.');
  }

  // Use new method with template comparison
  const result = await repairUseCase.importWithLogicalIdMapping({
    stackIdentifier,
    orphanedResources,
    buildTemplatePath
  });

  // Handle warnings (multiple resources)
  if (result.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:\n');
    result.warnings.forEach(warning => {
      console.log(`  ${warning.message}`);
      // Show user selection prompt for multiple resources
    });
  }

  // Show mappings
  console.log(`\n✓ Mapped ${result.mappedCount} resources to logical IDs:`);
  result.mappings.forEach(m => {
    console.log(`  • ${m.logicalId} → ${m.physicalId} (${m.matchMethod}, ${m.confidence})`);
  });

  // Save import-resources.json
  fs.writeFileSync(
    'import-resources.json',
    JSON.stringify(result.resourcesToImport, null, 2)
  );

  console.log('\n📦 Generated: import-resources.json');
}
```

### 2. Add User Selection Prompt for Multiple Resources

When multiple VPCs detected, prompt user to choose:

```javascript
if (warning.type === 'MULTIPLE_RESOURCES') {
  console.log(`\n⚠️ Multiple ${warning.resourceType}s detected (${warning.count}):`);

  warning.resources.forEach((resource, idx) => {
    console.log(`  ${idx + 1}. ${resource.physicalId}`);
    console.log(`     Logical ID: ${resource.logicalId}`);
    console.log(`     Match Method: ${resource.matchMethod}`);
    console.log(`     Confidence: ${resource.confidence}\n`);
  });

  const selection = await promptUser('Select resource number to import (or "skip" to skip): ');

  if (selection === 'skip') {
    // Remove all resources of this type from import
  } else {
    // Keep only selected resource
  }
}
```

### 3. Test with Real Stack

```bash
# Test with acme-integrations-dev
cd /path/to/acme-integrations-dev/backend
frigg doctor acme-integrations-dev
frigg repair --import acme-integrations-dev

# Expected output:
# ✓ Found build template: .serverless/cloudformation-template-update-stack.json
# ✓ Retrieved deployed template from CloudFormation
# ✓ Mapped 4 resources to logical IDs:
#   • FriggVPC → vpc-0eadd96976d29ede7 (contained-resources, high)
#   • FriggPrivateSubnet1 → subnet-00ab9e0502e66aac3 (vpc-usage, high)
#   • FriggPrivateSubnet2 → subnet-00d085a52937aaf91 (vpc-usage, high)
#   • FriggLambdaSecurityGroup → sg-07c01370e830b6ad6 (usage, medium)
#
# ⚠️ Multiple VPCs detected (3):
#   1. vpc-0eadd96976d29ede7 (contained-resources, high)
#   2. vpc-0e2351eac99adcb83 (tag, high)
#   3. vpc-020a0365610c05f0b (tag, high)
#
# Select VPC to import [1]: 1
#
# 📦 Generated: import-resources.json
```

## Related Documentation

- **Problem Analysis**: `FRIGG-REPAIR-FIXES-NEEDED.md`
- **Import Strategy**: `IMPORT-STRATEGY.md`
- **Template Comparison**: `BUILD-VS-DEPLOYED-TEMPLATE-ANALYSIS.md`
- **Orphan Detection**: `ORPHAN-DETECTION-ANALYSIS.md`
- **Drift Analysis**: `ACME-DEV-DRIFT-ANALYSIS.md`

## Summary

This implementation fixes the core issue with `frigg repair --import` by:

1. ✅ **Parsing templates** to find correct logical IDs
2. ✅ **Comparing templates** to understand drift and mappings
3. ✅ **Mapping orphaned resources** using multiple strategies
4. ✅ **Detecting multi-resource conflicts** with confidence levels
5. ✅ **Generating proper CloudFormation import format**

The remaining work is to integrate this into the CLI command and add user selection prompts for multiple resources. The core logic is complete and ready for testing.
