# Specification: Deploy Dry-Run Mode

**Version**: 1.0.0
**Status**: Draft
**Created**: 2025-10-28
**Author**: Claude Code
**Related**: [SPEC-CLEANUP-COMMAND.md](../../devtools/infrastructure/domains/health/docs/SPEC-CLEANUP-COMMAND.md)

## Overview

Add a `--dry-run` flag to the `frigg deploy` command to preview deployment changes before executing them. This allows users to validate infrastructure changes, verify CloudFormation template generation, check AWS resource discovery results, and review estimated costs without actually deploying.

## Business Context

### Problem Statement

Currently, `frigg deploy` immediately executes deployments without giving users a chance to:
- Preview what CloudFormation changes will be made
- Validate generated serverless.yml configuration
- Review AWS resource discovery results (VPC, subnets, KMS keys)
- Check for potential issues before deployment
- Estimate costs of infrastructure changes
- Verify environment variable configuration

This leads to:
- Unexpected resource creation/modification
- Wasted time rolling back incorrect deployments
- Difficulty troubleshooting deployment failures
- Anxiety about deploying to production
- Lack of visibility into what the framework is doing

### User Story

> As a developer deploying a Frigg application
> I want to preview deployment changes before executing them
> So that I can validate the infrastructure configuration and avoid costly mistakes
> While maintaining confidence in my deployments

### Real-World Scenarios

**Scenario 1: First Production Deployment**
```bash
# Developer wants to see what will be created
frigg deploy --stage prod --dry-run

# Output shows:
# - VPC configuration discovered
# - 12 Lambda functions to be created
# - API Gateway endpoints
# - Estimated monthly cost: $145
# - Change set preview with resource actions
```

**Scenario 2: VPC Migration**
```bash
# Changing VPC configuration after AWS resource discovery
frigg deploy --stage dev --dry-run

# Output shows:
# - VPC change detected (vpc-old → vpc-new)
# - All Lambda functions will be updated (recreation required)
# - Potential downtime: 3-5 minutes
# - Dependencies: 17 Lambda functions, 2 security groups
```

**Scenario 3: Environment Variable Check**
```bash
# Verify environment variables before deployment
frigg deploy --stage prod --dry-run

# Output shows:
# - ✓ All 8 required environment variables present
# - ⚠️  2 optional variables missing: SENTRY_DSN, NEW_RELIC_KEY
# - Template preview generated successfully
```

## Requirements

### Functional Requirements

#### FR-1: Command Interface

```bash
# Dry-run mode (preview without deploying)
frigg deploy --dry-run
frigg deploy --stage prod --dry-run

# All existing flags work with dry-run
frigg deploy --dry-run --verbose
frigg deploy --dry-run --skip-env-validation
frigg deploy --dry-run --skip-doctor

# JSON output for CI/CD pipelines
frigg deploy --dry-run --output json

# Compare with specific CloudFormation stack
frigg deploy --dry-run --compare-stack my-app-prod
```

#### FR-2: Dry-Run Execution Flow

**Phase 1: Pre-Flight Checks**
1. Load app definition from `index.js`
2. Validate app definition structure
3. Check for required files (package.json, serverless.yml if exists)
4. Extract environment variable configuration

**Phase 2: Environment Validation**
1. Check for app-defined environment variables
2. Report missing optional variables (warnings only)
3. Check AWS credentials availability
4. Verify AWS account access

**Phase 3: AWS Resource Discovery** (if applicable)
1. Run AWS resource discovery if VPC/KMS/SSM enabled
2. Display discovered resources:
   - VPC ID and CIDR block
   - Private subnet IDs
   - Security group IDs
   - KMS key ARN
   - Route table IDs
3. Show any discovery warnings or fallbacks

**Phase 4: Template Generation**
1. Generate serverless.yml from app definition
2. Apply AWS discovery results to template
3. Resolve all environment variables
4. Display generated template summary:
   - Service name and stage
   - Provider configuration (region, runtime, etc.)
   - Function count and names
   - API Gateway endpoints
   - Custom resources
   - Environment variables (with values masked)

