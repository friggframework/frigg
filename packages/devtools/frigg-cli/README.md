# Frigg CLI - Complete Documentation

## Overview

The Frigg CLI provides tools for building, deploying, and managing serverless integrations on cloud platforms. Built with Domain-Driven Design and Hexagonal Architecture for multi-cloud extensibility.

---

## Command Reference

### Core Commands

#### `frigg init [options]`

**Status:** To be documented (command may not be merged yet)

Initialize a new Frigg application with scaffolding and configuration.

**Usage:**
```bash
frigg init
frigg init my-app
frigg init --template typescript
```

**What it does:**
- TBD - Full documentation pending implementation merge

**Options:**
- TBD

**Example Output:**
- TBD

> **Note**: This command may be part of an upcoming release. Documentation will be updated once the implementation is merged to the main branch.

---

#### `frigg install <module-name>`

Install and configure an API integration module from the Frigg module library.

**Usage:**
```bash
frigg install hubspot
frigg install salesforce
frigg install stripe
```

**What it does:**
- Searches the api-module-library for the specified integration
- Installs the npm package (@friggframework/api-module-{name})
- Adds integration to your app definition
- Configures OAuth flows and webhooks if applicable
- Creates integration-specific environment variable placeholders

**Options:**
- None currently (could add `--version`, `--registry` in future)

**Example Output:**
```
🔍 Finding integration module: hubspot
✓ Found @friggframework/api-module-hubspot@2.0.5
📦 Installing package...
✓ Package installed successfully
🔧 Configuring integration in app definition...
✓ Integration configured
⚙️  Next steps:
   1. Set HUBSPOT_CLIENT_ID in your environment
   2. Set HUBSPOT_CLIENT_SECRET in your environment
   3. Run 'frigg start' to test locally
```

---

#### `frigg search <term>`

Search for available API integration modules.

**Usage:**
```bash
frigg search crm
frigg search payment
frigg search
```

**What it does:**
- Queries the api-module-library directory
- Filters modules by name, description, or category
- Returns list of matching integrations with metadata

**Options:**
- None (searches all if no term provided)

**Example Output:**
```
📚 Available API Modules:

CRM Systems:
  • hubspot - HubSpot CRM & Marketing automation
  • salesforce - Salesforce CRM & Sales Cloud
  • pipedrive - Pipedrive sales CRM

Payment Processing:
  • stripe - Stripe payment processing
  • square - Square payments & POS

Found 5 modules matching "crm"
```

---

#### `frigg start [options]`

Start local development server with hot reload.

**Usage:**
```bash
frigg start
frigg start --stage dev
frigg start --verbose
frigg start --frontend
```

**What it does:**
1. Validates DATABASE_URL environment variable
2. Detects database type (MongoDB or PostgreSQL)
3. Checks Prisma client generation status
4. Tests database connection
5. Starts serverless-offline for backend
6. Optionally starts frontend dev server

**Options:**
- `--stage <stage>` - Deployment stage (default: 'dev')
- `--verbose` - Enable verbose logging
- `--frontend` - Also start frontend dev server
- `--port <port>` - Backend port (default: 3000)
- `--frontend-port <port>` - Frontend port (default: 3001)

**Example Output:**
```
🚀 Starting Frigg application...
✓ DATABASE_URL found
✓ Database type: mongodb
✓ Prisma client generated
✓ Database connection successful

Starting backend and optional frontend...
Starting backend in /Users/dev/my-app/backend...

╔═════════════════════════════════════════════════╗
║                                                 ║
║   Serverless Offline listening on port 3000    ║
║                                                 ║
╚═════════════════════════════════════════════════╝

endpoints:
  GET  - http://localhost:3000/health
  POST - http://localhost:3000/api/authorize
  POST - http://localhost:3000/api/webhook
  ...
```

**Database Checks:**
- Validates DATABASE_URL exists and is accessible
- Determines database type from connection string
- Verifies Prisma client is generated for the correct database
- Tests connection with timeout
- Provides helpful error messages for connection failures

---

#### `frigg deploy [options]`

Deploy serverless infrastructure to cloud provider.

**Usage:**
```bash
frigg deploy
frigg deploy --stage production
frigg deploy --region us-west-2
frigg deploy --force
frigg deploy --skip-env-validation
frigg deploy --skip-doctor              # Skip health check (not recommended)
frigg deploy --no-interactive           # CI/CD mode (no prompts, auto-repair safe issues)
```

