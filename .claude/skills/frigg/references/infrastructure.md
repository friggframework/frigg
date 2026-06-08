# Infrastructure Reference

Frigg generates AWS infrastructure via Domain-Driven Design builders, deployed with **osls** (OSS-Serverless), a drop-in replacement for Serverless Framework v3.

## Table of Contents

- [Domain Builders](#domain-builders)
- [Generation Flow](#generation-flow)
- [Scheduler](#scheduler)
- [Health Domain](#health-domain)
- [AWS Resource Discovery](#aws-resource-discovery)
- [VPC Configuration](#vpc-configuration)
- [osls Usage](#osls-usage)
- [Doctor & Repair (deployed-stack health)](#doctor--repair-deployed-stack-health)
- [Common Infrastructure Troubleshooting](#common-infrastructure-troubleshooting)

## Domain Builders

`infrastructure-composer.js` orchestrates all domain builders via `BuilderOrchestrator`, composing the serverless definition from domain-specific configs and integrating with the `createFriggInfrastructure()` entry point.

```
domains/
├── networking/          # VPC, subnets, security groups — vpc-builder.js
├── security/            # KMS encryption keys, IAM generation — kms-builder.js
├── database/            # Aurora, migrations, Prisma layers — aurora-builder.js, migration-builder.js
├── parameters/          # SSM Parameter Store — ssm-builder.js
├── integration/         # Integrations & WebSocket APIs — integration-builder.js, websocket-builder.js
├── scheduler/           # EventBridge Scheduler for one-time jobs — scheduler-builder.js
├── health/              # CF stack health checks, drift detection, repair
│   ├── application/     # Use cases: RunHealthCheck, RepairViaImport
│   ├── domain/          # Value objects, services (MismatchAnalyzer, HealthScoreCalculator)
│   └── infrastructure/  # AWS adapters (StackRepository, ResourceDetector)
└── shared/              # builder-orchestrator.js, utilities/
```

Each builder implements:
- `shouldExecute(appDefinition)` — conditional execution
- `build(appDefinition)` — domain-specific resource generation
- Returns `{ resources, iamStatements, environment, functions, vpcConfig, plugins, custom }`

## Generation Flow

1. Load app definition from `backend/index.js`
2. `createFriggInfrastructure()` calls `composeServerlessDefinition()`
3. Create `BuilderOrchestrator` with all domain builders
4. Orchestrator executes builders (validation, dependencies, parallel execution)
5. Merge builder outputs into the base serverless definition
6. Write to `backend/infrastructure.js`
7. Deploy with `osls deploy`

## Scheduler

The scheduler builder (`scheduler/scheduler-builder.js`) auto-enables when any integration has `webhooks.enabled = true` (or explicitly via `appDefinition.scheduler.enable = true`). It creates an EventBridge Scheduler ScheduleGroup + an IAM role for EventBridge → SQS, enabling one-time scheduled jobs (e.g., webhook subscription renewals).

Schedule jobs from integration code with the scheduler command API:

```javascript
const { createSchedulerCommands } = require("@friggframework/core");

const schedulerCommands = createSchedulerCommands({ integrationName: "zoho" });

// Schedule a one-time job
await schedulerCommands.scheduleJob({
  jobId: `renewal-${integrationId}-${Date.now()}`,
  scheduledAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days
  event: "REFRESH_WEBHOOK",
  payload: { integrationId, executionId },
  queueUrl: process.env.ZOHO_QUEUE_URL, // standard Frigg env var
});

await schedulerCommands.deleteJob(jobId);
const status = await schedulerCommands.getJobStatus(jobId);
// status -> { exists: boolean, scheduledAt?: string, state?: string }
```

Key behaviors:
- Production uses AWS EventBridge Scheduler; local dev uses an in-memory mock (`SCHEDULER_PROVIDER=mock`, or `STAGE=local` auto-selects it)
- Schedules auto-delete after execution (`ActionAfterCompletion: DELETE`)
- SQS ARN is derived internally from the queue URL
- If the scheduler isn't configured, it logs a warning but doesn't fail (graceful degradation)

```bash
# Production (auto-detected)
SCHEDULER_ROLE_ARN=arn:aws:iam::...:role/...   # IAM role for EventBridge
ZOHO_QUEUE_URL=https://sqs...                  # integration queue URL (Frigg sets this)

# Local development
SCHEDULER_PROVIDER=mock
STAGE=local
```

## Health Domain

The `health/` domain powers `frigg doctor` and `frigg repair` using full hexagonal architecture (application/domain/infrastructure layers):
- `RunHealthCheckUseCase` — detects drift and orphaned resources vs CloudFormation
- `RepairViaImportUseCase` — imports orphaned resources and reconciles drift
- `MismatchAnalyzer` and `HealthScoreCalculator` are pure domain services

## AWS Resource Discovery

Automatic at build time (toggle off via `FRIGG_SKIP_AWS_DISCOVERY`): VPC/subnets/security groups, KMS keys, Aurora database, NAT Gateway and Elastic IP detection. `frigg build` skips discovery locally; `frigg build --production` enables it.

## VPC Configuration

Enable VPC for production deployments:

```javascript
const appDefinition = {
  vpc: {
    enable: true,             // deploy in private subnets
    createNew: false,         // use existing VPC (default)
    enableVPCEndpoints: true, // create VPC endpoints for AWS services
  },
};
```

## osls Usage

The Frigg CLI uses osls internally (`frigg build`/`frigg deploy`). Direct usage:

```bash
osls package --config infrastructure.js --stage prod
osls deploy  --config infrastructure.js --stage prod --verbose
osls info    --config infrastructure.js --stage prod
```

## Doctor & Repair (deployed-stack health)

```bash
# Audit a deployed CloudFormation stack
frigg doctor                                   # interactive stack selection
frigg doctor my-app-prod --region us-east-1
frigg doctor my-app-prod --format json --output report.json

# Fix issues found by doctor
frigg repair --import my-app-prod              # import orphaned resources
frigg repair --reconcile my-app-prod           # reconcile property drift
frigg repair --import --reconcile my-app-prod  # both

# Generate a deployment IAM CloudFormation stack
frigg generate-iam
frigg generate-iam --user my-deploy-user --stack-name my-iam-stack
```

## Common Infrastructure Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `Cannot find module './src/*'` | src/ excluded from Lambda | check if handler needs it; use env vars |
| `handler is undefined` | export mismatch | verify `module.exports = { handler }` |
| Port 3306 instead of 5432 | Aurora wrong port | set `Port: 5432` explicitly |
| Lambda can't connect to Aurora | missing security group | add self-referencing SG rule port 5432 |
