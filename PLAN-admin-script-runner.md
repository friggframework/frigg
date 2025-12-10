# Admin Script Runner Service - Implementation Plan

> **Status**: Planning (Updated for `next` branch architecture)
> **Target Branch**: `next`
> **Feature Branch**: `claude/add-admin-script-runner-*`

---

## Executive Summary

The Admin Script Runner enables Frigg adopters to write and execute scripts in a hosted environment with access to VPC/KMS-secured database connections. This is a **high-risk, high-value** feature requiring careful security controls.

### Core Use Cases
1. **Healing Scripts** - Fix broken integrations (e.g., Attio config corruption)
2. **Recurring Maintenance** - Webhook refreshers (e.g., Zoho channel expiry)
3. **Built-in Utilities** - OAuth refresh, DB cleanup, log rotation

---

## CRITICAL: `next` Branch Architecture Alignment

The `next` branch has a **fundamentally different architecture** from `main`:

| Aspect | `main` Branch | `next` Branch |
|--------|---------------|---------------|
| ORM | Mongoose | Prisma |
| Data Access | Direct Model calls | Command Pattern |
| DB Support | MongoDB only | MongoDB, PostgreSQL, DocumentDB |
| Repository | None | Interface + Factory Pattern |
| Encryption | Basic | Field-level KMS/AES encryption |

**This plan follows `next` branch patterns:**
- `createAdminScriptCommands()` factory (like `createIntegrationCommands()`)
- Repository interfaces with factory pattern
- Prisma schema definitions
- Encryption schema registry integration

---

## appDefinition Schema Update

**File to modify**: `/home/user/frigg/packages/devtools/infrastructure/domains/shared/types/app-definition.js`

Add `adminScripts` to the AppDefinition typedef:

```javascript
/**
 * Complete application definition
 * @typedef {Object} AppDefinition
 * @property {string} name - Application name
 * @property {string} stage - Deployment stage
 * @property {IntegrationDefinition[]} [integrations] - Integration definitions
 * @property {AdminScriptDefinition[]} [adminScripts] - Admin script definitions (NEW)
 * @property {AdminConfig} [admin] - Admin configuration (NEW)
 * ...
 */
```

**Usage in backend/index.js**:
```javascript
const Definition = {
    name: 'my-app',
    integrations: [
        HubSpotIntegration,
        SalesforceIntegration,
    ],

    // NEW: Admin scripts array (OPTIONAL)
    adminScripts: [
        AttioHealingScript,
        ZohoWebhookRefreshScript,
    ],

    // NEW: Admin configuration (OPTIONAL)
    admin: {
        includeBuiltinScripts: true,
    },

    database: { postgres: { enable: true } },
};

module.exports = { Definition };
```

---

## AdminScriptBase Definition Pattern

**Following IntegrationBase pattern from**: `/home/user/frigg/packages/core/integrations/integration-base.js:35-100`

```javascript
// packages/core/admin-scripts/admin-script-base.js

const { createScriptExecutionRepository } = require('./repositories/script-execution-repository-factory');
const { createAdminApiKeyRepository } = require('./repositories/admin-api-key-repository-factory');

class AdminScriptBase {
    // Class-level repository instances (like IntegrationBase lines 37-44)
    scriptExecutionRepository = createScriptExecutionRepository();
    adminApiKeyRepository = createAdminApiKeyRepository();

    /**
     * CHILDREN SHOULD SPECIFY A DEFINITION FOR THE SCRIPT
     * Pattern matches IntegrationBase.Definition (lines 57-69)
     */
    static Definition = {
        name: 'Script Name',                    // Required: unique identifier
        version: '0.0.0',                       // Required: semver for migrations
        description: 'What this script does',  // Required: human-readable

        // Script-specific properties
        source: 'USER_DEFINED',                 // 'BUILTIN' | 'USER_DEFINED'

        inputSchema: null,                      // Optional: JSON Schema for params
        outputSchema: null,                     // Optional: JSON Schema for results

        schedule: {                             // Optional: Phase 2
            enabled: false,
            cronExpression: null,               // 'cron(0 12 * * ? *)'
        },

        config: {
            timeout: 300000,                    // Default 5 min (ms)
            maxRetries: 0,
            requiresIntegrationFactory: false,  // Hint: does script need to instantiate integrations?
        },

        display: {                              // For future UI
            label: 'Script Name',
            description: '',
            category: 'maintenance',            // 'maintenance' | 'healing' | 'sync' | 'custom'
        },
    };

    static getName() {
        return this.Definition.name;
    }

    static getCurrentVersion() {
        return this.Definition.version;
    }

    static getDefinition() {
        return this.Definition;
    }

    /**
     * Constructor receives dependencies
     * Pattern matches IntegrationBase constructor (lines 81-100)
     */
    constructor(params = {}) {
        this.executionId = params.executionId || null;
        this.logs = [];
        this._startTime = null;

        // OPTIONAL: Integration factory for scripts that need it
        this.integrationFactory = params.integrationFactory || null;

        // Injected repositories (can override class-level)
        if (params.scriptExecutionRepository) {
            this.scriptExecutionRepository = params.scriptExecutionRepository;
        }
        if (params.adminApiKeyRepository) {
            this.adminApiKeyRepository = params.adminApiKeyRepository;
        }
    }

    /**
     * CHILDREN MUST IMPLEMENT THIS METHOD
     * @param {AdminFriggCommands} frigg - Helper commands object
     * @param {Object} params - Script parameters (validated against inputSchema)
     * @returns {Promise<Object>} - Script results (validated against outputSchema)
     */
    async execute(frigg, params) {
        throw new Error('AdminScriptBase.execute() must be implemented by subclass');
    }

    // Logging helper
    log(level, message, data = {}) {
        const entry = {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
        this.logs.push(entry);
        return entry;
    }

    getLogs() {
        return this.logs;
    }
}

module.exports = { AdminScriptBase };
```

---

## Architecture Decision Records

### ADR-1: Follow Definition Pattern from IntegrationBase

**Decision**: Create `AdminScriptBase` with `static Definition` matching IntegrationBase pattern.

**Reference**: `/home/user/frigg/packages/core/integrations/integration-base.js:57-69`

**Rationale**:
- Consistent with existing Frigg patterns
- Familiar to Frigg developers
- Supports versioning and migrations
- Enables validation at load time

### ADR-2: Repository Factory Pattern (No-Arg Constructors)

**Decision**: Create repository factories following existing pattern.

**Reference**: `/home/user/frigg/packages/core/integrations/repositories/integration-repository-factory.js`

**Pattern**:
```javascript
// Factory returns instance with NO arguments
function createScriptExecutionRepository() {
    const dbType = config.DB_TYPE;
    switch (dbType) {
        case 'mongodb': return new ScriptExecutionRepositoryMongo();
        case 'postgresql': return new ScriptExecutionRepositoryPostgres();
        case 'documentdb': return new ScriptExecutionRepositoryDocumentDB();
        default: throw new Error(`Unsupported database type: ${dbType}`);
    }
}
```