**What it does:**
1. **Runs health check** (`frigg doctor`) to detect infrastructure issues
2. **Auto-repairs safe issues** (or prompts for confirmation in interactive mode)
3. **Fails if critical issues found** (unless `--skip-doctor` flag used)
4. Loads app definition from index.js
5. Validates required environment variables
6. Discovers existing cloud resources (VPC, KMS, Aurora, etc.)
7. Makes ownership decisions (resources managed in CloudFormation stack)
8. Generates CloudFormation resources
9. Generates serverless.yml configuration
10. Executes `osls deploy` with filtered environment
11. Creates/updates stack in cloud provider

**Options:**
- `--stage <stage>` - Deployment stage (default: 'dev')
- `--region <region>` - Cloud provider region (overrides app definition)
- `--force` - Force deployment even if no changes detected
- `--skip-env-validation` - Skip environment variable validation warnings
- `--skip-doctor` - Skip infrastructure health check ⚠️ Not recommended
- `--no-interactive` - Non-interactive mode for CI/CD (auto-repair safe issues, fail on risky changes)
- `--verbose` - Enable verbose logging

**Example Output:**
```
🔧 Loading environment configuration from appDefinition...
   Found 3 environment variables: DATABASE_URL, JWT_SECRET, STRIPE_API_KEY

🔍 Discovering existing infrastructure...

[VPC Builder] Discovering VPC resources...
  Found VPC: vpc-0abc123def456 (existing in AWS)
  📋 Resource Ownership Decision: external - Using existing VPC vpc-0abc123def456
[VPC Builder] ✅ VPC configuration completed

[KMS Builder] Discovering KMS keys...
  Found KMS key: alias/frigg-my-app-dev
  📋 Resource Ownership Decision: stack - Will create FriggKMSKey in stack
[KMS Builder] ✅ KMS configuration completed

[Aurora Builder] Discovering Aurora clusters...
  No existing Aurora cluster found
  📋 Resource Ownership Decision: stack - Will create AuroraCluster in stack
[Aurora Builder] ✅ Aurora configuration completed

🚀 Deploying serverless application...

Deploying my-app to stage dev (us-east-1)

Creating CloudFormation stack...
✓ Stack created: my-app-dev
✓ VPC endpoints configured
✓ Aurora cluster created
✓ Lambda functions deployed (12)
✓ API Gateway configured
✓ CloudWatch alarms created

Stack Outputs:
  ServiceEndpoint: https://abc123.execute-api.us-east-1.amazonaws.com/dev
  AuroraEndpoint: my-app-dev.cluster-abc123.us-east-1.rds.amazonaws.com

Deployment completed in 3m 42s
```

**Environment Variable Handling:**
- Passes only necessary environment variables to serverless (security)
- Includes AWS credentials (AWS_* prefix)
- Includes app-defined environment variables from definition
- Validates required variables exist
- Warns about missing optional variables

**Resource Ownership:**
- Resources can be marked as `STACK` (managed in CloudFormation) or `EXTERNAL` (use existing by ID)
- Default behavior: manage resources in CloudFormation stack for full lifecycle control
- Doctor/repair handles edge cases (orphaned resources, drift) before deployment
- Explicit ownership in app definition recommended for production

**CI/CD Deployment:**
- Use `--no-interactive` flag to prevent prompts
- Deployment will auto-fix safe issues (mutable property drift)
- Deployment will **fail fast** on risky issues (orphaned resources, immutable property changes)
- Prevents stack rollbacks and 2+ hour waits from bad deployments
- Returns non-zero exit code if issues require manual intervention

**Example CI/CD Pipeline:**
```yaml
# GitHub Actions / GitLab CI / etc.
- name: Deploy to production
  run: |
    frigg deploy \
      --stage production \
      --no-interactive \
      --skip-env-validation
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

#### `frigg db:setup [options]`

Initialize database and Prisma configuration.

**Usage:**
```bash
frigg db:setup
frigg db:setup --mongodb
frigg db:setup --postgresql
frigg db:setup --generate-only
```

**What it does:**
1. Detects database type (MongoDB, AWS DocumentDB, or PostgreSQL) from the app definition and `DATABASE_URL`
2. Validates that `DATABASE_URL` exists and is not empty
3. Generates the correct Prisma client (DocumentDB reuses the MongoDB client)
4. Checks Prisma migration state for the selected database
5. Runs `prisma migrate` for PostgreSQL or `prisma db push` for MongoDB/DocumentDB
6. Prints next steps (database connectivity health checks now happen during `frigg start`)

**Options:**
- `--mongodb` - Force MongoDB-compatible configuration (also applies to AWS DocumentDB)
- `--postgresql` - Force PostgreSQL configuration
- `--generate-only` - Only generate Prisma client, don't push schema
- `--verbose` - Show detailed progress and Prisma output

**Example Output (MongoDB/DocumentDB):**
```
🗄️  Setting up database...
✓ DATABASE_URL found
✓ Database type detected: AWS DocumentDB (MongoDB-compatible)
✓ Generating Prisma client for mongodb...
✓ Prisma client generated successfully
✓ Pushing schema to database...
✓ Database schema synchronized

