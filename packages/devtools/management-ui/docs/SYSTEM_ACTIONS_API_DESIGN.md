# System Actions API Design & Implementation Guide

## Overview

The System Actions API allows developers to test and exercise integration system-level behaviors during development and testing. This includes webhooks, polling, queue workers, and lifecycle events.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Management UI / Testing Components                         │
│  - UserActionTester (user-facing actions)                  │
│  - SystemActionsTester (system-level actions)              │
│  - TestingDashboard (unified interface)                    │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP/REST
┌────────────────▼────────────────────────────────────────────┐
│ Frigg Core API Routes                                       │
│  - GET  /api/integrations/:id/system-actions               │
│  - POST /api/integrations/:id/system-actions/:type         │
│  - POST /api/integrations/:id/webhooks/trigger             │
│  - POST /api/integrations/:id/polling                      │
│  - POST /api/integrations/:id/queue-worker                 │
│  - POST /api/integrations/:id/lifecycle-events             │
└────────────────┬────────────────────────────────────────────┘
                 │ Use Cases
┌────────────────▼────────────────────────────────────────────┐
│ Use Cases Layer                                             │
│  - ExecuteSystemActionUseCase                               │
│  - TriggerWebhookUseCase                                    │
│  - ExecuteLifecycleEventUseCase                             │
└────────────────┬────────────────────────────────────────────┘
                 │ Calls
┌────────────────▼────────────────────────────────────────────┐
│ IntegrationBase (Domain)                                    │
│  - onWebhookReceived() / onWebhook()                        │
│  - onCreate() / onUpdate() / onDelete()                     │
│  - send(event, data) - event dispatcher                     │
└────────────────┬────────────────────────────────────────────┘
                 │ Queue/Execute
┌────────────────▼────────────────────────────────────────────┐
│ Infrastructure                                              │
│  - SQS Queues (for webhooks)                                │
│  - Module APIs (external service calls)                     │
│  - Database (integration state)                             │
└─────────────────────────────────────────────────────────────┘
```

## API Client (Already Implemented)

Located: `packages/ui/lib/api/api.js` (lines 352-398)

```javascript
// Get available system actions for an integration
async getSystemActions(integrationId) {
  return this._get(`/api/integrations/${integrationId}/system-actions`);
}

// Execute a system action (webhook, polling, queue worker, etc.)
async executeSystemAction(integrationId, actionType, config) {
  return this._post(`/api/integrations/${integrationId}/system-actions/${actionType}`, config);
}

// Trigger a webhook event
async triggerWebhook(integrationId, webhookConfig) {
  return this._post(`/api/integrations/${integrationId}/webhooks/trigger`, webhookConfig);
}

// Start/stop polling for an integration
async togglePolling(integrationId, enabled, config = {}) {
  return this._post(`/api/integrations/${integrationId}/polling`, {
    enabled,
    config
  });
}
```

## Backend Implementation

### 1. API Route Handler

Add to `packages/core/integrations/integration-router.js`:

```javascript
// GET /api/integrations/:id/system-actions
// Returns available system actions for this integration
router.get(
    '/:integrationId/system-actions',
    catchAsyncError(async (req, res) => {
        const user = await getUserFromRequest(req);
        const { integrationId } = req.params;

        // Use case: Get available system actions
        const getSystemActionsUseCase = new GetSystemActionsUseCase({
            integrationRepository,
        });

        const actions = await getSystemActionsUseCase.execute({
            userId: user.id,
            integrationId,
        });

        res.json({ actions });
    })
);

// POST /api/integrations/:id/system-actions/:type
// Execute a system action
router.post(
    '/:integrationId/system-actions/:type',
    catchAsyncError(async (req, res) => {
        const user = await getUserFromRequest(req);
        const { integrationId, type } = req.params;
        const config = req.body;

        const executeSystemActionUseCase = new ExecuteSystemActionUseCase({
            integrationRepository,
            moduleRepository,
        });

        const result = await executeSystemActionUseCase.execute({
            userId: user.id,
            integrationId,
            actionType: type,
            config,
        });

        res.json(result);
    })
);

