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

## Architecture Decision Records

### ADR-1: Follow Command Pattern from `next` Branch

**Decision**: Create `createAdminScriptCommands()` following the existing command factory pattern.

**Rationale**:
- Consistent with `createIntegrationCommands()`, `createUserCommands()`, etc.
- Database-agnostic via repository factories
- Standardized error handling (returns `{ error, reason, code }` objects)

**Implementation**:
```javascript
// packages/core/application/commands/admin-script-commands.js
function createAdminScriptCommands() {
    const scriptExecutionRepository = createScriptExecutionRepository();
    const adminApiKeyRepository = createAdminApiKeyRepository();

    return {
        async executeScript({ scriptName, params, adminKeyId }) {
            try {
                // Create execution record, run script, update status
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
        async findExecutionById(executionId) { ... },
        async findExecutionsByScriptName(scriptName) { ... },
        async validateAdminApiKey(rawKey) { ... },
        // ... more commands
    };
}
```

### ADR-2: Repository Factory Pattern

**Decision**: Create repository interfaces and factories for `AdminApiKey` and `ScriptExecution`.

**Rationale**:
- Support MongoDB, PostgreSQL, DocumentDB
- Consistent with existing repository pattern in `next`
- Testable via mock repositories

**Structure**:
```
packages/core/admin-scripts/repositories/
├── admin-api-key-repository-interface.js
├── admin-api-key-repository-factory.js
├── admin-api-key-repository-mongo.js
├── admin-api-key-repository-postgres.js
├── admin-api-key-repository-documentdb.js
├── script-execution-repository-interface.js
├── script-execution-repository-factory.js
├── script-execution-repository-mongo.js
├── script-execution-repository-postgres.js
└── script-execution-repository-documentdb.js
```

### ADR-3: Integrate with Existing Commands

**Decision**: Extend `createFriggCommands()` to include admin script commands when configured.

**Rationale**:
- Single unified command interface
- Scripts can use existing commands (user, entity, credential, integration)
- Consistent developer experience

**Implementation**:
```javascript
// Extended createFriggCommands in application/index.js
function createFriggCommands({ integrationClass, enableAdminScripts = false }) {
    const commands = {
        ...createIntegrationCommands({ integrationClass }),
        ...createUserCommands(),
        ...createEntityCommands(),
        ...createCredentialCommands(),
    };

    if (enableAdminScripts) {
        Object.assign(commands, createAdminScriptCommands());
    }

    return commands;
}
```

### ADR-4: Separate Package with Core Integration

**Decision**: Create `@friggframework/admin-scripts` package that integrates with `@friggframework/core`.

**Rationale**:
- Domain models (AdminApiKey, ScriptExecution) go in `core` (like other models)
- Application logic (ScriptRunner, FriggCommands for scripts) in separate package
- Allows opt-in installation

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
    async createExecution({ scriptName, scriptVersion, trigger, input, audit }) { }
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
│   │   └── script-execution-repository-documentdb.js
│   └── index.js
├── application/
│   └── commands/
│       └── admin-script-commands.js     # Command factory
├── prisma-mongodb/
│   └── schema.prisma                    # Add AdminApiKey, ScriptExecution
└── prisma-postgresql/
    └── schema.prisma                    # Add AdminApiKey, ScriptExecution

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
│   │   ├── create-admin-script-router.js
│   │   ├── create-script-handler.js
│   │   ├── script-queue-worker.js
│   │   └── admin-auth-middleware.js
│   ├── adapters/
│   │   ├── eventbridge-scheduler.js     # Phase 2
│   │   └── local-cron-scheduler.js      # Dev/test
│   └── builtins/
│       ├── oauth-token-refresh.js
│       ├── integration-health-check.js
│       └── index.js
├── test/
│   ├── script-factory.test.js
│   ├── script-runner.test.js
│   ├── admin-script-commands.test.js
│   └── integration/
│       └── execute-script.test.js
└── types/
    └── index.d.ts