Database setup complete!
```

> **AWS DocumentDB notes:** Use a MongoDB-style connection string that includes `tls=true`, `replicaSet=rs0`, and `retryWrites=false`. The CLI automatically treats `database.documentDB.enable` as MongoDB-compatible during setup.

**Error Handling:**
- Validates `DATABASE_URL` format for each database type
- Provides helpful error messages for:
  - Connection timeout
  - Invalid credentials
  - Network issues
  - Schema validation errors
- Suggests fixes based on error type

---

#### `frigg generate <type> <name>`

Generate boilerplate code for integrations, handlers, or tests.

**Usage:**
```bash
frigg generate integration shopify
frigg generate handler payment-webhook
frigg generate test integration-shopify
```

**What it does:**
- Creates file structure from templates
- Generates TypeScript or JavaScript based on project
- Includes proper imports and exports
- Follows Frigg framework conventions
- Updates relevant configuration files

**Types:**
- `integration` - New integration module
- `handler` - API handler/route
- `test` - Test file
- `migration` - Database migration

**Options:**
- `--typescript` - Generate TypeScript files
- `--javascript` - Generate JavaScript files
- `--template <name>` - Use specific template

**Example Output:**
```
✨ Generating integration: shopify

Created files:
  ✓ backend/integrations/shopify/index.js
  ✓ backend/integrations/shopify/api.js
  ✓ backend/integrations/shopify/config.js
  ✓ backend/integrations/shopify/definition.js
  ✓ backend/integrations/shopify/__tests__/integration.test.js

Updated files:
  ✓ backend/index.js (added integration import)

Next steps:
  1. Configure OAuth settings in definition.js
  2. Implement API methods in api.js
  3. Add integration to app definition
  4. Run tests: npm test shopify
```

---

### New Infrastructure Health Commands

#### `frigg doctor [options]`

**Status:** Planned (implementation in progress)

Run comprehensive health check on deployed infrastructure.

**Usage:**
```bash
frigg doctor
frigg doctor --stack my-app-prod
frigg doctor --region us-west-2
frigg doctor --verbose
frigg doctor --format json
```

**What it does:**
1. Discovers resources in CloudFormation stack
2. Discovers resources in cloud provider (AWS/GCP/Azure)
3. Compares desired state (app definition) with actual state
4. Detects infrastructure issues:
   - **Orphaned Resources** - Resources exist in cloud but not in stack
   - **Missing Resources** - Resources defined in stack but don't exist
   - **Drifted Resources** - Properties differ between stack and actual
   - **Property Mismatches** - Configuration drift on specific properties
5. Calculates health score (0-100)
6. Provides actionable remediation suggestions

**Options:**
- `--stack <name>` - CloudFormation stack name (default: from app definition)
- `--region <region>` - Cloud provider region
- `--format <format>` - Output format: `table` (default), `json`, `yaml`
- `--verbose` - Show detailed property comparisons
- `--check <domain>` - Check specific domain only: `vpc`, `kms`, `aurora`, `all`
- `--exit-code` - Exit with non-zero code if unhealthy (for CI/CD)

**Example Output:**

```
🩺 Running infrastructure health check...

Stack: my-app-prod (us-east-1)
Region: us-east-1
Account: 123456789012

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEALTH SCORE: 65 (degraded)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Resource Summary
  ✓ 12 resources healthy
  ⚠  3 resources with warnings
  ✗ 2 critical issues

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL ISSUES (2)

[1] Orphaned Resource
    Type: AWS::RDS::DBCluster
    Physical ID: my-app-prod-aurora-cluster
    Status: ORPHANED
    Issue: Resource exists in AWS but not managed by CloudFormation stack
    Impact: Stack doesn't track this resource. Manual deletion could break app.

    Resolution: Run 'frigg repair --import' to import into stack