### ADR-3: Optional IntegrationFactory

**Decision**: `integrationFactory` is OPTIONAL for admin scripts.

**Rationale**:
- Many scripts only need database access (cleanup, reporting)
- Scripts that need to call external APIs require `integrationFactory`
- Fail-fast with clear error if script needs factory but none provided

**Implementation**:
```javascript
// Scripts declare their needs via Definition.config
static Definition = {
    config: {
        requiresIntegrationFactory: true,  // or false
    }
};

// ScriptRunner validates before execution
if (scriptClass.Definition.config.requiresIntegrationFactory && !integrationFactory) {
    throw new Error(`Script "${scriptName}" requires integrationFactory`);
}
```

### ADR-4: Separate adminScripts Array in appDefinition

**Decision**: Add `adminScripts[]` to appDefinition schema (separate from `integrations[]`).

**Reference**: `/home/user/frigg/packages/devtools/infrastructure/domains/shared/types/app-definition.js`

**Rationale**:
- Clear separation of concerns
- Scripts are operational, integrations are domain
- Can be deployed independently

### ADR-5: Execution Modes (Sync vs Async)

**Decision**: One-off scripts support both synchronous and asynchronous execution.

**Behavior**:
- **Default**: Asynchronous (queued) with execution ID returned immediately
- **Optional**: Synchronous for simple scripts (dev's responsibility for timeout)

**Implementation**:
```javascript
// POST /admin/scripts/:scriptName/execute
{
    "params": { /* script parameters */ },
    "mode": "async"  // "async" (default) | "sync"
}

// Response for async
{
    "executionId": "exec_abc123",
    "status": "PENDING",
    "scriptName": "attio-healing",
    "message": "Script queued for execution"
}

// Response for sync (returns when complete)
{
    "executionId": "exec_abc123",
    "status": "COMPLETED",
    "scriptName": "attio-healing",
    "output": { /* script result */ },
    "metrics": { "durationMs": 1234 }
}
```

**Rationale**:
- Async is safer (Lambda timeout protection, queue durability)
- Sync is convenient for simple scripts and debugging
- Developer chooses based on script complexity

### ADR-6: Hybrid Scheduling Approach

**Decision**: Script schedules can come from Definition (hardcoded) OR database/API (runtime).

**Priority Order** (highest to lowest):
1. **Database/API override** - Runtime schedule stored in `ScriptSchedule` model
2. **Definition default** - `static Definition.schedule` in script class

**Implementation**:
```javascript
// 1. Definition default (hardcoded in script)
class ZohoWebhookRefreshScript extends AdminScriptBase {
    static Definition = {
        name: 'zoho-webhook-refresh',
        schedule: {
            enabled: true,
            cronExpression: 'cron(0 */12 * * ? *)',  // Every 12 hours
        }
    };
}

// 2. Database override (via API or seed)
// POST /admin/scripts/:scriptName/schedule
{
    "enabled": true,
    "cronExpression": "cron(0 6 * * ? *)",  // Override to 6 AM daily
    "timezone": "America/New_York"
}
```

**New Model**:
```prisma
model ScriptSchedule {
    id              String    @id @default(auto()) @map("_id") @db.ObjectId
    scriptName      String    @unique
    enabled         Boolean   @default(false)
    cronExpression  String?
    timezone        String    @default("UTC")
    lastTriggeredAt DateTime?
    nextTriggerAt   DateTime?
    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt

    // AWS EventBridge Rule ARN (if provisioned)
    awsRuleArn      String?
    awsRuleName     String?
}
```

**Rationale**:
- Definition provides sensible defaults
- API allows runtime modification without code changes
- Supports multi-tenant scenarios with different schedules

### ADR-7: DDD/Hexagonal Architecture for Admin Scripts

**Decision**: Follow the established DDD/Hexagonal architecture patterns from devtools.

**Reference Files**:
- `/home/user/frigg/packages/devtools/infrastructure/domains/shared/base-builder.js`
- `/home/user/frigg/packages/devtools/infrastructure/domains/shared/providers/cloud-provider-adapter.js`
- `/home/user/frigg/packages/devtools/infrastructure/domains/integration/integration-builder.js`

**Architecture Layers**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ Adapter Layer (Handlers/Routers)                                    │
│  packages/admin-scripts/src/infrastructure/                         │
│  - admin-script-router.js                                           │
│  - admin-auth-middleware.js                                         │
│  - create-script-handler.js                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ calls
┌──────────────────────────▼──────────────────────────────────────────┐
│ Application Layer (Use Cases / Commands)                            │
│  packages/admin-scripts/src/application/                            │
│  - script-runner.js (orchestrates execution)                        │
│  - script-factory.js (registry & instantiation)                     │
│  - admin-frigg-commands.js (helper API for scripts)                 │
│  packages/core/application/commands/                                │
│  - admin-script-commands.js (API key & execution management)        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ calls
┌──────────────────────────▼──────────────────────────────────────────┐
│ Infrastructure Layer (Adapters / Repositories)                      │
│  packages/core/admin-scripts/repositories/                          │
│  - script-execution-repository-*.js                                 │
│  - admin-api-key-repository-*.js                                    │
│  packages/admin-scripts/src/adapters/                               │
│  - scheduler-adapter.js (port interface)                            │
│  - aws-scheduler-adapter.js (EventBridge implementation)            │
│  - local-scheduler-adapter.js (dev/test implementation)             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ accesses
┌──────────────────────────▼──────────────────────────────────────────┐
│ External Systems                                                    │
│  - Prisma (MongoDB, PostgreSQL, DocumentDB)                         │
│  - AWS EventBridge Scheduler                                        │
│  - SQS Queues                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### ADR-8: Scheduler Adapter Pattern (EventBridge)

**Decision**: Create scheduler adapter following `CloudProviderAdapter` pattern.

**Reference**: `/home/user/frigg/packages/devtools/infrastructure/domains/shared/providers/cloud-provider-adapter.js`

**Port Interface** (Abstract):
```javascript
// packages/admin-scripts/src/adapters/scheduler-adapter.js

/**
 * Scheduler Adapter (Abstract Base Class)
 *
 * Port - Hexagonal Architecture
 *
 * Defines the contract for scheduler implementations.
 * Supports AWS EventBridge, local cron, or other providers.
 */
class SchedulerAdapter {
    getName() {
        throw new Error('SchedulerAdapter.getName() must be implemented');
    }

    /**
     * Create or update a schedule for a script
     * @param {Object} config
     * @param {string} config.scriptName - Script identifier
     * @param {string} config.cronExpression - Cron expression
     * @param {Object} [config.input] - Optional input params
     * @returns {Promise<Object>} Created schedule { ruleArn, ruleName }
     */
    async createSchedule(config) {
        throw new Error('SchedulerAdapter.createSchedule() must be implemented');
    }

    /**
     * Delete a schedule
     * @param {string} scriptName - Script identifier
     * @returns {Promise<void>}
     */
    async deleteSchedule(scriptName) {
        throw new Error('SchedulerAdapter.deleteSchedule() must be implemented');
    }

    /**
     * Enable or disable a schedule
     * @param {string} scriptName - Script identifier
     * @param {boolean} enabled - Whether to enable
     * @returns {Promise<void>}
     */
    async setScheduleEnabled(scriptName, enabled) {
        throw new Error('SchedulerAdapter.setScheduleEnabled() must be implemented');
    }

    /**
     * List all schedules
     * @returns {Promise<Array>} List of schedules
     */
    async listSchedules() {
        throw new Error('SchedulerAdapter.listSchedules() must be implemented');
    }
}

module.exports = { SchedulerAdapter };
```

**AWS Implementation**:
```javascript
// packages/admin-scripts/src/adapters/aws-scheduler-adapter.js

const { SchedulerAdapter } = require('./scheduler-adapter');

// Lazy-loaded AWS SDK clients (following AWSProviderAdapter pattern)
let SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand,
    GetScheduleCommand, UpdateScheduleCommand, ListSchedulesCommand;

function loadSchedulerSDK() {
    if (!SchedulerClient) {
        const schedulerModule = require('@aws-sdk/client-scheduler');
        SchedulerClient = schedulerModule.SchedulerClient;
        CreateScheduleCommand = schedulerModule.CreateScheduleCommand;
        DeleteScheduleCommand = schedulerModule.DeleteScheduleCommand;
        GetScheduleCommand = schedulerModule.GetScheduleCommand;
        UpdateScheduleCommand = schedulerModule.UpdateScheduleCommand;
        ListSchedulesCommand = schedulerModule.ListSchedulesCommand;
    }
}

class AWSSchedulerAdapter extends SchedulerAdapter {
    constructor({ region, credentials, targetLambdaArn, scheduleGroupName }) {
        super();
        this.region = region || process.env.AWS_REGION || 'us-east-1';
        this.credentials = credentials;
        this.targetLambdaArn = targetLambdaArn;
        this.scheduleGroupName = scheduleGroupName || 'frigg-admin-scripts';
        this.scheduler = null;
    }

    getSchedulerClient() {
        if (!this.scheduler) {
            loadSchedulerSDK();
            this.scheduler = new SchedulerClient({
                region: this.region,
                ...this.credentials,
            });
        }
        return this.scheduler;
    }

    getName() {
        return 'aws-eventbridge-scheduler';
    }

    async createSchedule({ scriptName, cronExpression, timezone, input }) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        const command = new CreateScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            ScheduleExpression: cronExpression,
            ScheduleExpressionTimezone: timezone || 'UTC',
            FlexibleTimeWindow: { Mode: 'OFF' },
            Target: {
                Arn: this.targetLambdaArn,
                RoleArn: process.env.SCHEDULER_ROLE_ARN,
                Input: JSON.stringify({
                    scriptName,
                    trigger: 'SCHEDULED',
                    params: input || {},
                }),
            },
            State: 'ENABLED',
        });

        const response = await client.send(command);
        return {
            ruleArn: response.ScheduleArn,
            ruleName: scheduleName,
        };
    }

    async deleteSchedule(scriptName) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        await client.send(new DeleteScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
        }));
    }

    async setScheduleEnabled(scriptName, enabled) {
        const client = this.getSchedulerClient();
        const scheduleName = `frigg-script-${scriptName}`;

        await client.send(new UpdateScheduleCommand({
            Name: scheduleName,
            GroupName: this.scheduleGroupName,
            State: enabled ? 'ENABLED' : 'DISABLED',
        }));
    }

    async listSchedules() {
        const client = this.getSchedulerClient();

        const response = await client.send(new ListSchedulesCommand({
            GroupName: this.scheduleGroupName,
        }));

        return response.Schedules || [];
    }
}

module.exports = { AWSSchedulerAdapter };
```

**Local Implementation** (for dev/test):
```javascript
// packages/admin-scripts/src/adapters/local-scheduler-adapter.js

const { SchedulerAdapter } = require('./scheduler-adapter');

class LocalSchedulerAdapter extends SchedulerAdapter {
    constructor() {
        super();
        this.schedules = new Map();
        this.intervals = new Map();
    }

    getName() {
        return 'local-cron';
    }

    async createSchedule({ scriptName, cronExpression, input }) {
        // Store schedule (actual cron execution would use node-cron)
        this.schedules.set(scriptName, {
            scriptName,
            cronExpression,
            input,
            enabled: true,
            createdAt: new Date().toISOString(),
        });
        return { ruleName: scriptName };
    }

    async deleteSchedule(scriptName) {
        this.schedules.delete(scriptName);
        if (this.intervals.has(scriptName)) {
            clearInterval(this.intervals.get(scriptName));
            this.intervals.delete(scriptName);
        }
    }

    async setScheduleEnabled(scriptName, enabled) {
        const schedule = this.schedules.get(scriptName);
        if (schedule) {
            schedule.enabled = enabled;
        }
    }

    async listSchedules() {
        return Array.from(this.schedules.values());
    }
}

module.exports = { LocalSchedulerAdapter };
```

### ADR-9: AdminScriptBuilder for Infrastructure Generation

**Decision**: Create `AdminScriptBuilder` following the existing builder pattern.

**Reference**:
- `/home/user/frigg/packages/devtools/infrastructure/domains/shared/base-builder.js`
- `/home/user/frigg/packages/devtools/infrastructure/domains/integration/integration-builder.js`

**Implementation**:
```javascript
// packages/devtools/infrastructure/domains/admin-scripts/admin-script-builder.js

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

/**
 * Admin Script Builder
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Creating SQS queue for admin script execution
 * - Creating Lambda function for script execution
 * - Creating EventBridge Scheduler resources (Phase 2)
 * - Creating IAM roles for scheduler to invoke Lambda
 */
class AdminScriptBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'AdminScriptBuilder';
    }

    shouldExecute(appDefinition) {
        return Array.isArray(appDefinition.adminScripts) && appDefinition.adminScripts.length > 0;
    }

    getDependencies() {
        return []; // Can run independently
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.adminScripts) {
            return result; // Not an error, just no scripts
        }

        if (!Array.isArray(appDefinition.adminScripts)) {
            result.addError('adminScripts must be an array');
            return result;
        }

        // Validate each script
        appDefinition.adminScripts.forEach((script, index) => {
            if (!script?.Definition?.name) {
                result.addError(`Admin script at index ${index} is missing Definition or name`);
            }
        });

        return result;
    }

    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring admin scripts...`);
        console.log(`  Processing ${appDefinition.adminScripts.length} scripts...`);

        const usePrismaLayer = appDefinition.usePrismaLambdaLayer !== false;
        const adminConfig = appDefinition.admin || {};

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
            iamStatements: [],
        };

        // Create admin script queue
        this.createAdminScriptQueue(result);

        // Create Lambda function for script execution
        this.createScriptExecutorFunction(result, usePrismaLayer);

        // Create API routes for script management
        this.createAdminScriptRoutes(result, usePrismaLayer);

        // Phase 2: Create EventBridge Scheduler resources
        if (adminConfig.enableScheduling) {
            this.createSchedulerResources(appDefinition, result);
        }

        // Log registered scripts
        appDefinition.adminScripts.forEach(script => {
            const name = script.Definition?.name || 'unknown';
            const schedule = script.Definition?.schedule;
            console.log(`    ✓ Registered: ${name}${schedule?.enabled ? ' (scheduled)' : ''}`);
        });

        console.log(`[${this.name}] ✅ Admin script configuration completed`);
        return result;
    }

    createAdminScriptQueue(result) {
        result.resources.AdminScriptQueue = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: '${self:service}-${self:provider.stage}-AdminScriptQueue',
                MessageRetentionPeriod: 86400, // 1 day
                VisibilityTimeout: 900, // 15 minutes (Lambda max)
                RedrivePolicy: {
                    maxReceiveCount: 3,
                    deadLetterTargetArn: {
                        'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                    },
                },
            },
        };

        result.environment.ADMIN_SCRIPT_QUEUE_URL = { Ref: 'AdminScriptQueue' };
        console.log('  ✓ Created AdminScriptQueue');
    }

    createScriptExecutorFunction(result, usePrismaLayer) {
        result.functions.adminScriptExecutor = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler',
            skipEsbuild: true,
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 900, // 15 minutes max
            memorySize: 1024,
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['AdminScriptQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ],
        };
        console.log('  ✓ Created adminScriptExecutor function');
    }

    createAdminScriptRoutes(result, usePrismaLayer) {
        result.functions.adminScriptRouter = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/admin-script-router.handler',
            skipEsbuild: true,
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 30,
            events: [
                // List scripts
                { httpApi: { path: '/admin/scripts', method: 'GET' } },
                // Get script details
                { httpApi: { path: '/admin/scripts/{scriptName}', method: 'GET' } },
                // Execute script (sync or async)
                { httpApi: { path: '/admin/scripts/{scriptName}/execute', method: 'POST' } },
                // Get execution status
                { httpApi: { path: '/admin/executions/{executionId}', method: 'GET' } },
                // List executions
                { httpApi: { path: '/admin/executions', method: 'GET' } },
                // Schedule management (Phase 2)
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'GET' } },
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'PUT' } },
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'DELETE' } },
            ],
        };
        console.log('  ✓ Created adminScriptRouter function');
    }

    createSchedulerResources(appDefinition, result) {
        // Create IAM role for EventBridge Scheduler
        result.resources.AdminScriptSchedulerRole = {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: '${self:service}-${self:provider.stage}-admin-script-scheduler',
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: { Service: 'scheduler.amazonaws.com' },
                        Action: 'sts:AssumeRole',
                    }],
                },
                Policies: [{
                    PolicyName: 'InvokeLambda',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: 'lambda:InvokeFunction',
                            Resource: { 'Fn::GetAtt': ['AdminScriptExecutorLambdaFunction', 'Arn'] },
                        }],
                    },
                }],
            },
        };

        // Create schedule group
        result.resources.AdminScriptScheduleGroup = {
            Type: 'AWS::Scheduler::ScheduleGroup',
            Properties: {
                Name: '${self:service}-${self:provider.stage}-admin-scripts',
            },
        };

        result.environment.SCHEDULER_ROLE_ARN = { 'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'] };
        result.environment.SCHEDULE_GROUP_NAME = { Ref: 'AdminScriptScheduleGroup' };

        console.log('  ✓ Created EventBridge Scheduler resources');
    }
}