```

---

## FriggCommands for Scripts (AdminFriggCommands)

Scripts receive an enhanced `frigg` object that wraps existing commands:

```javascript
// packages/admin-scripts/src/application/admin-frigg-commands.js
const { createFriggCommands } = require('@friggframework/core');

class AdminFriggCommands {
    constructor(params) {
        this.executionId = params.executionId;
        this.integrationClass = params.integrationClass;
        this.logs = [];

        // Get existing Frigg commands
        this.commands = createFriggCommands({
            integrationClass: this.integrationClass,
            enableAdminScripts: true,
        });
    }

    // Integration Access (uses existing commands)
    async listIntegrations(filter = {}) {
        // Uses findIntegrationsByUserId or custom query
        return this.commands.findIntegrationsByUserId(filter.userId);
    }

    async getIntegration(id) {
        const result = await this.commands.loadIntegrationContextById(id);
        return result.error ? null : result.context;
    }

    async instantiate(integrationId) {
        const result = await this.commands.loadIntegrationContextById(integrationId);
        if (result.error) {
            throw new Error(result.reason);
        }
        return result.context;
    }

    // Entity Access
    async listEntities(filter = {}) {
        if (filter.userId) {
            return this.commands.findEntitiesByUserId(filter.userId);
        }
        return this.commands.findEntity(filter);
    }

    // Logging
    log(level, message, data = {}) {
        const entry = {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
        this.logs.push(entry);

        // Also append to execution record
        this.commands.appendScriptExecutionLog(this.executionId, entry);
    }

    // Execution info
    getExecutionId() {
        return this.executionId;
    }

    getLogs() {
        return this.logs;
    }
}

module.exports = { AdminFriggCommands };
```

---

## Implementation Phases (Updated)

### Phase 1: MVP (Manual Execution Only)

**Scope**:
1. Add Prisma schema for `AdminApiKey`, `ScriptExecution`
2. Create repository interfaces and factories (MongoDB, PostgreSQL, DocumentDB)
3. Implement `createAdminScriptCommands()` command factory
4. Build `ScriptFactory` for registration/loading
5. Build `AdminFriggCommands` helper API
6. Create admin router with `/execute` endpoint
7. Lambda handler with TimeoutCatcher
8. 2 built-in scripts (oauth-refresh, health-check)

**Deliverables**:
1. Prisma schema additions + migrations
2. Repository implementations for all 3 DBs
3. Command factory
4. `@friggframework/admin-scripts` package
5. Test suite

**NOT in Phase 1**:
- Scheduling/cron
- Queue-based async execution
- Approval workflows
- Sandboxing

### Phase 2: Scheduling & Async

**Scope**:
- EventBridge Scheduler integration (AWS SDK v3)
- SQS queue worker for async execution
- Schedule management endpoints
- Zoho webhook refresher script

### Phase 3: Production Hardening

**Scope**:
- Rate limiting middleware
- Tenant isolation
- Dry-run mode
- Approval workflow

### Phase 4: Enterprise & Advanced

**Scope**:
- VM sandbox
- Rollback mechanism
- Step Functions for long-running scripts

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
packages/core/admin-scripts/index.js
packages/core/application/commands/admin-script-commands.js
```

### Modify in `packages/core/`
```
packages/core/prisma-mongodb/schema.prisma (add AdminApiKey, ScriptExecution)
packages/core/prisma-postgresql/schema.prisma (add AdminApiKey, ScriptExecution)
packages/core/application/index.js (export createAdminScriptCommands)
```

### New Package `packages/admin-scripts/`
```
packages/admin-scripts/package.json
packages/admin-scripts/index.js
packages/admin-scripts/src/application/script-factory.js
packages/admin-scripts/src/application/script-context.js
packages/admin-scripts/src/application/script-runner.js
packages/admin-scripts/src/application/admin-frigg-commands.js
packages/admin-scripts/src/infrastructure/create-admin-script-router.js
packages/admin-scripts/src/infrastructure/create-script-handler.js
packages/admin-scripts/src/infrastructure/admin-auth-middleware.js
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
