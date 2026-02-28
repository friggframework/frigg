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
        config: { timeout: 300000 },
        schedule: { enabled: true, cronExpression: 'cron(0 12 * * ? *)' },
    };

    /**
     * @param {AdminFriggCommands} frigg - Helper object providing:
     *   - Repository access: listIntegrations(), findUserById(), findCredential(), etc.
     *   - Logging: log(level, message, data) - persists to execution record
     *   - Queue operations: queueScript(), queueScriptBatch() - for self-queuing pattern
     *   - Integration instantiation: instantiate(integrationId) - requires config.requireIntegrationInstance
     * @param {Object} params - Script parameters (validated against inputSchema if provided)
     * @returns {Promise<Object>} - Script results (validated against outputSchema if provided)
     */
    async execute(frigg, params) {
        // Example usage:
        // const integrations = await frigg.listIntegrations({ userId: params.userId });
        // frigg.log('info', 'Processing integrations', { count: integrations.length });
        return { success: true };
    }
}
```

### Infrastructure Components

1. **AdminScriptBuilder** - Generates serverless.yml resources:
   - SQS queue for async execution
   - Lambda functions (router + queue worker)
   - EventBridge Scheduler resources

2. **Repository Layer** (Phase 1):
   - `AdminApiKeyRepository` - API key management
   - `ScriptExecutionRepository` - Execution history
   - `ScriptScheduleRepository` - Schedule overrides (Phase 2)

3. **Application Layer**:
   - `ScriptFactory` - Script registration/instantiation
   - `ScriptRunner` - Execution orchestration
   - `AdminFriggCommands` - Helper API for scripts

4. **Infrastructure Layer**:
   - `admin-script-router.js` - HTTP endpoints
   - `script-executor-handler.js` - SQS queue worker
   - `admin-auth-middleware.js` - API key authentication

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

### Dry-Run Mode (Phase 3)

Scripts can be executed in dry-run mode for testing:

```javascript
POST /admin/scripts/:name/execute
{ "params": {...}, "mode": "sync", "dryRun": true }
```

Dry-run wraps repositories to intercept writes and mocks HTTP calls.

### Security Model

- **Admin API Keys**: Separate from OAuth credentials
- **VPC Deployment**: Lambda functions in private subnets
- **Encryption**: Sensitive fields encrypted via Prisma extension
- **Audit Logging**: All executions tracked with API key info

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/scripts` | List registered scripts |
| GET | `/admin/scripts/:name` | Get script details |
| POST | `/admin/scripts/:name/execute` | Execute script |
| GET | `/admin/executions` | List recent executions |
| GET | `/admin/executions/:id` | Get execution details |
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
- Dry-run mode enables safe testing
- Follows established Frigg patterns (Command, Repository, Factory)

### Negative
- Additional infrastructure (SQS queue, Lambda functions)
- API key management complexity
- EventBridge Scheduler has regional limits
- Dry-run mode can't capture all side effects

### Risks Mitigated
- **Privilege Escalation**: Admin API keys are separate from user OAuth
- **Resource Exhaustion**: Timeout limits, async execution for long scripts
- **Data Corruption**: Dry-run mode for testing, execution logging

## Implementation Phases

1. **Phase 1 (MVP)**: Core execution, repositories, built-in scripts ✅
2. **Phase 2 (Scheduling)**: ScriptSchedule model, EventBridge integration ✅
3. **Phase 3 (Dry-Run)**: Repository wrapper, HTTP interceptor ✅
4. **Phase 4 (Future)**: Management UI, advanced observability

## Related

- [Integration Base Pattern](/packages/core/integrations/integration-base.js)
- [Command Pattern](/packages/core/application/commands/)
- [Repository Factory Pattern](/packages/core/database/)
- [AWS EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html)