[2] Property Mismatch (Immutable)
    Resource: ProductionBucket (AWS::S3::Bucket)
    Property: BucketName
    Expected: my-app-prod-bucket-v2
    Actual: my-app-prod-bucket-v1
    Mutability: IMMUTABLE
    Impact: Requires resource replacement to fix

    Resolution: Run 'frigg repair --reconcile' to plan replacement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  WARNINGS (3)

[1] Property Drift (Mutable)
    Resource: ProdVPC (AWS::EC2::VPC)
    Property: Tags
    Expected: [{"Key": "Environment", "Value": "production"}]
    Actual: [{"Key": "Env", "Value": "prod"}]
    Mutability: MUTABLE
    Impact: Configuration drift - can be auto-fixed

    Resolution: Run 'frigg repair --reconcile'

[2] Property Drift (Mutable)
    Resource: FriggKMSKey (AWS::KMS::Key)
    Property: EnableKeyRotation
    Expected: true
    Actual: false
    Mutability: MUTABLE
    Impact: Key rotation disabled - security risk

    Resolution: Run 'frigg repair --reconcile'

[3] Missing Tag
    Resource: LambdaExecutionRole (AWS::IAM::Role)
    Expected Tag: CostCenter
    Impact: Cost tracking incomplete

    Resolution: Update app definition and redeploy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 RECOMMENDATIONS

High Priority:
  • Import orphaned Aurora cluster to prevent data loss
  • Plan S3 bucket replacement (requires downtime)

Medium Priority:
  • Fix 2 mutable property drifts
  • Enable KMS key rotation for security

Low Priority:
  • Add missing tags for cost tracking

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
  1. Review critical issues above
  2. Run 'frigg repair' to fix detected issues
  3. Re-run 'frigg doctor' to verify fixes

For detailed report: frigg doctor --format json > health-report.json
```

**JSON Output** (with `--format json`):
```json
{
  "stack": {
    "name": "my-app-prod",
    "region": "us-east-1",
    "accountId": "123456789012"
  },
  "healthScore": 65,
  "assessment": "degraded",
  "summary": {
    "healthy": 12,
    "warnings": 3,
    "critical": 2,
    "total": 17
  },
  "issues": [
    {
      "severity": "critical",
      "type": "orphaned_resource",
      "resource": {
        "type": "AWS::RDS::DBCluster",
        "physicalId": "my-app-prod-aurora-cluster",
        "state": "ORPHANED"
      },
      "description": "Resource exists in AWS but not managed by stack",
      "impact": "Stack doesn't track this resource",
      "resolution": {
        "command": "frigg repair --import",
        "canAutoFix": true
      }
    },
    {
      "severity": "critical",
      "type": "property_mismatch",
      "resource": {
        "logicalId": "ProductionBucket",
        "type": "AWS::S3::Bucket",
        "physicalId": "my-app-prod-bucket-v1"
      },
      "mismatch": {
        "propertyPath": "Properties.BucketName",
        "expected": "my-app-prod-bucket-v2",
        "actual": "my-app-prod-bucket-v1",
        "mutability": "IMMUTABLE"
      },
      "impact": "Requires resource replacement",
      "resolution": {
        "command": "frigg repair --reconcile",
        "canAutoFix": false,
        "requiresReplacement": true
      }
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "action": "Import orphaned Aurora cluster",
      "reason": "Prevent data loss"
    },
    {
      "priority": "high",
      "action": "Plan S3 bucket replacement",
      "reason": "Requires downtime coordination"
    }
  ],
  "timestamp": "2025-10-26T01:23:45.678Z"
}
```

**Exit Codes** (with `--exit-code`):
- `0` - Healthy (score >= 80)
- `1` - Degraded (score 40-79)
- `2` - Unhealthy (score < 40)
- `3` - Error running health check

**Use Cases:**
- **Pre-deployment validation** - Run before deploy to catch issues
- **CI/CD health gates** - Fail pipeline if score below threshold
- **Scheduled audits** - Cron job to monitor infrastructure drift
- **Incident investigation** - Diagnose production issues
- **Compliance checks** - Verify security configurations

---

#### `frigg repair [options]`

**Status:** Planned (implementation in progress)

Repair infrastructure issues detected by `frigg doctor`.

**Usage:**
```bash
frigg repair                              # Interactive mode
frigg repair --import                     # Import orphaned resources
frigg repair --reconcile                  # Fix property mismatches
frigg repair --clean-deploy               # Delete and recreate resources
frigg repair --auto                       # Auto-fix all fixable issues (CI/CD mode)
frigg repair --dry-run                    # Show what would be fixed
frigg repair --issue <id>                 # Fix specific issue only
```

**What it does:**

**Import Mode** (`--import`):
1. Discovers orphaned resources (exist in cloud, not in stack)
2. Validates resources are importable
3. Generates CloudFormation import change set
4. Displays resources to be imported
5. Confirms with user (unless --auto)
6. Executes CloudFormation import operation
7. Updates stack to track resources

**Reconcile Mode** (`--reconcile`):
1. Detects property mismatches (drift)
2. Categorizes by mutability:
   - **Mutable** - Can update without replacement
   - **Immutable** - Requires resource replacement
   - **Conditional** - Depends on other properties
3. Auto-fixes mutable properties
4. Plans replacement for immutable properties
5. Prompts for confirmation on destructive changes
6. Executes updates via CloudFormation

**Clean Deploy Mode** (`--clean-deploy`):
1. Identifies resources that can't be imported/reconciled
2. Plans deletion of problematic resources
3. Generates new resource definitions
4. Confirms destructive operation
5. Deletes old resources
6. Creates new resources via CloudFormation
7. Updates application references

**Options:**
- `--import` - Import orphaned resources into stack
- `--reconcile` - Fix property mismatches
- `--clean-deploy` - Delete and recreate resources
- `--auto` - Auto-fix without prompts (for CI/CD)
- `--dry-run` - Show planned changes without executing
- `--issue <id>` - Fix only specific issue from doctor report
- `--force` - Skip safety checks (dangerous!)
- `--backup` - Create backup before destructive operations

**Example Output:**

**Interactive Mode:**
```
🔧 Frigg Repair - Infrastructure Remediation