// POST /api/integrations/:id/webhooks/trigger
// Trigger a test webhook
router.post(
    '/:integrationId/webhooks/trigger',
    catchAsyncError(async (req, res) => {
        const user = await getUserFromRequest(req);
        const { integrationId } = req.params;
        const webhookConfig = req.body;

        const triggerWebhookUseCase = new TriggerWebhookUseCase({
            integrationRepository,
            moduleRepository,
        });

        const result = await triggerWebhookUseCase.execute({
            userId: user.id,
            integrationId,
            eventType: webhookConfig.eventType,
            payload: webhookConfig.payload,
            headers: webhookConfig.headers || {},
            queryParams: webhookConfig.queryParams || {},
        });

        res.json(result);
    })
);

// POST /api/integrations/:id/polling
// Start/stop polling
router.post(
    '/:integrationId/polling',
    catchAsyncError(async (req, res) => {
        const user = await getUserFromRequest(req);
        const { integrationId } = req.params;
        const { enabled, config } = req.body;

        const togglePollingUseCase = new TogglePollingUseCase({
            integrationRepository,
            moduleRepository,
        });

        const result = await togglePollingUseCase.execute({
            userId: user.id,
            integrationId,
            enabled,
            config,
        });

        res.json(result);
    })
);

// POST /api/integrations/:id/lifecycle-events
// Trigger lifecycle event (ON_CREATE, ON_UPDATE, etc.)
router.post(
    '/:integrationId/lifecycle-events',
    catchAsyncError(async (req, res) => {
        const user = await getUserFromRequest(req);
        const { integrationId } = req.params;
        const { event, data } = req.body;

        const executeLifecycleEventUseCase = new ExecuteLifecycleEventUseCase({
            integrationRepository,
            moduleRepository,
        });

        const result = await executeLifecycleEventUseCase.execute({
            userId: user.id,
            integrationId,
            event,
            data,
        });

        res.json(result);
    })
);
```

### 2. Use Case: GetSystemActionsUseCase

Located: `packages/core/integrations/use-cases/get-system-actions.js` (NEW)

```javascript
const { GetIntegrationInstance } = require('./get-integration-instance');

/**
 * GetSystemActionsUseCase
 *
 * Returns available system actions for an integration based on its Definition
 * and lifecycle handlers.
 */
class GetSystemActionsUseCase {
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    async execute({ userId, integrationId }) {
        // Get the integration instance
        const getIntegrationInstance = new GetIntegrationInstance({
            integrationRepository: this.integrationRepository,
        });

        const integration = await getIntegrationInstance.execute({
            userId,
            integrationId,
        });

        // Discover available system actions from the integration
        const actions = [];

        // 1. Webhook support
        if (integration.constructor.Definition.webhooks) {
            actions.push({
                id: 'webhook',
                name: 'Webhook Trigger',
                description: 'Simulate incoming webhook events',
                type: 'webhook',
                config: {
                    eventType: 'test.event',
                    payload: {},
                    headers: {},
                    queryParams: {},
                },
            });
        }

        // 2. Lifecycle events (always available)
        actions.push({
            id: 'lifecycle-onCreate',
            name: 'ON_CREATE Event',
            description: 'Trigger onCreate lifecycle hook',
            type: 'lifecycle',
            event: 'ON_CREATE',
        });

        actions.push({
            id: 'lifecycle-onUpdate',
            name: 'ON_UPDATE Event',
            description: 'Trigger onUpdate lifecycle hook',
            type: 'lifecycle',
            event: 'ON_UPDATE',
        });

        actions.push({
            id: 'lifecycle-onDelete',
            name: 'ON_DELETE Event',
            description: 'Trigger onDelete lifecycle hook',
            type: 'lifecycle',
            event: 'ON_DELETE',
        });

        // 3. Custom system actions defined in integration
        if (typeof integration.getSystemActions === 'function') {
            const customActions = await integration.getSystemActions();
            actions.push(...customActions);
        }

        return actions;
    }
}

module.exports = { GetSystemActionsUseCase };
```

### 3. Use Case: ExecuteSystemActionUseCase

Located: `packages/core/integrations/use-cases/execute-system-action.js` (NEW)

```javascript
const { GetIntegrationInstance } = require('./get-integration-instance');

/**
 * ExecuteSystemActionUseCase
 *
 * Executes a system action on an integration (webhook, polling, lifecycle event).
 * This is primarily for testing and development purposes.
 */