**Phase 5: CloudFormation Change Set Preview**
1. Create a CloudFormation change set (if stack exists)
2. Display planned changes:
   - Resources to be added (green)
   - Resources to be modified (yellow)
   - Resources to be removed (red)
   - Resource replacements (requires recreation)
3. Show change set details:
   - Logical ID
   - Physical ID (if exists)
   - Resource type
   - Action (Add, Modify, Remove, Replace)
   - Replacement reason (if applicable)
4. Estimate deployment impact:
   - Estimated downtime
   - Functions requiring cold start
   - Breaking changes detected

**Phase 6: Cost Estimation** (optional, future enhancement)
1. Estimate monthly infrastructure costs
2. Show cost breakdown by resource type
3. Compare with current stack costs (if exists)

**Phase 7: Summary Report**
1. Display comprehensive summary:
   - Stack name and region
   - Change summary (X added, Y modified, Z removed)
   - Warnings and recommendations
   - Next steps to execute deployment
2. Exit with status code:
   - `0` = Dry-run successful, ready to deploy
   - `1` = Validation errors, cannot deploy
   - `2` = Warnings present, review before deploying

#### FR-3: Output Formats

**Console Output (Default)**
```
🔍 Frigg Deploy Dry-Run
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 App Configuration
  Service: my-integration
  Stage: production
  Region: us-east-1
  Runtime: nodejs20.x

🔧 Environment Variables
  ✓ 8 required variables present
  ⚠️  2 optional variables missing:
      - SENTRY_DSN
      - NEW_RELIC_KEY

🌐 AWS Resource Discovery
  ✓ VPC: vpc-12345678 (10.0.0.0/16)
  ✓ Subnets: subnet-11111111, subnet-22222222
  ✓ Security Group: sg-12345678
  ✓ KMS Key: arn:aws:kms:us-east-1:123456789012:key/...

📦 Generated Template Summary
  Functions: 12
    - health (256MB, 30s timeout)
    - user (512MB, 30s timeout)
    - integration-hubspot (1024MB, 60s timeout)
    ...

  API Endpoints: 15
    - GET /health
    - POST /api/integrations
    - GET /api/integrations/{id}
    ...

  Custom Resources: 3
    - MongoDB Connection
    - WebSocket Connection Manager
    - S3 Deployment Bucket

🔄 CloudFormation Change Set Preview
  Stack: my-integration-production
  Change Set: frigg-dry-run-20251028-143022

  Changes:
  ✓ Add (5):
    - HealthLambdaFunction (AWS::Lambda::Function)
    - UserLambdaFunction (AWS::Lambda::Function)
    - ApiGatewayRestApi (AWS::ApiGateway::RestApi)
    - DeploymentBucket (AWS::S3::Bucket)
    - LambdaExecutionRole (AWS::IAM::Role)

  ⚠️  Modify (7):
    - IntegrationLambdaFunction (AWS::Lambda::Function)
      • VpcConfig.SubnetIds: [subnet-old1, subnet-old2] → [subnet-11111111, subnet-22222222]
      • Environment.Variables.VPC_ID: vpc-old → vpc-12345678
    - HealthLambdaFunction (AWS::Lambda::Function)
      • VpcConfig.SecurityGroupIds: [sg-old] → [sg-12345678]
    ...

  🔄 Replace (2):
    - DatabaseSecurityGroup (AWS::EC2::SecurityGroup)
      Reason: VpcId property change requires replacement
    - PrivateSubnet1RouteTableAssociation (AWS::EC2::SubnetRouteTableAssociation)
      Reason: SubnetId property change requires replacement

  ⚠️  Remove (0)

📊 Deployment Impact
  Estimated Downtime: 2-3 minutes
  Functions Affected: 12/12
  Cold Starts Expected: All functions
  Breaking Changes: None detected

💰 Estimated Monthly Cost
  Lambda Compute: ~$23
  API Gateway: ~$18
  CloudWatch Logs: ~$5
  S3 Storage: ~$2
  Total: ~$48/month

✅ Dry-Run Summary
  ✓ App definition valid
  ✓ AWS resources discovered successfully
  ✓ Template generated successfully
  ✓ Change set created successfully
  ⚠️  2 optional environment variables missing
  ⚠️  2 resources will be replaced (potential downtime)

Next Steps:
  To execute this deployment, run:
    frigg deploy --stage production

  To skip environment validation, run:
    frigg deploy --stage production --skip-env-validation
```