🩺 Running health check first...
Found 5 issues to repair:
  • 2 orphaned resources
  • 2 property mismatches (mutable)
  • 1 property mismatch (immutable)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What would you like to do?

[1] Import orphaned resources (2)
    ├─ AWS::RDS::DBCluster - my-app-prod-aurora-cluster
    └─ AWS::EC2::VPC - vpc-0abc123

[2] Fix mutable property drift (2) ⚡ Auto-fixable
    ├─ ProdVPC: Tags property mismatch
    └─ FriggKMSKey: EnableKeyRotation mismatch

[3] Plan immutable property replacement (1) ⚠️  Requires downtime
    └─ ProductionBucket: BucketName mismatch

[4] Fix all auto-fixable issues
[5] Show detailed repair plan
[Q] Quit

Select option [1-5, Q]:
```

**After selecting option 1 (Import):**
```
🔍 Analyzing resources for import...

Resources to import:
┌──────────────────────────────────────────────────────────────┐
│ Resource 1: Aurora Database Cluster                         │
├──────────────────────────────────────────────────────────────┤
│ Type:        AWS::RDS::DBCluster                            │
│ Physical ID: my-app-prod-aurora-cluster                     │
│ Logical ID:  AuroraCluster (will be assigned)              │
│ Status:      Ready for import                               │
│ Properties:  Will be matched from existing resource         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Resource 2: VPC                                             │
├──────────────────────────────────────────────────────────────┤
│ Type:        AWS::EC2::VPC                                  │
│ Physical ID: vpc-0abc123                                    │
│ Logical ID:  ProdVPC (will be assigned)                    │
│ Status:      Ready for import                               │
│ Properties:  Will be matched from existing resource         │
└──────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: CloudFormation Import Requirements

✓ Resources must be in a stable state
✓ Resources must be importable resource types
✓ Stack must be in UPDATE_COMPLETE or CREATE_COMPLETE state
✓ Import operation cannot be rolled back

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed with import? [y/N]: y

Creating CloudFormation change set for import...
✓ Change set created: import-2025-10-26-01-23-45

Reviewing change set...
✓ Validation passed

Executing import operation...
[████████████████████████████████] 100% - Importing resources

✓ AuroraCluster imported successfully
✓ ProdVPC imported successfully

Import completed! Resources are now managed by CloudFormation.

Next steps:
  • Run 'frigg doctor' to verify health improved
  • Future deploys will manage these resources
```

**After selecting option 2 (Fix Mutable Drift):**
```
🔄 Reconciling property mismatches...

Planned Updates:
┌──────────────────────────────────────────────────────────────┐
│ Update 1: ProdVPC (AWS::EC2::VPC)                           │
├──────────────────────────────────────────────────────────────┤
│ Property: Tags                                              │
│ Current:  [{"Key": "Env", "Value": "prod"}]                │
│ Desired:  [{"Key": "Environment", "Value": "production"}]  │
│ Impact:   No interruption                                   │
│ Auto-fix: ✓ Yes                                             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Update 2: FriggKMSKey (AWS::KMS::Key)                      │
├──────────────────────────────────────────────────────────────┤
│ Property: EnableKeyRotation                                 │
│ Current:  false                                             │
│ Desired:  true                                              │
│ Impact:   No interruption                                   │
│ Auto-fix: ✓ Yes                                             │
└──────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These changes are safe (no resource replacement required).