class ExecuteSystemActionUseCase {
    constructor({ integrationRepository, moduleRepository }) {
        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
    }

    async execute({ userId, integrationId, actionType, config }) {
        // Get the integration instance (fully hydrated with modules)
        const getIntegrationInstance = new GetIntegrationInstance({
            integrationRepository: this.integrationRepository,
        });

        const integration = await getIntegrationInstance.execute({
            userId,
            integrationId,
        });

        let result;

        switch (actionType) {
            case 'webhook':
                result = await this.executeWebhook(integration, config);
                break;

            case 'polling':
                result = await this.executePolling(integration, config);
                break;

            case 'queueWorker':
                result = await this.executeQueueWorker(integration, config);
                break;

            case 'lifecycleEvent':
                result = await this.executeLifecycleEvent(integration, config);
                break;

            default:
                throw new Error(`Unknown system action type: ${actionType}`);
        }

        return {
            success: true,
            actionType,
            result,
            timestamp: new Date().toISOString(),
        };
    }

    async executeWebhook(integration, config) {
        const { eventType, payload, headers, queryParams } = config;

        // Simulate webhook request object
        const mockReq = {
            body: payload,
            headers: headers || {},
            query: queryParams || {},
            params: { integrationId: integration.id },
        };

        const mockRes = {
            status: (code) => ({
                json: (data) => ({ statusCode: code, data }),
            }),
            json: (data) => ({ statusCode: 200, data }),
        };

        // Call onWebhookReceived (immediate handler)
        const receiveResult = await integration.onWebhookReceived({
            req: mockReq,
            res: mockRes,
        });

        // If queued, also call onWebhook (worker handler) for testing
        if (typeof integration.onWebhook === 'function') {
            const webhookResult = await integration.onWebhook({
                data: {
                    integrationId: integration.id,
                    body: payload,
                    headers: headers || {},
                    query: queryParams || {},
                },
            });

            return {
                received: receiveResult,
                processed: webhookResult,
                queued: true,
            };
        }

        return {
            received: receiveResult,
            queued: false,
        };
    }

    async executePolling(integration, config) {
        const { interval, enabled, filters } = config;

        // Check if integration has polling support
        if (typeof integration.poll !== 'function') {
            throw new Error('Integration does not support polling');
        }

        if (enabled) {
            // Execute one polling cycle
            const result = await integration.poll({ filters });
            return {
                pollingEnabled: true,
                interval,
                result,
            };
        } else {
            return {
                pollingEnabled: false,
                message: 'Polling disabled',
            };
        }
    }

    async executeQueueWorker(integration, config) {
        const { jobType, priority, data } = config;

        // Check if integration has queue worker support
        if (typeof integration.processJob !== 'function') {
            throw new Error('Integration does not support queue workers');
        }

        const job = {
            type: jobType,
            priority: priority || 'normal',
            data: data || {},
            integrationId: integration.id,
        };

        const result = await integration.processJob(job);

        return {
            jobType,
            priority,
            result,
        };
    }

    async executeLifecycleEvent(integration, config) {
        const { event, data } = config;

        // Validate event exists
        const validEvents = [
            'ON_CREATE',
            'ON_UPDATE',
            'ON_DELETE',
            'GET_CONFIG_OPTIONS',
            'REFRESH_CONFIG_OPTIONS',
        ];

        if (!validEvents.includes(event)) {
            throw new Error(`Unknown lifecycle event: ${event}`);
        }

        // Use the integration's send method to trigger event
        const result = await integration.send(event, {
            integrationId: integration.id,
            ...data,
        });

        return {
            event,
            result,
        };
    }
}

module.exports = { ExecuteSystemActionUseCase };
```

### 4. Use Case: TriggerWebhookUseCase

Located: `packages/core/integrations/use-cases/trigger-webhook.js` (NEW)

```javascript
const { GetIntegrationInstance } = require('./get-integration-instance');

/**
 * TriggerWebhookUseCase
 *
 * Triggers a test webhook for an integration.
 * Simulates an external service sending a webhook event.
 */
class TriggerWebhookUseCase {
    constructor({ integrationRepository, moduleRepository }) {
        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
    }