**JSON Output (for CI/CD)**
```json
{
  "dryRun": true,
  "timestamp": "2025-10-28T14:30:22Z",
  "app": {
    "service": "my-integration",
    "stage": "production",
    "region": "us-east-1",
    "runtime": "nodejs20.x"
  },
  "environment": {
    "required": {
      "present": ["AWS_REGION", "STAGE", "DB_URI", "ENCRYPTION_KEY", "JWT_SECRET", "API_KEY", "WEBHOOK_SECRET", "LOG_LEVEL"],
      "missing": []
    },
    "optional": {
      "present": [],
      "missing": ["SENTRY_DSN", "NEW_RELIC_KEY"]
    }
  },
  "discovery": {
    "enabled": true,
    "results": {
      "vpc": {
        "id": "vpc-12345678",
        "cidr": "10.0.0.0/16"
      },
      "subnets": ["subnet-11111111", "subnet-22222222"],
      "securityGroups": ["sg-12345678"],
      "kmsKey": "arn:aws:kms:us-east-1:123456789012:key/..."
    }
  },
  "template": {
    "service": "my-integration-production",
    "functions": {
      "count": 12,
      "names": ["health", "user", "integration-hubspot"]
    },
    "endpoints": {
      "count": 15,
      "methods": ["GET /health", "POST /api/integrations"]
    }
  },
  "changeSet": {
    "stackName": "my-integration-production",
    "changeSetId": "arn:aws:cloudformation:...",
    "status": "CREATE_COMPLETE",
    "changes": [
      {
        "action": "Add",
        "logicalId": "HealthLambdaFunction",
        "resourceType": "AWS::Lambda::Function",
        "replacement": null
      },
      {
        "action": "Modify",
        "logicalId": "IntegrationLambdaFunction",
        "resourceType": "AWS::Lambda::Function",
        "replacement": null,
        "details": [
          {
            "target": "Properties",
            "attribute": "VpcConfig.SubnetIds",
            "changeSource": "DirectModification"
          }
        ]
      }
    ],
    "summary": {
      "add": 5,
      "modify": 7,
      "remove": 0,
      "replace": 2
    }
  },
  "impact": {
    "downtime": "2-3 minutes",
    "functionsAffected": 12,
    "coldStarts": true,
    "breakingChanges": false
  },
  "cost": {
    "lambda": 23,
    "apiGateway": 18,
    "cloudWatch": 5,
    "s3": 2,
    "total": 48,
    "currency": "USD",
    "period": "monthly"
  },
  "validation": {
    "success": true,
    "errors": [],
    "warnings": [
      "2 optional environment variables missing",
      "2 resources will be replaced"
    ]
  },
  "exitCode": 2
}
```

#### FR-4: Change Set Management

**Change Set Creation**:
```javascript
// Create a temporary change set for preview
const changeSetName = `frigg-dry-run-${Date.now()}`;
const changeSet = await cloudFormation.createChangeSet({
  StackName: stackName,
  ChangeSetName: changeSetName,
  TemplateBody: generatedTemplate,
  ChangeSetType: stackExists ? 'UPDATE' : 'CREATE',
  Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
  Parameters: parameters,
  Tags: tags,
});

// Wait for change set creation
await cloudFormation.waitFor('changeSetCreateComplete', {
  StackName: stackName,
  ChangeSetName: changeSetName,
});

// Retrieve change set details
const changeSetDetails = await cloudFormation.describeChangeSet({
  StackName: stackName,
  ChangeSetName: changeSetName,
});

// Clean up change set after preview
await cloudFormation.deleteChangeSet({
  StackName: stackName,
  ChangeSetName: changeSetName,
});
```