Proceed with updates? [y/N]: y

Applying updates via CloudFormation...
[████████████████████████████████] 100% - Updating stack

✓ ProdVPC tags updated
✓ FriggKMSKey rotation enabled

Property drift fixed! Stack now matches desired configuration.
```

**Dry Run Mode** (`--dry-run`):
```
🔬 Repair Dry Run - No changes will be made

Detected Issues:
  ✓ 2 orphaned resources → Would import via CloudFormation
  ✓ 2 mutable property drifts → Would update properties
  ✗ 1 immutable property drift → Requires manual intervention

Planned Actions:

[1] Import Resources
    Command: aws cloudformation create-change-set \
      --stack-name my-app-prod \
      --change-set-type IMPORT \
      --resources-to-import file://resources.json

[2] Update Properties
    Update: ProdVPC.Tags
      From: [{"Key": "Env", "Value": "prod"}]
      To:   [{"Key": "Environment", "Value": "production"}]

    Update: FriggKMSKey.EnableKeyRotation
      From: false
      To:   true

[3] Manual Action Required
    Resource: ProductionBucket
    Issue: BucketName is immutable
    Current: my-app-prod-bucket-v1
    Desired: my-app-prod-bucket-v2

    Resolution steps:
      1. Create new bucket: my-app-prod-bucket-v2
      2. Copy data from old bucket to new bucket
      3. Update application configuration
      4. Delete old bucket: my-app-prod-bucket-v1
      5. Update CloudFormation stack

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To execute repairs, run: frigg repair --auto
To execute specific issue: frigg repair --issue <id>
```

**Exit Codes:**
- `0` - Repairs completed successfully
- `1` - Some repairs failed
- `2` - Repairs require manual intervention
- `3` - Error during repair operation

**Safety Features:**
- **Confirmation prompts** for destructive operations
- **Dry-run mode** to preview changes
- **Backup creation** before deletions
- **Rollback support** via CloudFormation
- **Validation** before import/update
- **Issue-specific** repair to limit blast radius

**Use Cases:**
- **Import unmanaged resources** - Bring existing infrastructure under CloudFormation management
- **Fix configuration drift** - Align actual state with desired state
- **Clean up orphaned resources** - Remove resources outside stack control
- **Remediate security issues** - Fix misconfigurations automatically
- **CI/CD integration** - Auto-repair in deployment pipelines

---

## Multi-Cloud Provider Support

### Current Status
- **AWS**: Fully supported
- **GCP**: Planned
- **Azure**: Planned
- **Cloudflare**: Planned

### Architecture for Multi-Cloud

The CLI uses Hexagonal Architecture (Ports & Adapters) to support multiple cloud providers:

**Domain Layer** (Provider-Agnostic):
```
packages/devtools/infrastructure/domains/health/
  domain/           # Pure domain logic (no provider specifics)
    entities/       # Resource, Issue, StackHealthReport
    value-objects/  # HealthScore, ResourceState, PropertyMutability
    services/       # HealthScoreCalculator, DriftDetector

  application/      # Use cases (orchestration)
    use-cases/      # RunHealthCheck, RepairStack, ImportResource
    ports/          # Interfaces for adapters
      StackRepository.js         # Port interface
      ResourceDetector.js        # Port interface
      DriftDetector.js           # Port interface
```

**Infrastructure Layer** (Provider-Specific Adapters):
```
packages/devtools/infrastructure/domains/health/
  infrastructure/
    adapters/
      aws/          # AWS-specific implementations
        AWSStackRepository.js         # CloudFormation
        AWSResourceDetector.js        # AWS APIs (EC2, RDS, etc.)
        AWSCloudFormationImporter.js  # Import operations

      gcp/          # GCP-specific implementations (future)
        GCPStackRepository.js         # Deployment Manager
        GCPResourceDetector.js        # GCP APIs
        GCPDeploymentImporter.js

      azure/        # Azure-specific implementations (future)
        AzureStackRepository.js       # ARM Templates
        AzureResourceDetector.js      # Azure APIs
        AzureResourceImporter.js