    async execute({ userId, integrationId, eventType, payload, headers, queryParams }) {
        const getIntegrationInstance = new GetIntegrationInstance({
            integrationRepository: this.integrationRepository,
        });

        const integration = await getIntegrationInstance.execute({
            userId,
            integrationId,
        });

        // Verify webhook support
        if (!integration.constructor.Definition.webhooks) {
            throw new Error('Integration does not support webhooks');
        }

        // Create mock request/response objects
        const mockReq = {
            body: payload,
            headers: headers || {},
            query: queryParams || {},
            params: { integrationId },
        };

        const mockRes = {
            statusCode: null,
            responseData: null,
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.responseData = data;
                return { statusCode: this.statusCode || 200, data };
            },
        };

        // Call the webhook receiver
        await integration.onWebhookReceived({ req: mockReq, res: mockRes });

        // Return result
        return {
            success: true,
            eventType,
            statusCode: mockRes.statusCode || 200,
            response: mockRes.responseData,
            queued: true, // Webhook is queued by default in onWebhookReceived
            timestamp: new Date().toISOString(),
        };
    }
}

module.exports = { TriggerWebhookUseCase };
```

## Integration Base Support (Already Implemented)

Located: `packages/core/integrations/integration-base.js`

### Lifecycle Events

Already implemented (lines 102-143):

```javascript
this.defaultEvents = {
    ON_CREATE: { type: 'LIFE_CYCLE_EVENT', handler: this.onCreate },
    ON_UPDATE: { type: 'LIFE_CYCLE_EVENT', handler: this.onUpdate },
    ON_DELETE: { type: 'LIFE_CYCLE_EVENT', handler: this.onDelete },
    GET_CONFIG_OPTIONS: { type: 'LIFE_CYCLE_EVENT', handler: this.getConfigOptions },
    REFRESH_CONFIG_OPTIONS: { type: 'LIFE_CYCLE_EVENT', handler: this.refreshConfigOptions },
    // ... more events
};
```

### Webhook Support

Already implemented (lines 383-422):

```javascript
async onWebhookReceived({ req, res }) {
    // Immediate webhook handling (200 OK response)
    // Queues webhook for async processing
    await this.queueWebhook({ integrationId, body, headers, query });
    res.status(200).json({ received: true });
}

async onWebhook({ data }) {
    // Worker processing (after dequeue from SQS)
    // Override in child classes
}
```

### Event Dispatcher

Already implemented (lines 488-495):

```javascript
async send(event, object) {
    if (!this.on[event]) {
        throw new Error(`Event ${event} is not defined`);
    }
    return this.on[event].handler.call(this, object);
}
```

## How Integrations Define System Actions

### Example 1: Basic Webhook Integration

```javascript
class SlackIntegration extends IntegrationBase {
    static Definition = {
        name: 'slack-integration',
        version: '1.0.0',
        modules: {
            slack: { definition: SlackModuleDefinition },
        },
        webhooks: true,  // ← Enable webhooks
    };

    // Handle immediate webhook receipt
    async onWebhookReceived({ req, res }) {
        // Verify Slack signature
        const signature = req.headers['x-slack-signature'];
        if (!this.verifySlackSignature(req.body, signature)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Handle URL verification challenge
        if (req.body.type === 'url_verification') {
            return res.json({ challenge: req.body.challenge });
        }

        // Queue for processing
        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers,
        });

        res.status(200).json({ received: true });
    }

    // Process webhook in worker
    async onWebhook({ data }) {
        const { body } = data;

        if (body.event?.type === 'message') {
            // Process message event
            await this.handleMessage(body.event);
        }

        return { processed: true };
    }

    async handleMessage(event) {
        console.log('Received message:', event.text);
        // Your logic here
    }
}
```

### Example 2: Polling Integration

```javascript
class SalesforceIntegration extends IntegrationBase {
    static Definition = {
        name: 'salesforce-integration',
        version: '1.0.0',
        modules: {
            salesforce: { definition: SalesforceModuleDefinition },
        },
    };

    // Add custom system action for polling
    async getSystemActions() {
        return [
            {
                id: 'poll-contacts',
                name: 'Poll Contacts',
                description: 'Poll Salesforce for new/updated contacts',
                type: 'polling',
                config: {
                    interval: 30000,
                    objectType: 'Contact',
                },
            },
        ];
    }