**Change Set Analysis**:
```javascript
function analyzeChangeSet(changeSet) {
  const summary = {
    add: 0,
    modify: 0,
    remove: 0,
    replace: 0,
  };

  const criticalChanges = [];
  const warnings = [];

  for (const change of changeSet.Changes) {
    const { Action, ResourceChange } = change;

    // Count actions
    if (Action === 'Add') summary.add++;
    if (Action === 'Modify') summary.modify++;
    if (Action === 'Remove') summary.remove++;
    if (ResourceChange?.Replacement === 'True') summary.replace++;

    // Detect critical changes
    if (ResourceChange?.Replacement === 'True') {
      criticalChanges.push({
        logicalId: ResourceChange.LogicalResourceId,
        resourceType: ResourceChange.ResourceType,
        reason: 'Requires replacement',
      });
    }

    // Detect VPC changes (high impact)
    if (ResourceChange?.ResourceType === 'AWS::Lambda::Function') {
      const vpcChange = ResourceChange.Details?.find(
        (d) => d.Target?.Attribute === 'VpcConfig'
      );
      if (vpcChange) {
        warnings.push({
          logicalId: ResourceChange.LogicalResourceId,
          message: 'VPC configuration change - function will be recreated',
        });
      }
    }
  }

  return { summary, criticalChanges, warnings };
}
```

#### FR-5: Integration with Existing Flags

All existing `frigg deploy` flags work with `--dry-run`:

**Environment Validation**:
```bash
# Skip environment validation in dry-run
frigg deploy --dry-run --skip-env-validation
```

**Health Check Skip**:
```bash
# Skip post-deployment health check (not applicable in dry-run)
frigg deploy --dry-run --skip-doctor
```

**Verbose Output**:
```bash
# Show detailed logs during dry-run
frigg deploy --dry-run --verbose
```

**Force Deployment**:
```bash
# Force flag ignored in dry-run (cannot force a preview)
frigg deploy --dry-run --force
```

### Non-Functional Requirements

#### NFR-1: Performance

- Dry-run execution must complete within 30 seconds for small stacks (<20 resources)
- Dry-run execution must complete within 60 seconds for large stacks (50+ resources)
- AWS resource discovery should be cached for 5 minutes to speed up repeated dry-runs
- Change set creation timeout: 5 minutes (CloudFormation standard)

#### NFR-2: Safety

- **CRITICAL**: Dry-run must NEVER modify any AWS resources
- Change sets created for preview must be automatically deleted after display
- No side effects from running dry-run multiple times
- Failed dry-run must not leave CloudFormation in inconsistent state

#### NFR-3: Usability

- Output must be clear and actionable
- Warnings must be visually distinct from errors
- Critical changes (replacements) must be highlighted
- Next steps must be provided at end of output
- JSON output must be parseable by standard JSON tools

#### NFR-4: Compatibility

- Must work with all existing Frigg app definitions
- Must support both create and update operations
- Must work with AWS discovery enabled/disabled
- Must integrate with existing serverless.yml generation

## Implementation Design

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ frigg deploy --dry-run                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ DryRunOrchestrator                                          │
│ - Coordinates dry-run workflow                              │
│ - Manages phase execution                                   │
│ - Collects results                                          │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──▶ PreFlightChecker
             │     - Load app definition
             │     - Validate structure
             │     - Check required files
             │
             ├──▶ EnvironmentValidator
             │     - Check environment variables
             │     - Validate AWS credentials
             │     - Verify account access
             │
             ├──▶ AWSDiscoveryRunner (if enabled)
             │     - Discover VPC resources
             │     - Find KMS keys
             │     - Locate subnets/security groups
             │
             ├──▶ TemplateGenerator
             │     - Generate serverless.yml
             │     - Apply discovery results
             │     - Resolve environment variables
             │
             ├──▶ ChangeSetCreator
             │     - Create CloudFormation change set
             │     - Wait for completion
             │     - Retrieve change details
             │     - Analyze changes
             │     - Delete change set (cleanup)
             │
             ├──▶ CostEstimator (future)
             │     - Estimate resource costs
             │     - Compare with current costs
             │     - Show cost breakdown
             │
             └──▶ DryRunReporter
                   - Format output
                   - Display summary
                   - Provide next steps
                   - Return exit code