module.exports = { AdminScriptBuilder };
```

### Wiring AdminScriptBuilder into Deployment

**File to modify**: `/home/user/frigg/packages/devtools/infrastructure/infrastructure-composer.js`

The `AdminScriptBuilder` must be registered with the `BuilderOrchestrator` to be included in the serverless template generation:

```javascript
// packages/devtools/infrastructure/infrastructure-composer.js

// Add import
const { AdminScriptBuilder } = require('./domains/admin-scripts/admin-script-builder');

// Register in orchestrator (line ~46-54)
const orchestrator = new BuilderOrchestrator([
    new VpcBuilder(),
    new KmsBuilder(),
    new AuroraBuilder(),
    new MigrationBuilder(),
    new SsmBuilder(),
    new WebsocketBuilder(),
    new IntegrationBuilder(),
    new AdminScriptBuilder(),    // NEW: Admin script infrastructure
]);
```

**Deployment Flow**:
```
1. User runs `frigg deploy` or `serverless deploy`
   ↓
2. serverless.js calls composeServerlessDefinition(AppDefinition)
   ↓
3. BuilderOrchestrator validates each builder's shouldExecute()
   - AdminScriptBuilder.shouldExecute() returns true if adminScripts[] exists
   ↓
4. Builders execute in dependency order
   - AdminScriptBuilder has no dependencies, can run in parallel
   ↓
