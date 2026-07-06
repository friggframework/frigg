# Architecture Decision Record: Admin Script Runner Service

## Status
Accepted (Implemented)

## Context

Frigg adopters need to execute administrative scripts in hosted environments with access to VPC/KMS-secured database connections. Common use cases include:

1. **Healing Scripts** - Fix broken integrations (e.g., Attio config corruption)
2. **Recurring Maintenance** - Webhook refreshers (e.g., Zoho channel expiry)
3. **Built-in Utilities** - OAuth token refresh, integration health checks

This is a high-risk, high-value feature requiring careful security controls. The implementation must align with the `next` branch architecture:

| Aspect | Pattern Used |
|--------|--------------|
| ORM | Prisma |
| Data Access | Command Pattern (`createAdminScriptCommands()`) |
| DB Support | MongoDB, PostgreSQL, DocumentDB |
| Repository | Interface + Factory Pattern |
| Encryption | Field-level KMS/AES encryption |
| Scheduling | AWS EventBridge Scheduler |

## Decision

### Entry Point: appDefinition Extension

Scripts are registered via `adminScripts` array in the app definition:

```javascript
const Definition = {
    name: 'my-app',
    integrations: [HubSpotIntegration, SalesforceIntegration],

    // Admin scripts (optional)
    adminScripts: [
        AttioHealingScript,
        ZohoWebhookRefreshScript,
    ],

    admin: {
        includeBuiltinScripts: true,
    },
};
```

### Script Base Class Pattern

Following `IntegrationBase` conventions:

```javascript
class MyScript extends AdminScriptBase {
    static Definition = {
        name: 'my-script',
        version: '1.0.0',
        description: 'What this script does',
        config: { timeout: 300000, requireIntegrationInstance: false },
        schedule: { enabled: true, cronExpression: 'cron(0 12 * * ? *)' },
    };

    /**
     * The execution context is injected via the constructor and available as
     * `this.context` (an AdminScriptContext), which provides:
     *   - Repository access: integrationRepository, userRepository, credentialRepository, moduleRepository
     *   - Logging: log(level, message, data) - persisted to the execution record
     *   - Queue operations: queueScript(), queueScriptBatch() - for the self-queuing pattern
     *   - Integration instantiation: instantiate(integrationId) - requires config.requireIntegrationInstance
     * @param {Object} params - Script parameters (validated against inputSchema before execution)
     * @returns {Promise<Object>} - Script results (persisted to the execution record)
     */
    async execute(params) {
        // Example usage:
        // const integrations = await this.context.integrationRepository.findIntegrations({});
        // this.context.log('info', 'Processing integrations', { count: integrations.length });
        return { success: true };
    }
}
```

### Infrastructure Components

1. **AdminScriptBuilder** - Generates serverless.yml resources:
   - SQS queue for async execution
   - Lambda functions (router + queue worker)
   - EventBridge Scheduler resources

2. **Repository Layer**:
   - `AdminProcessRepository` - Execution history (shared `AdminProcess` model, `type: 'ADMIN_SCRIPT'`)
   - `ScriptScheduleRepository` - Schedule overrides (Phase 2)
   - Admin API keys are validated from the `ADMIN_API_KEY` environment variable — there is no database-backed key table.

3. **Application Layer**:
   - `ScriptFactory` - Script registration/instantiation
   - `ScriptRunner` - Execution orchestration
   - `AdminScriptContext` - Execution context injected into scripts (`this.context`)

4. **Infrastructure Layer**:
   - `admin-script-router.js` - HTTP endpoints
   - `script-executor-handler.js` - SQS worker + scheduled direct-invoke entry point
   - `@friggframework/core/handlers/middleware/admin-auth.js` - shared API key authentication

### Execution Modes

- **Sync** (`mode: 'sync'`): Immediate execution, response contains result
- **Async** (`mode: 'async'`): Queued to SQS, returns execution ID for polling

### Scheduling Architecture (Phase 2)

Hybrid scheduling with database override capability:

```
┌─────────────────────────────────────────────────────────┐
│ Schedule Resolution (Priority Order)                   │
├─────────────────────────────────────────────────────────┤
│ 1. Database ScriptSchedule (runtime override)          │
│ 2. Script Definition schedule (code default)           │
│ 3. No schedule (manual execution only)                 │
└─────────────────────────────────────────────────────────┘
```

AWS EventBridge Scheduler (not EventBridge Rules) provides:
- Native timezone support
- Scale to millions of schedules
- Schedule groups for organization
- Flexible time windows

### Input Validation (Phase 3)

Scripts declare an `inputSchema` (JSON Schema). A dedicated validation endpoint
previews what would run without executing, and the same schema is enforced up
front before every execution:

```javascript
POST /admin/scripts/:name/validate
{ "params": {...} }
```

> The original repository-wrapper / HTTP-interceptor dry-run design was descoped
> in favour of schema validation. Scripts that want a true preview accept their
> own `dryRun` param (e.g. the built-in `oauth-token-refresh`).

### Security Model

- **Admin API Key**: A single shared key from the `ADMIN_API_KEY` environment variable, sent as the `x-frigg-admin-api-key` header and checked with a constant-time comparison. Shared across all `/admin/*` endpoints (scripts + db-migrate). Separate from user OAuth credentials.
- **VPC Deployment**: Lambda functions in private subnets
- **Encryption**: Sensitive credential fields encrypted via the Prisma extension
- **Audit Logging**: Every execution is tracked in `AdminProcess` (trigger, input, results, metrics, and `ipAddress`/`apiKeyLast4`)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/scripts` | List registered scripts |
| GET | `/admin/scripts/:name` | Get script details |
| POST | `/admin/scripts/:name` | Execute script (sync or async) |
| POST | `/admin/scripts/:name/validate` | Validate input without executing |
| GET | `/admin/scripts/:name/executions` | List recent executions for a script |
| GET | `/admin/scripts/:name/executions/:id` | Get execution details |
| GET | `/admin/scripts/:name/schedule` | Get effective schedule |
| PUT | `/admin/scripts/:name/schedule` | Set schedule override |
| DELETE | `/admin/scripts/:name/schedule` | Remove override |

### Built-in Scripts

1. **oauth-token-refresh** - Refresh OAuth tokens nearing expiration
2. **integration-health-check** - Verify integration connectivity

## Consequences

### Positive
- Enables runtime maintenance without redeployment
- Built-in scripts reduce boilerplate for common operations
- Hybrid scheduling allows runtime adjustments
- Input-schema validation enables safe pre-flight checks
- Follows established Frigg patterns (Command, Repository, Factory)

### Negative
- Additional infrastructure (SQS queue, Lambda functions)
- Shared admin API key must be provisioned and rotated by the operator
- EventBridge Scheduler has regional limits
- Input validation covers schema shape only, not runtime side effects

### Risks Mitigated
- **Privilege Escalation**: Admin API keys are separate from user OAuth
- **Resource Exhaustion**: Timeout limits, async execution for long scripts
- **Data Corruption**: Input validation before execution, full execution logging

## Implementation Phases

1. **Phase 1 (MVP)**: Core execution, repositories, built-in scripts ✅
2. **Phase 2 (Scheduling)**: ScriptSchedule model, EventBridge integration ✅
3. **Phase 3 (Validation)**: Input-schema validation endpoint ✅
4. **Phase 4 (Future)**: Management UI, advanced observability

## Related

- [Integration Base Pattern](/packages/core/integrations/integration-base.js)
- [Command Pattern](/packages/core/application/commands/)
- [Repository Factory Pattern](/packages/core/database/)
- [AWS EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html)