```

### File Structure

```
packages/frigg-cli/deploy-command/
├── index.js                          # Main deploy command (modified)
├── dry-run/
│   ├── orchestrator.js               # DryRunOrchestrator
│   ├── pre-flight-checker.js         # PreFlightChecker
│   ├── environment-validator.js      # EnvironmentValidator
│   ├── template-generator.js         # TemplateGenerator (uses existing)
│   ├── change-set-creator.js         # ChangeSetCreator
│   ├── change-set-analyzer.js        # ChangeSetAnalyzer
│   ├── dry-run-reporter.js           # DryRunReporter
│   └── __tests__/
│       ├── orchestrator.test.js
│       ├── change-set-creator.test.js
│       └── dry-run-reporter.test.js
└── SPEC-DEPLOY-DRY-RUN.md           # This specification
```

### Key Classes

#### DryRunOrchestrator

```javascript
class DryRunOrchestrator {
  constructor({ appDefinition, options }) {
    this.appDefinition = appDefinition;
    this.options = options;
    this.results = {};
  }

  async execute() {
    // Phase 1: Pre-flight checks
    this.results.preFlight = await this.runPreFlightChecks();

    // Phase 2: Environment validation
    this.results.environment = await this.validateEnvironment();

    // Phase 3: AWS discovery (if enabled)
    if (this.shouldRunDiscovery()) {
      this.results.discovery = await this.runDiscovery();
    }

    // Phase 4: Template generation
    this.results.template = await this.generateTemplate();

    // Phase 5: Change set preview
    this.results.changeSet = await this.createChangeSetPreview();

    // Phase 6: Cost estimation (future)
    // this.results.cost = await this.estimateCosts();

    // Phase 7: Report
    return this.generateReport();
  }

  shouldRunDiscovery() {
    return (
      this.appDefinition.vpc?.enable === true ||
      this.appDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true ||
      this.appDefinition.ssm?.enable === true
    );
  }
}
```

#### ChangeSetCreator

```javascript
class ChangeSetCreator {
  constructor({ cloudFormation, stackName, region }) {
    this.cloudFormation = cloudFormation;
    this.stackName = stackName;
    this.region = region;
  }

  async createPreview(template, parameters, tags) {
    // Check if stack exists
    const stackExists = await this.checkStackExists();

    // Create change set
    const changeSetName = `frigg-dry-run-${Date.now()}`;
    const changeSet = await this.cloudFormation.createChangeSet({
      StackName: this.stackName,
      ChangeSetName: changeSetName,
      TemplateBody: JSON.stringify(template),
      ChangeSetType: stackExists ? 'UPDATE' : 'CREATE',
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: parameters,
      Tags: tags,
    });

    // Wait for change set creation
    await this.waitForChangeSet(changeSetName);

    // Get change set details
    const details = await this.getChangeSetDetails(changeSetName);

    // Clean up
    await this.deleteChangeSet(changeSetName);

    return details;
  }

  async checkStackExists() {
    try {
      await this.cloudFormation.describeStacks({
        StackName: this.stackName,
      });
      return true;
    } catch (error) {
      if (error.code === 'ValidationError') {
        return false;
      }
      throw error;
    }
  }