5. AdminScriptBuilder.build() generates:
   - AdminScriptQueue (SQS)
   - adminScriptExecutor (Lambda function)
   - adminScriptRouter (Lambda function with HTTP routes)
   - EventBridge Scheduler resources (if admin.enableScheduling = true)
   ↓
6. BuilderOrchestrator.mergeResults() combines all builder outputs
   ↓
7. Final serverless.yml includes:
   - functions: { adminScriptExecutor, adminScriptRouter, ... }
   - resources: { AdminScriptQueue, AdminScriptSchedulerRole, ... }
   - provider.environment: { ADMIN_SCRIPT_QUEUE_URL, ... }
```

**Generated Serverless Resources** (when `adminScripts[]` is defined):
```yaml
# serverless.yml (generated)
functions:
  adminScriptExecutor:
    handler: node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler
    timeout: 900
    memorySize: 1024
    layers:
      - Ref: PrismaLambdaLayer
    events:
      - sqs:
          arn: !GetAtt AdminScriptQueue.Arn
          batchSize: 1

  adminScriptRouter:
    handler: node_modules/@friggframework/admin-scripts/src/infrastructure/admin-script-router.handler
    timeout: 30
    layers:
      - Ref: PrismaLambdaLayer
    events:
      - httpApi: { path: '/admin/scripts', method: GET }
      - httpApi: { path: '/admin/scripts/{scriptName}', method: GET }
      - httpApi: { path: '/admin/scripts/{scriptName}/execute', method: POST }
      - httpApi: { path: '/admin/executions/{executionId}', method: GET }
      - httpApi: { path: '/admin/executions', method: GET }