```

**Provider Selection**:
```javascript
// App definition specifies provider
{
  provider: 'aws',  // or 'gcp', 'azure', 'cloudflare'
  region: 'us-east-1',
  // ... rest of definition
}

// CLI auto-selects correct adapter
const adapters = getAdaptersForProvider(appDefinition.provider);
const useCase = new RunHealthCheckUseCase({
  stackRepository: adapters.stackRepository,      // AWS/GCP/Azure
  resourceDetector: adapters.resourceDetector,    // Provider-specific
  driftDetector: adapters.driftDetector,          // Provider-specific
});
```

**Provider-Specific Domains**:

Some infrastructure domains are inherently provider-specific:

```
domains/
  networking/
    vpc-builder.js              # AWS VPC
    vnet-builder.js             # Azure VNet (future)
    network-builder.js          # GCP Network (future)

  database/
    aurora-builder.js           # AWS Aurora
    cloud-sql-builder.js        # GCP Cloud SQL (future)
    cosmos-db-builder.js        # Azure Cosmos DB (future)
```

Builder orchestrator selects appropriate builders based on provider:
```javascript
const orchestrator = new BuilderOrchestrator(
  getBuilders(appDefinition.provider) // Returns AWS/GCP/Azure builders
);
```

---

## Environment Variables

### Required (varies by features used)

**Database:**
- `DATABASE_URL` - Connection string for MongoDB or PostgreSQL

**AWS Deployment:**
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (or use --region flag)

**Encryption:**
- `KMS_KEY_ARN` - AWS KMS key ARN (or auto-discovered)
- `AES_KEY_ID` - AES key ID (if using AES encryption)
- `AES_KEY` - AES encryption key (32 characters)

**Optional:**
- `STAGE` - Deployment stage (default: 'dev')
- `FRIGG_SKIP_AWS_DISCOVERY` - Skip AWS resource discovery (speeds up local dev)
- `NODE_ENV` - Node environment (development, production, test)

### App-Defined Variables

Additional environment variables can be defined in your app definition:

```javascript
{
  environment: {
    JWT_SECRET: true,           // Mark as required
    STRIPE_API_KEY: true,
    SENDGRID_API_KEY: true,
    FEATURE_FLAG_X: true,
  }
}
```

These are validated during deploy and passed to Lambda functions.

---

## Configuration Files

### `index.js` (App Definition)

Entry point for your Frigg application:

```javascript
const { ModuleManager, IntegrationManager } = require('@friggframework/core');
const HubSpotIntegration = require('@friggframework/api-module-hubspot');

const Definition = {
  name: 'my-integration-app',
  version: '1.0.0',

  provider: 'aws',
  region: 'us-east-1',

  integrations: [
    {
      Definition: HubSpotIntegration.Definition,
      ownership: {
        queue: 'STACK',  // Create queue in CloudFormation
      },
    },
  ],

  database: {
    type: 'mongodb',
    ownership: 'STACK',  // Create Aurora in CloudFormation
  },

  vpc: {
    ownership: 'EXTERNAL',
    vpcId: 'vpc-0abc123',  // Use existing VPC
  },

  kms: {
    ownership: 'STACK',  // Create KMS key in CloudFormation
  },

  encryption: {
    useDefaultKMSForFieldLevelEncryption: true,
  },

  environment: {
    DATABASE_URL: true,
    JWT_SECRET: true,
  },
};

module.exports = { Definition };
```

### `infrastructure.js` (Generated)

This file is **generated** by the Frigg infrastructure composer and should not be edited manually. It's referenced by `osls deploy` command.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Frigg CLI Commands                                      │
│  • frigg install     • frigg deploy    • frigg doctor   │
│  • frigg search      • frigg start     • frigg repair   │
│  • frigg generate    • frigg db:setup                   │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ Infrastructure Composer                                 │
│  packages/devtools/infrastructure/                      │
│                                                         │
│  • Loads app definition (index.js)                     │
│  • Orchestrates domain builders                        │
│  • Generates serverless configuration                  │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ Domain Builders (Hexagonal Architecture)               │
│                                                         │
│  Discovery → Resolution → Building                     │
│                                                         │
│  • VpcBuilder         (networking)                     │
│  • KmsBuilder         (security)                       │
│  • AuroraBuilder      (database)                       │
│  • MigrationBuilder   (database)                       │
│  • IntegrationBuilder (integration)                    │
│  • SsmBuilder         (parameters)                     │
│  • WebsocketBuilder   (integration)                    │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ OSS-Serverless (Deployment)                            │
│  • Packages Lambda functions                           │
│  • Generates CloudFormation templates                  │
│  • Deploys to AWS                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Common Workflows

### Initial Project Setup

```bash
# 1. Install integrations
frigg install hubspot
frigg install stripe