  async waitForChangeSet(changeSetName, maxWaitTime = 300000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const { Status, StatusReason } = await this.cloudFormation.describeChangeSet({
        StackName: this.stackName,
        ChangeSetName: changeSetName,
      });

      if (Status === 'CREATE_COMPLETE') {
        return;
      }

      if (Status === 'FAILED') {
        // "No updates are to be performed" is expected for no-op changes
        if (StatusReason?.includes('No updates are to be performed')) {
          return;
        }
        throw new Error(`Change set creation failed: ${StatusReason}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error('Change set creation timeout');
  }

  async deleteChangeSet(changeSetName) {
    try {
      await this.cloudFormation.deleteChangeSet({
        StackName: this.stackName,
        ChangeSetName: changeSetName,
      });
    } catch (error) {
      console.warn(`Warning: Could not delete change set ${changeSetName}:`, error.message);
    }
  }
}
```

### Integration with Existing Code

**Modified: `packages/frigg-cli/deploy-command/index.js`**

```javascript
async function deployCommand(options) {
  // Parse command-line options
  const { stage, dryRun, verbose, skipEnvValidation, skipDoctor, output } = options;

  // Load app definition
  const appDefinition = loadAppDefinition();
  if (!appDefinition) {
    console.error('❌ Could not load app definition from index.js');
    process.exit(1);
  }

  // DRY-RUN MODE
  if (dryRun) {
    console.log('🔍 Running deployment dry-run...\n');

    const orchestrator = new DryRunOrchestrator({
      appDefinition,
      options: { stage, verbose, skipEnvValidation, output },
    });

    const results = await orchestrator.execute();

    // Display results
    const reporter = new DryRunReporter({ format: output || 'console' });
    reporter.display(results);

    // Exit with appropriate code
    process.exit(results.exitCode);
  }

  // NORMAL DEPLOYMENT (existing code)
  // ... existing deployment logic ...
}
```

## Testing Strategy

### Unit Tests

**Change Set Creator Tests**:
```javascript
describe('ChangeSetCreator', () => {
  it('should create change set for new stack', async () => {
    const creator = new ChangeSetCreator({
      cloudFormation: mockCF,
      stackName: 'test-stack',
      region: 'us-east-1',
    });

    mockCF.describeStacks.mockRejectedValueOnce(
      new Error('Stack does not exist')
    );
    mockCF.createChangeSet.mockResolvedValueOnce({ Id: 'cs-123' });
    mockCF.describeChangeSet.mockResolvedValueOnce({
      Status: 'CREATE_COMPLETE',
      Changes: [],
    });

    const result = await creator.createPreview(template, [], []);

    expect(result.Changes).toBeDefined();
    expect(mockCF.createChangeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        ChangeSetType: 'CREATE',
      })
    );
  });

  it('should clean up change set after preview', async () => {
    const creator = new ChangeSetCreator({
      cloudFormation: mockCF,
      stackName: 'test-stack',
      region: 'us-east-1',
    });

    await creator.createPreview(template, [], []);

    expect(mockCF.deleteChangeSet).toHaveBeenCalled();
  });
});
```

**Dry-Run Orchestrator Tests**:
```javascript
describe('DryRunOrchestrator', () => {
  it('should execute all phases in order', async () => {
    const orchestrator = new DryRunOrchestrator({
      appDefinition: mockAppDef,
      options: { stage: 'dev' },
    });

    const results = await orchestrator.execute();

    expect(results.preFlight).toBeDefined();
    expect(results.environment).toBeDefined();
    expect(results.template).toBeDefined();
    expect(results.changeSet).toBeDefined();
  });

  it('should skip discovery when not enabled', async () => {
    const orchestrator = new DryRunOrchestrator({
      appDefinition: { vpc: { enable: false } },
      options: { stage: 'dev' },
    });

    const results = await orchestrator.execute();

    expect(results.discovery).toBeUndefined();
  });
});
```

### Integration Tests

**End-to-End Dry-Run Test**:
```javascript
describe('frigg deploy --dry-run', () => {
  it('should preview deployment without modifying resources', async () => {
    // Create test app definition
    const appDef = {
      name: 'test-app',
      provider: 'aws',
      vpc: { enable: true },
    };

    // Run dry-run
    const result = await runCommand('frigg deploy --dry-run --stage dev');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dry-Run Summary');
    expect(result.stdout).toContain('Change Set Preview');

    // Verify no resources were created
    const stacks = await cloudFormation.listStacks();
    expect(stacks).not.toContain('test-app-dev');
  });
});
```

## Comparison with SPEC-CLEANUP-COMMAND

This spec follows similar patterns to [SPEC-CLEANUP-COMMAND.md](../../devtools/infrastructure/domains/health/docs/SPEC-CLEANUP-COMMAND.md):

### Similarities

1. **Dry-Run First**: Both commands default to preview mode
   - `frigg cleanup --orphaned` → dry-run by default
   - `frigg deploy --dry-run` → explicit dry-run flag

2. **Safety Features**:
   - Both create preview without modifying resources
   - Both require explicit execution flag (`--execute` for cleanup)
   - Both provide detailed change summaries

3. **Output Formats**:
   - Console output (default, human-readable)
   - JSON output (`--output json` for automation)

4. **Change Analysis**:
   - Both analyze resource changes before execution
   - Both detect critical changes (replacements)
   - Both provide warnings and recommendations

5. **Cleanup After Preview**:
   - Cleanup command: No cleanup needed (just listing)
   - Deploy command: Delete change set after preview

### Differences

| Feature | Deploy Dry-Run | Cleanup Orphaned |
|---------|----------------|------------------|
| **Default Behavior** | Requires `--dry-run` flag | Dry-run by default |
| **Execution** | Run deploy without flag | Requires `--execute` |
| **AWS Modification** | Creates/modifies resources | Deletes resources |
| **Change Set** | Creates temporary change set | N/A (uses describe APIs) |
| **Cost Impact** | Shows future costs | Shows cost savings |
| **Dependencies** | Not checked (CloudFormation handles) | Explicitly checked before delete |
| **Confirmation** | Not needed (explicit deploy) | Required before deletion |

## Success Criteria

1. **Functional**:
   - ✅ Dry-run completes without errors for valid app definitions
   - ✅ All phases execute in correct order
   - ✅ Change set preview displays accurately
   - ✅ No AWS resources modified during dry-run
   - ✅ Change sets cleaned up after preview

2. **Usability**:
   - ✅ Output is clear and actionable
   - ✅ Warnings visually distinct from errors
   - ✅ Next steps provided at end of output
   - ✅ JSON output parseable by standard tools

3. **Performance**:
   - ✅ Dry-run completes within 30s for small stacks
   - ✅ Dry-run completes within 60s for large stacks

4. **Safety**:
   - ✅ Zero side effects from running dry-run
   - ✅ Failed dry-run doesn't leave inconsistent state
   - ✅ Change sets always cleaned up (even on error)

## Future Enhancements

### Phase 2: Cost Estimation
- Integrate with AWS Cost Explorer API
- Show estimated monthly costs by resource
- Compare with current stack costs
- Alert on significant cost increases

### Phase 3: Drift Detection
- Compare deployed stack with app definition
- Detect manual changes in AWS console
- Suggest `frigg repair` for drift correction

### Phase 4: Multi-Stack Preview
- Preview changes across multiple stacks
- Show cross-stack dependencies
- Validate stack outputs/imports

### Phase 5: Interactive Mode
- Prompt user to proceed with deployment
- Allow selective deployment of changes
- Confirm critical changes before execution

## References

- **Related Spec**: [SPEC-CLEANUP-COMMAND.md](../../devtools/infrastructure/domains/health/docs/SPEC-CLEANUP-COMMAND.md)
- **CloudFormation Change Sets**: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html
- **Serverless Framework**: https://www.serverless.com/
- **AWS SDK v3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | TBD | | |
| Tech Lead | TBD | | |
| Developer | Claude Code | 2025-10-28 | ✓ |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-28 | Claude Code | Initial specification |