resources:
  Resources:
    AdminScriptQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: ${self:service}-${self:provider.stage}-AdminScriptQueue
        MessageRetentionPeriod: 86400
        VisibilityTimeout: 900
        RedrivePolicy:
          maxReceiveCount: 3
          deadLetterTargetArn: !GetAtt InternalErrorQueue.Arn
```

---

## Domain Model (Prisma Schema)

### Prisma Schema Additions

```prisma
// Add to packages/core/prisma-mongodb/schema.prisma

enum ScriptExecutionStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    TIMEOUT
    CANCELLED
}

enum ScriptTrigger {
    MANUAL
    SCHEDULED
    QUEUE
    WEBHOOK
}

model AdminApiKey {
    id          String    @id @default(auto()) @map("_id") @db.ObjectId
    keyHash     String    @unique  // bcrypt hashed
    keyLast4    String              // Last 4 chars for display
    name        String              // Human-readable name
    scopes      String[]            // ['scripts:execute', 'scripts:read']
    expiresAt   DateTime?
    createdBy   String?             // User/admin who created
    lastUsedAt  DateTime?
    isActive    Boolean   @default(true)
    createdAt   DateTime  @default(now())
    updatedAt   DateTime  @updatedAt

    @@index([keyHash])
    @@index([isActive])
}

model ScriptExecution {
    id            String                @id @default(auto()) @map("_id") @db.ObjectId
    scriptName    String
    scriptVersion String?
    status        ScriptExecutionStatus @default(PENDING)
    trigger       ScriptTrigger
    mode          String                @default("async") // "sync" | "async"
    input         Json?
    output        Json?
    logs          Json[]                // [{level, message, data, timestamp}]
    metricsStartTime  DateTime?
    metricsEndTime    DateTime?
    metricsDurationMs Int?
    errorName     String?
    errorMessage  String?
    errorStack    String?
    auditApiKeyName   String?
    auditApiKeyLast4  String?
    auditIpAddress    String?
    createdAt     DateTime  @default(now())
    updatedAt     DateTime  @updatedAt

    @@index([scriptName, createdAt(sort: Desc)])
    @@index([status])
}

model ScriptSchedule {
    id              String    @id @default(auto()) @map("_id") @db.ObjectId
    scriptName      String    @unique
    enabled         Boolean   @default(false)
    cronExpression  String?
    timezone        String    @default("UTC")
    lastTriggeredAt DateTime?
    nextTriggerAt   DateTime?

    // AWS EventBridge Rule (if provisioned)
    awsRuleArn      String?
    awsRuleName     String?

    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt

    @@index([enabled])
}
```

### PostgreSQL Schema (Equivalent)

```prisma
// Add to packages/core/prisma-postgresql/schema.prisma

enum ScriptExecutionStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    TIMEOUT
    CANCELLED
}

enum ScriptTrigger {
    MANUAL
    SCHEDULED
    QUEUE
    WEBHOOK
}

model AdminApiKey {
    id          Int       @id @default(autoincrement())
    keyHash     String    @unique
    keyLast4    String
    name        String
    scopes      String[]
    expiresAt   DateTime?
    createdBy   String?
    lastUsedAt  DateTime?
    isActive    Boolean   @default(true)
    createdAt   DateTime  @default(now())
    updatedAt   DateTime  @updatedAt

    @@index([keyHash])
    @@index([isActive])
}

model ScriptExecution {
    id            Int                   @id @default(autoincrement())
    scriptName    String
    scriptVersion String?
    status        ScriptExecutionStatus @default(PENDING)
    trigger       ScriptTrigger
    mode          String                @default("async") // "sync" | "async"
    input         Json?
    output        Json?
    logs          Json[]
    metricsStartTime  DateTime?
    metricsEndTime    DateTime?
    metricsDurationMs Int?
    errorName     String?
    errorMessage  String?
    errorStack    String?
    auditApiKeyName   String?
    auditApiKeyLast4  String?
    auditIpAddress    String?
    createdAt     DateTime  @default(now())
    updatedAt     DateTime  @updatedAt

    @@index([scriptName, createdAt(sort: Desc)])
    @@index([status])
}

model ScriptSchedule {
    id              Int       @id @default(autoincrement())
    scriptName      String    @unique
    enabled         Boolean   @default(false)
    cronExpression  String?
    timezone        String    @default("UTC")
    lastTriggeredAt DateTime?
    nextTriggerAt   DateTime?

    // AWS EventBridge Rule (if provisioned)
    awsRuleArn      String?
    awsRuleName     String?

    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt

    @@index([enabled])
}
```

---

## Repository Interfaces

### AdminApiKeyRepositoryInterface

```javascript
// packages/core/admin-scripts/repositories/admin-api-key-repository-interface.js
class AdminApiKeyRepositoryInterface {
    async createApiKey({ name, scopes, expiresAt, createdBy }) { }
    async findApiKeyByHash(keyHash) { }
    async findApiKeyById(id) { }
    async findActiveApiKeys() { }
    async updateApiKeyLastUsed(id) { }
    async deactivateApiKey(id) { }
    async deleteApiKey(id) { }
}
```

### ScriptExecutionRepositoryInterface

```javascript
// packages/core/admin-scripts/repositories/script-execution-repository-interface.js
class ScriptExecutionRepositoryInterface {
    async createExecution({ scriptName, scriptVersion, trigger, mode, input, audit }) { }
    async findExecutionById(id) { }
    async findExecutionsByScriptName(scriptName, options = {}) { }
    async findExecutionsByStatus(status, options = {}) { }
    async updateExecutionStatus(id, status) { }
    async updateExecutionOutput(id, output) { }
    async updateExecutionError(id, error) { }
    async updateExecutionMetrics(id, metrics) { }
    async appendExecutionLog(id, logEntry) { }
    async deleteExecutionsOlderThan(date) { }
}
```

### ScriptScheduleRepositoryInterface

```javascript
// packages/core/admin-scripts/repositories/script-schedule-repository-interface.js
class ScriptScheduleRepositoryInterface {
    async createSchedule({ scriptName, enabled, cronExpression, timezone }) { }
    async findScheduleByScriptName(scriptName) { }
    async findEnabledSchedules() { }
    async updateSchedule(scriptName, updates) { }
    async updateLastTriggered(scriptName, timestamp) { }
    async updateAwsRule(scriptName, { ruleArn, ruleName }) { }
    async deleteSchedule(scriptName) { }
}
```

---

## Command Pattern Implementation

### createAdminScriptCommands()

```javascript
// packages/core/application/commands/admin-script-commands.js
const { createAdminApiKeyRepository } = require('../../admin-scripts/repositories/admin-api-key-repository-factory');
const { createScriptExecutionRepository } = require('../../admin-scripts/repositories/script-execution-repository-factory');
const bcrypt = require('bcryptjs');