    // Implement polling logic
    async poll({ filters }) {
        const objectType = filters?.objectType || 'Contact';

        // Get updated records since last poll
        const lastPollTime = await this.getLastPollTime();
        const records = await this.salesforce.api.getUpdatedRecords(
            objectType,
            lastPollTime
        );

        // Process records
        for (const record of records) {
            await this.processRecord(record);
        }

        await this.updateLastPollTime(new Date());

        return {
            recordsProcessed: records.length,
            objectType,
        };
    }
}
```

### Example 3: Queue Worker Integration

```javascript
class DataSyncIntegration extends IntegrationBase {
    static Definition = {
        name: 'data-sync-integration',
        version: '1.0.0',
        modules: {
            source: { definition: SourceModuleDefinition },
            target: { definition: TargetModuleDefinition },
        },
    };

    // Implement queue worker
    async processJob(job) {
        const { type, data } = job;

        switch (type) {
            case 'sync_data':
                return await this.syncData(data);
            case 'cleanup':
                return await this.cleanup(data);
            default:
                throw new Error(`Unknown job type: ${type}`);
        }
    }

    async syncData(data) {
        const { sourceId, targetId } = data;

        // Fetch from source
        const sourceData = await this.source.api.getData(sourceId);

        // Transform
        const transformed = this.transformData(sourceData);

        // Push to target
        const result = await this.target.api.createData(transformed);

        return {
            synced: true,
            sourceId,
            targetId: result.id,
        };
    }
}
```

## Testing Flow Example

### 1. Developer Opens Management UI

User navigates to Testing Zone → System Actions

### 2. Select Integration

TestingDashboard loads integrations:
```javascript
GET /api/integrations
```

Response:
```json
{
  "integrations": [
    { "id": "int_123", "type": "slack-integration", "status": "ENABLED" }
  ]
}
```

### 3. Load System Actions

User selects Slack integration, UI fetches available actions:

```javascript
GET /api/integrations/int_123/system-actions
```

Response:
```json
{
  "actions": [
    {
      "id": "webhook",
      "name": "Webhook Trigger",
      "description": "Simulate incoming webhook events",
      "type": "webhook"
    },
    {
      "id": "lifecycle-onCreate",
      "name": "ON_CREATE Event",
      "type": "lifecycle",
      "event": "ON_CREATE"
    }
  ]
}
```

### 4. Configure & Execute

User selects "Webhook Trigger", configures payload:

```json
{
  "eventType": "message.created",
  "payload": {
    "event": {
      "type": "message",
      "text": "Hello from test!",
      "user": "U123",
      "channel": "C456"
    }
  },
  "headers": {
    "x-slack-signature": "v0=test-signature"
  }
}
```

UI posts to execute:

```javascript
POST /api/integrations/int_123/system-actions/webhook
```

Backend:
1. GetIntegrationInstance (loads integration with modules)
2. ExecuteSystemActionUseCase.executeWebhook()
3. Calls integration.onWebhookReceived() + integration.onWebhook()
4. Returns result

Response:
```json
{
  "success": true,
  "actionType": "webhook",
  "result": {
    "received": { "statusCode": 200, "data": { "received": true } },
    "processed": { "processed": true },
    "queued": true
  },
  "timestamp": "2025-01-13T10:30:00Z"
}
```

### 5. Display Results

SystemActionsTester displays result in JSON/Card/Table/Logs format

## Summary

**What Already Works:**
- ✅ API Client (packages/ui/lib/api/api.js)
- ✅ UI Components (UserActionTester, SystemActionsTester, TestingDashboard)
- ✅ IntegrationBase lifecycle events
- ✅ IntegrationBase webhook support (onWebhookReceived, onWebhook)
- ✅ Event dispatcher (send method)

**What Needs to Be Added:**
- ❌ API routes in integration-router.js
- ❌ GetSystemActionsUseCase
- ❌ ExecuteSystemActionUseCase
- ❌ TriggerWebhookUseCase
- ❌ TogglePollingUseCase (if polling support needed)
- ❌ Export testing components from @friggframework/ui

**Estimated Implementation Time:**
- Routes & Use Cases: 4-6 hours
- Testing & Documentation: 2-3 hours
- **Total: 6-9 hours**

This leverages existing infrastructure (IntegrationBase, lifecycle events, webhooks) and provides a clean testing interface for developers.