# 2. Set up database
export DATABASE_URL="mongodb://localhost:27017/myapp"
frigg db:setup

# 3. Start local development
frigg start --frontend

# 4. Test integration flows locally
# Visit http://localhost:3000

# 5. Deploy to dev
frigg deploy --stage dev

# 6. Deploy to production
frigg deploy --stage production
```

### Infrastructure Health Workflow

```bash
# 1. Check infrastructure health
frigg doctor --stage production

# 2. Review issues (health score, orphaned resources, drift)

# 3. Fix auto-fixable issues
frigg repair --auto

# 4. Manually fix complex issues
frigg repair --issue 3

# 5. Verify health improved
frigg doctor --stage production
```

### Troubleshooting Deployment Issues

```bash
# 1. Enable verbose logging
frigg deploy --stage dev --verbose

# 2. Check for orphaned resources
frigg doctor --verbose

# 3. Import orphaned resources
frigg repair --import

# 4. Retry deployment
frigg deploy --stage dev --force
```

---

## Exit Codes

All commands follow consistent exit code conventions:

- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Network/API error
- `4` - Validation error
- `5` - User cancelled operation

---

## Getting Help

```bash
frigg --help                  # General help
frigg <command> --help        # Command-specific help
frigg --version               # Show version
```

**Community Support:**
- GitHub Issues: https://github.com/friggframework/frigg/issues
- Documentation: https://docs.friggframework.org
- Slack: Join via https://friggframework.org/#contact

---

## Package Structure & Global Installation

### Overview

The Frigg CLI is a standalone globally-installable npm package that can be installed via `npm i -g @friggframework/frigg-cli`. It includes version detection logic to automatically prefer local project installations when available.

### Package Structure

**@friggframework/frigg-cli** (standalone package)
```
├── package.json
│   ├── dependencies: @friggframework/core@^2.0.0-next.0
│   ├── dependencies: @friggframework/devtools@^2.0.0-next.0
│   └── publishConfig: { access: "public" }
└── index.js (with version detection wrapper)
```

**Key Changes from Previous Structure:**
- ✅ Replaced `workspace:*` with concrete versions (`^2.0.0-next.0`)
- ✅ Added `@friggframework/devtools` as dependency
- ✅ Added `publishConfig` for public npm publishing
- ✅ Removed bin entry from devtools package.json

**Note:** Since `@friggframework/devtools` is a dependency, the global install size includes devtools. The main benefit is proper version resolution (no `workspace:*` errors) and automatic local CLI preference.

### Version Detection Logic

When you run `frigg` (globally installed), the CLI:

1. **Checks for skip flag**
   - If `FRIGG_CLI_SKIP_VERSION_CHECK=true`, skips detection (prevents recursion)

2. **Looks for local installation**
   - Searches for `node_modules/@friggframework/frigg-cli` in current directory

3. **Compares versions**
   - Uses `semver.compare(localVersion, globalVersion)`

4. **Makes decision**:
   - **Local ≥ Global**: Uses local CLI (spawns subprocess)
   - **Global > Local**: Warns and uses global
   - **No local**: Uses global silently

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Global Install** | `npm i -g @friggframework/devtools` | `npm i -g @friggframework/frigg-cli` |
| **Dependencies** | workspace:* (broken) | Concrete versions (works) |
| **Version Preference** | No detection | Automatic local preference |
| **Version Warnings** | None | Mismatch alerts |
| **Publishability** | ❌ Fails | ✅ Works |
| **Local Project Isolation** | ❌ Uses global versions | ✅ Uses local versions when available |

### Publishing Workflow

```bash
# Publish to npm
cd packages/frigg-cli
npm version patch  # or minor, major
npm publish

# Users can now install globally
npm install -g @friggframework/frigg-cli

# And it will automatically use local versions when available
```

### Migration Path

**For existing users:**

```bash
# Step 1: Uninstall old global devtools
npm uninstall -g @friggframework/devtools

# Step 2: Install new global CLI
npm install -g @friggframework/frigg-cli

# Step 3: Update local project dependencies
npm install @friggframework/frigg-cli@latest
```

**For new projects:**

```bash
# Global CLI (once per machine)
npm install -g @friggframework/frigg-cli

# Local project dependencies
frigg init my-app
# (Will automatically include @friggframework/frigg-cli in package.json)
```

**Status:** ✅ Complete and tested (15 passing tests)