const ERROR_CODE_MAP = {
    INVALID_API_KEY: 401,
    EXPIRED_API_KEY: 401,
    SCRIPT_NOT_FOUND: 404,
    EXECUTION_NOT_FOUND: 404,
    UNAUTHORIZED_SCOPE: 403,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return { error: status, reason: error?.message, code: error?.code };
}

function createAdminScriptCommands() {
    const apiKeyRepository = createAdminApiKeyRepository();
    const executionRepository = createScriptExecutionRepository();

    return {
        // API Key Management
        async createAdminApiKey({ name, scopes, expiresAt, createdBy }) {
            try {
                const rawKey = require('uuid').v4();
                const keyHash = await bcrypt.hash(rawKey, 10);
                const keyLast4 = rawKey.slice(-4);

                const record = await apiKeyRepository.createApiKey({
                    keyHash, keyLast4, name, scopes, expiresAt, createdBy
                });

                return {
                    id: record.id,
                    rawKey,  // Only returned once!
                    name: record.name,
                    keyLast4: record.keyLast4,
                    scopes: record.scopes,
                    expiresAt: record.expiresAt,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async validateAdminApiKey(rawKey) {
            try {
                // Find all active keys and compare hashes
                const activeKeys = await apiKeyRepository.findActiveApiKeys();
                for (const key of activeKeys) {
                    const isMatch = await bcrypt.compare(rawKey, key.keyHash);
                    if (isMatch) {
                        if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
                            const error = new Error('API key has expired');
                            error.code = 'EXPIRED_API_KEY';
                            return mapErrorToResponse(error);
                        }
                        await apiKeyRepository.updateApiKeyLastUsed(key.id);
                        return { valid: true, apiKey: key };
                    }
                }
                const error = new Error('Invalid API key');
                error.code = 'INVALID_API_KEY';
                return mapErrorToResponse(error);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        // Execution Management
        async createScriptExecution({ scriptName, scriptVersion, trigger, input, audit }) {
            try {
                return await executionRepository.createExecution({
                    scriptName, scriptVersion, trigger, input, audit
                });
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async updateScriptExecutionStatus(executionId, status) {
            try {
                return await executionRepository.updateExecutionStatus(executionId, status);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async findScriptExecutionById(executionId) {
            try {
                const execution = await executionRepository.findExecutionById(executionId);
                if (!execution) {
                    const error = new Error('Execution not found');
                    error.code = 'EXECUTION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }
                return execution;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async findScriptExecutionsByName(scriptName, options = {}) {
            try {
                return await executionRepository.findExecutionsByScriptName(scriptName, options);
            } catch (error) {
                return [];
            }
        },

        async appendScriptExecutionLog(executionId, logEntry) {
            try {
                return await executionRepository.appendExecutionLog(executionId, logEntry);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async completeScriptExecution(executionId, { status, output, error, metrics }) {
            try {
                if (status) await executionRepository.updateExecutionStatus(executionId, status);
                if (output) await executionRepository.updateExecutionOutput(executionId, output);
                if (error) await executionRepository.updateExecutionError(executionId, error);
                if (metrics) await executionRepository.updateExecutionMetrics(executionId, metrics);
                return { success: true };
            } catch (err) {
                return mapErrorToResponse(err);
            }
        },
    };
}

module.exports = { createAdminScriptCommands };
```

---

## Security Requirements (Phased)

### Phase 1: MVP - BLOCKING Requirements

| Requirement | Implementation | Priority |
|------------|----------------|----------|
| Admin API Key Auth | `AdminApiKey` model with bcrypt hash | P0 |
| Execution Timeout | Reuse `TimeoutCatcher` (5-15 min max) | P0 |
| Basic Audit Log | `ScriptExecution` model stores all runs | P0 |
| Input Validation | JSON Schema validation on params | P0 |
| Result Size Limits | Max 1MB output, truncate if exceeded | P0 |

### Phase 2: Production Hardening

| Requirement | Implementation | Priority |
|------------|----------------|----------|
| Rate Limiting | Per-key: 10/min, Global: 100/min | P1 |
| Tenant Scoping | Query interceptor for tenant filter | P1 |
| Credential Proxy | Scripts request by name, not raw values | P1 |
| Dry-Run Mode | Preview affected records before execution | P1 |

### Phase 3: Enterprise Features

| Requirement | Implementation | Priority |
|------------|----------------|----------|
| Approval Workflow | Two-admin approval for production scripts | P2 |
| VM Sandbox | `isolated-vm` for untrusted scripts | P2 |
| Rollback | Pre-execution snapshots, auto-revert on error | P2 |

---

## Package Structure (Updated for `next`)

```
packages/core/                           # Models & Repositories in core
├── admin-scripts/
│   ├── repositories/
│   │   ├── admin-api-key-repository-interface.js
│   │   ├── admin-api-key-repository-factory.js
│   │   ├── admin-api-key-repository-mongo.js
│   │   ├── admin-api-key-repository-postgres.js
│   │   ├── admin-api-key-repository-documentdb.js
│   │   ├── script-execution-repository-interface.js
│   │   ├── script-execution-repository-factory.js
│   │   ├── script-execution-repository-mongo.js
│   │   ├── script-execution-repository-postgres.js
│   │   ├── script-execution-repository-documentdb.js
│   │   ├── script-schedule-repository-interface.js      # NEW: For hybrid scheduling
│   │   ├── script-schedule-repository-factory.js
│   │   ├── script-schedule-repository-mongo.js
│   │   ├── script-schedule-repository-postgres.js
│   │   └── script-schedule-repository-documentdb.js
│   └── index.js
├── application/
│   └── commands/
│       └── admin-script-commands.js     # Command factory
├── prisma-mongodb/
│   └── schema.prisma                    # Add AdminApiKey, ScriptExecution, ScriptSchedule
└── prisma-postgresql/
    └── schema.prisma                    # Add AdminApiKey, ScriptExecution, ScriptSchedule

packages/devtools/                       # Infrastructure builders
└── infrastructure/
    └── domains/
        └── admin-scripts/               # NEW: Admin script infrastructure
            ├── admin-script-builder.js
            └── admin-script-builder.test.js

packages/admin-scripts/                  # Application logic & builtins
├── package.json
├── index.js
├── src/
│   ├── application/
│   │   ├── script-factory.js            # Script registration
│   │   ├── script-context.js            # Execution context
│   │   ├── script-runner.js             # Orchestrates execution
│   │   └── admin-frigg-commands.js      # Helper API for scripts
│   ├── infrastructure/
│   │   ├── admin-script-router.js       # Express router
│   │   ├── script-executor-handler.js   # Lambda handler for async
│   │   ├── script-queue-worker.js       # SQS worker
│   │   └── admin-auth-middleware.js     # API key auth
│   ├── adapters/                        # Hexagonal adapters (Phase 2)
│   │   ├── scheduler-adapter.js         # Port interface (abstract)
│   │   ├── aws-scheduler-adapter.js     # AWS EventBridge implementation
│   │   └── local-scheduler-adapter.js   # Dev/test implementation
│   └── builtins/
│       ├── oauth-token-refresh.js
│       ├── integration-health-check.js
│       └── index.js
├── test/
│   ├── script-factory.test.js
│   ├── script-runner.test.js
│   ├── admin-script-commands.test.js
│   ├── adapters/
│   │   ├── aws-scheduler-adapter.test.js
│   │   └── local-scheduler-adapter.test.js
│   └── integration/
│       └── execute-script.test.js
└── types/
    └── index.d.ts
```

---

## AdminFriggCommands (Helper API for Scripts)

**Reference**: Uses repository pattern from `/home/user/frigg/packages/core/application/commands/`

Scripts receive a `frigg` object with database access. Integration factory is **OPTIONAL**.

```javascript
// packages/core/admin-scripts/admin-frigg-commands.js

const { createIntegrationRepository } = require('../integrations/repositories/integration-repository-factory');
const { createUserRepository } = require('../user/repositories/user-repository-factory');
const { createModuleRepository } = require('../modules/repositories/module-repository-factory');
const { createCredentialRepository } = require('../credential/repositories/credential-repository-factory');
const { createScriptExecutionRepository } = require('./repositories/script-execution-repository-factory');

class AdminFriggCommands {
    // Repositories created via factories (no args, like other commands)
    integrationRepository = createIntegrationRepository();
    userRepository = createUserRepository();
    moduleRepository = createModuleRepository();
    credentialRepository = createCredentialRepository();
    scriptExecutionRepository = createScriptExecutionRepository();

    constructor(params = {}) {
        this.executionId = params.executionId || null;
        this.logs = [];

        // OPTIONAL: Integration factory for scripts that need to instantiate integrations
        this.integrationFactory = params.integrationFactory || null;
    }

    // ==================== ALWAYS AVAILABLE (Database Access) ====================

    // Integration queries (no instantiation)
    async listIntegrations(filter = {}) {
        return this.integrationRepository.findIntegrations(filter);
    }

    async findIntegrationById(id) {
        return this.integrationRepository.findIntegrationById(id);
    }

    async findIntegrationsByUserId(userId) {
        return this.integrationRepository.findIntegrationsByUserId(userId);
    }

    async updateIntegrationConfig(integrationId, config) {
        return this.integrationRepository.updateIntegrationConfig(integrationId, config);
    }

    async updateIntegrationStatus(integrationId, status) {
        return this.integrationRepository.updateIntegrationStatus(integrationId, status);
    }

    // User queries
    async listUsers(filter = {}) {
        // Implement based on filter
        if (filter.appUserId) return this.userRepository.findIndividualUserByAppUserId(filter.appUserId);
        if (filter.username) return this.userRepository.findIndividualUserByUsername(filter.username);
        return null;
    }

    async findUserById(userId) {
        return this.userRepository.findIndividualUserById(userId);
    }

    // Entity queries
    async listEntities(filter = {}) {
        if (filter.userId) {
            return this.moduleRepository.findEntitiesByUserId(filter.userId);
        }
        return this.moduleRepository.findEntity(filter);
    }

    async findEntityById(entityId) {
        return this.moduleRepository.findEntityById(entityId);
    }

    // Credential queries
    async findCredential(filter) {
        return this.credentialRepository.findCredential(filter);
    }

    async updateCredential(credentialId, updates) {
        return this.credentialRepository.updateCredential(credentialId, updates);
    }

    // ==================== REQUIRES integrationFactory ====================

    /**
     * Instantiate an integration instance (for calling external APIs)
     * REQUIRES: integrationFactory in constructor
     */
    async instantiate(integrationId) {
        if (!this.integrationFactory) {
            throw new Error(
                'instantiate() requires integrationFactory. ' +
                'Set Definition.config.requiresIntegrationFactory = true'
            );
        }
        return this.integrationFactory.getInstanceFromIntegrationId({
            integrationId,
            _isAdminContext: true,  // Bypass user ownership check
        });
    }

    // ==================== LOGGING & EXECUTION ====================

    log(level, message, data = {}) {
        const entry = {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
        this.logs.push(entry);

        // Persist to execution record if we have an executionId
        if (this.executionId) {
            this.scriptExecutionRepository.appendExecutionLog(this.executionId, entry)
                .catch(err => console.error('Failed to persist log:', err));
        }

        return entry;
    }

    getExecutionId() {
        return this.executionId;
    }

    getLogs() {
        return this.logs;
    }
}

module.exports = { AdminFriggCommands };
```

**Key Design Points**:
1. **Repository instances as class properties** (matches IntegrationBase pattern)
2. **No-arg repository factories** (matches existing pattern)
3. **integrationFactory is optional** - only needed for `instantiate()`
4. **Clear error message** when trying to instantiate without factory

---

## Implementation Phases (Updated)

### Phase 1: MVP (Sync & Async Execution)

**Scope**:
1. Add Prisma schema for `AdminApiKey`, `ScriptExecution`
2. Create repository interfaces and factories (MongoDB, PostgreSQL, DocumentDB)
3. Implement `createAdminScriptCommands()` command factory
4. Build `ScriptFactory` for registration/loading
5. Build `AdminFriggCommands` helper API
6. Create admin router with `/execute` endpoint
7. **Sync execution mode** - Direct Lambda invocation with response
8. **Async execution mode** - SQS queue + worker Lambda (default)
9. Lambda handler with TimeoutCatcher
10. 2 built-in scripts (oauth-refresh, health-check)
11. `AdminScriptBuilder` for infrastructure generation

**Execution Modes**:
- `POST /admin/scripts/:scriptName/execute { mode: "sync" }` - Direct execution, response includes result
- `POST /admin/scripts/:scriptName/execute { mode: "async" }` - Queued, returns execution ID immediately

**Deliverables**:
1. Prisma schema additions + migrations
2. Repository implementations for all 3 DBs
3. Command factory
4. `@friggframework/admin-scripts` package
5. `AdminScriptBuilder` in devtools
6. Test suite

### Phase 2: Hybrid Scheduling

**Scope**:
1. Add `ScriptSchedule` Prisma model
2. Create `script-schedule-repository-*` implementations
3. Create `SchedulerAdapter` port interface (hexagonal)
4. Implement `AWSSchedulerAdapter` (EventBridge Scheduler)
5. Implement `LocalSchedulerAdapter` (for dev/test)
6. Schedule management API endpoints:
   - `GET /admin/scripts/:scriptName/schedule` - Get schedule (Definition defaults + DB overrides)
   - `PUT /admin/scripts/:scriptName/schedule` - Create/update schedule
   - `DELETE /admin/scripts/:scriptName/schedule` - Remove schedule override
7. Zoho webhook refresher script (recurring)

**Hybrid Scheduling Logic**:
```javascript
// Priority: DB override > Definition default
async function getEffectiveSchedule(scriptName, scriptClass) {
    const dbSchedule = await scheduleRepository.findScheduleByScriptName(scriptName);
    const definitionSchedule = scriptClass.Definition?.schedule;

    if (dbSchedule) {
        return { source: 'database', ...dbSchedule };
    }
    if (definitionSchedule?.enabled) {
        return { source: 'definition', ...definitionSchedule };
    }
    return null;
}
```

### Phase 3: Production Hardening

**Scope**:
- Rate limiting middleware
- Tenant isolation
- Dry-run mode
- Approval workflow

### Phase 4: Enterprise & Advanced

**Scope**:
- VM sandbox (isolated-vm)
- Rollback mechanism
- Step Functions for long-running scripts (>15 min)

---

## Example Scripts (Updated for Command Pattern)

### Healing Script (Attio Config Fix)

```javascript
class AttioConfigHealingScript {
    static name = 'attio-config-healing';
    static version = '1.0.0';
    static description = 'Fix broken Attio integrations with corrupted config';

    static inputSchema = {
        type: 'object',
        properties: {
            dryRun: { type: 'boolean', default: true },
            integrationIds: { type: 'array', items: { type: 'string' } }
        }
    };

    async execute(frigg, params) {
        const { dryRun = true, integrationIds } = params;

        // Use command pattern to find integrations
        const allIntegrations = await frigg.listIntegrations({});
        const brokenIntegrations = allIntegrations.filter(int =>
            int.config?.type === 'attio' && int.status === 'ERROR'
        );

        frigg.log('info', `Found ${brokenIntegrations.length} broken Attio integrations`);

        const results = { fixed: 0, failed: 0, skipped: 0 };

        for (const int of brokenIntegrations) {
            try {
                if (dryRun) {
                    frigg.log('info', `[DRY RUN] Would fix integration ${int.id}`);
                    results.skipped++;
                    continue;
                }

                const instance = await frigg.instantiate(int.id);

                // Rebuild config from API state
                const apiConfig = await instance.primary.api.getConnectionConfig();

                // Use command to update
                await frigg.commands.updateIntegrationConfig({
                    integrationId: int.id,
                    config: {
                        ...int.config,
                        ...apiConfig,
                        _healedAt: new Date().toISOString()
                    }
                });

                frigg.log('info', `Fixed integration ${int.id}`);
                results.fixed++;
            } catch (error) {
                frigg.log('error', `Failed to fix ${int.id}`, { error: error.message });
                results.failed++;
            }
        }

        return results;
    }
}

module.exports = AttioConfigHealingScript;
```

---

## Testing Strategy

### Unit Tests
- Repository implementations (mock Prisma)
- Command factory (mock repositories)
- ScriptFactory registration/lookup
- AdminFriggCommands methods

### Integration Tests
- Full execution flow with test database
- Router endpoints with auth
- Multi-database compatibility (MongoDB, PostgreSQL)

### E2E Tests
- Manual trigger via API
- Error handling and timeout behavior

---

## Files to Create/Modify

### New Files in `packages/core/`
```
packages/core/admin-scripts/repositories/admin-api-key-repository-interface.js
packages/core/admin-scripts/repositories/admin-api-key-repository-factory.js
packages/core/admin-scripts/repositories/admin-api-key-repository-mongo.js
packages/core/admin-scripts/repositories/admin-api-key-repository-postgres.js
packages/core/admin-scripts/repositories/admin-api-key-repository-documentdb.js
packages/core/admin-scripts/repositories/script-execution-repository-interface.js
packages/core/admin-scripts/repositories/script-execution-repository-factory.js
packages/core/admin-scripts/repositories/script-execution-repository-mongo.js
packages/core/admin-scripts/repositories/script-execution-repository-postgres.js
packages/core/admin-scripts/repositories/script-execution-repository-documentdb.js
packages/core/admin-scripts/repositories/script-schedule-repository-interface.js   # Phase 2
packages/core/admin-scripts/repositories/script-schedule-repository-factory.js     # Phase 2
packages/core/admin-scripts/repositories/script-schedule-repository-mongo.js       # Phase 2
packages/core/admin-scripts/repositories/script-schedule-repository-postgres.js    # Phase 2
packages/core/admin-scripts/repositories/script-schedule-repository-documentdb.js  # Phase 2
packages/core/admin-scripts/index.js
packages/core/application/commands/admin-script-commands.js
```

### Modify in `packages/core/`
```
packages/core/prisma-mongodb/schema.prisma (add AdminApiKey, ScriptExecution, ScriptSchedule)
packages/core/prisma-postgresql/schema.prisma (add AdminApiKey, ScriptExecution, ScriptSchedule)
packages/core/application/index.js (export createAdminScriptCommands)
```

### New Files in `packages/devtools/`
```
packages/devtools/infrastructure/domains/admin-scripts/admin-script-builder.js
packages/devtools/infrastructure/domains/admin-scripts/admin-script-builder.test.js
```

### Modify in `packages/devtools/`
```
packages/devtools/infrastructure/domains/shared/builder-orchestrator.js (register AdminScriptBuilder)
packages/devtools/infrastructure/domains/shared/types/app-definition.js (add adminScripts[], admin config)
```

### New Package `packages/admin-scripts/`
```
packages/admin-scripts/package.json
packages/admin-scripts/index.js
packages/admin-scripts/src/application/script-factory.js
packages/admin-scripts/src/application/script-context.js
packages/admin-scripts/src/application/script-runner.js
packages/admin-scripts/src/application/admin-frigg-commands.js
packages/admin-scripts/src/infrastructure/admin-script-router.js
packages/admin-scripts/src/infrastructure/script-executor-handler.js
packages/admin-scripts/src/infrastructure/script-queue-worker.js
packages/admin-scripts/src/infrastructure/admin-auth-middleware.js
packages/admin-scripts/src/adapters/scheduler-adapter.js         # Phase 2: Port interface
packages/admin-scripts/src/adapters/aws-scheduler-adapter.js     # Phase 2: AWS implementation
packages/admin-scripts/src/adapters/local-scheduler-adapter.js   # Phase 2: Dev/test
packages/admin-scripts/src/builtins/oauth-token-refresh.js
packages/admin-scripts/src/builtins/integration-health-check.js
packages/admin-scripts/src/builtins/index.js
```

---

## Next Steps

1. [x] Review and approve plan
2. [x] Update plan for `next` branch architecture
3. [ ] Add Prisma schema for AdminApiKey, ScriptExecution
4. [ ] Implement repository interfaces
5. [ ] Implement repository factories (MongoDB, PostgreSQL, DocumentDB)
6. [ ] Implement `createAdminScriptCommands()` command factory
7. [ ] Build ScriptFactory + AdminFriggCommands
8. [ ] Create router + handler
9. [ ] Write tests
10. [ ] Implement built-in scripts
11. [ ] Documentation
