# Integration Patterns Guide

This guide documents the recommended patterns for building Frigg integrations, including sync orchestration, process tracking, queue management, and webhook handling.

## Table of Contents

1. [Process Model](#process-model)
2. [friggCommands](#friggcommands)
3. [Queue Management](#queue-management)
4. [Integration Events](#integration-events)
5. [Sync Orchestration](#sync-orchestration)
6. [Webhook Handling](#webhook-handling)
7. [Complete Example](#complete-example)

---

## Process Model

The Process model tracks long-running operations like syncs, imports, and batch jobs. It's provided by `@friggframework/core`.

### Process States

```
INITIALIZING → FETCHING_TOTAL → QUEUING_PAGES → PROCESSING_BATCHES → COMPLETED
                                                                   ↘ ERROR
```

### Creating a Process

```javascript
const { createProcessRepository } = require('@friggframework/core/integrations/repositories/process-repository-factory');
const { CreateProcess, UpdateProcessState, UpdateProcessMetrics, GetProcess } = require('@friggframework/core');

class ProcessManager {
    constructor() {
        this.processRepository = createProcessRepository();
        this.createProcessUseCase = new CreateProcess({ processRepository: this.processRepository });
        this.updateStateUseCase = new UpdateProcessState({ processRepository: this.processRepository });
        this.updateMetricsUseCase = new UpdateProcessMetrics({ processRepository: this.processRepository });
        this.getProcessUseCase = new GetProcess({ processRepository: this.processRepository });
    }

    async createSyncProcess({
        integrationId,
        userId,
        syncType,           // 'INITIAL' | 'ONGOING' | 'WEBHOOK'
        entityType,         // 'Contact', 'PurchaseOrder', etc.
        state = 'INITIALIZING',
        totalRecords = 0,
        pageSize = 100
    }) {
        const processName = `${integrationId}-${entityType}-sync`;

        const context = {
            syncType,
            entityType,
            totalRecords,
            processedRecords: 0,
            currentPage: 0,
            pagination: {
                pageSize,
                currentCursor: null,
                nextPage: 0,
                hasMore: true
            },
            startTime: new Date().toISOString(),
            endTime: null,
            metadata: {}
        };

        const results = {
            aggregateData: {
                totalSynced: 0,
                totalFailed: 0,
                duration: 0,
                errors: []
            },
            pages: {
                totalPages: 0,
                processedPages: 0,
                failedPages: 0
            }
        };

        return await this.createProcessUseCase.execute({
            userId,
            integrationId,
            name: processName,
            type: 'SYNC',
            state,
            context,
            results
        });
    }

    async updateState(processId, newState, contextUpdates = {}) {
        return await this.updateStateUseCase.execute({
            processId,
            state: newState,
            contextUpdates
        });
    }

    async updateMetrics(processId, { processed, success, errors, errorDetails }) {
        return await this.updateMetricsUseCase.execute({
            processId,
            metrics: { processed, success, errors, errorDetails }
        });
    }

    async completeProcess(processId) {
        return await this.updateState(processId, 'COMPLETED', {
            endTime: new Date().toISOString()
        });
    }

    async handleError(processId, error) {
        return await this.updateState(processId, 'ERROR', {
            error: {
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        });
    }
}

module.exports = { ProcessManager };
```

---

## friggCommands

`friggCommands` provides a standardized interface for integration configuration management. Use it to persist webhook IDs, sync settings, and other integration-specific config.

### Initialization

```javascript
const { createFriggCommands } = require('@friggframework/core');

class MyIntegration extends IntegrationBase {
    constructor(params) {
        super(params);

        this.commands = createFriggCommands({
            integrationClass: MyIntegration
        });
    }
}
```

### Updating Integration Config

```javascript
// Store webhook configuration
await this.commands.updateIntegrationConfig({
    integrationId: this.id,
    config: {
        webhookId: 'wh_abc123',
        webhookSecret: 'secret_xyz',
        webhookUrl: 'https://api.myapp.com/webhooks/my-integration',
        webhooksCreatedAt: new Date().toISOString(),

        // Sync settings
        enabledEntityTypes: ['contacts', 'orders'],
        lastSyncTimestamp: new Date().toISOString(),
        syncBatchSize: 100,

        // Feature flags
        enableBidirectionalSync: false,
        enableWebhookLogging: true
    }
});
```

### Reading Integration Config

```javascript
const config = await this.commands.getIntegrationConfig({
    integrationId: this.id
});

if (config.webhookId) {
    // Webhook already configured
}
```

---

## Queue Management

The `QueueManager` wraps AWS SQS for managing async jobs with rate limiting and fan-out support.

### QueueManager Implementation

```javascript
const { QueuerUtil } = require('@friggframework/core');

class QueueManager {
    constructor({ queueUrl }) {
        this.queuerUtil = new QueuerUtil();
        this.queueUrl = queueUrl;
    }

    /**
     * Queue a single message with optional delay
     */
    async queueMessage({ action, delaySeconds = 0, ...data }) {
        const message = {
            event: action,
            data: {
                ...data,
                queuedAt: new Date().toISOString()
            }
        };

        return await this.queuerUtil.sendMessage({
            queueUrl: this.queueUrl,
            messageBody: JSON.stringify(message),
            delaySeconds
        });
    }

    /**
     * Queue a page fetch operation
     */
    async queueFetchPage({
        processId,
        entityType,
        page,
        cursor,
        limit,
        modifiedSince
    }) {
        return this.queueMessage({
            action: 'FETCH_PAGE',
            processId,
            entityType,
            page,
            cursor,
            limit,
            modifiedSince
        });
    }

    /**
     * Queue a batch processing operation
     */
    async queueProcessBatch({
        processId,
        entityIds,
        entityType,
        page
    }) {
        return this.queueMessage({
            action: 'PROCESS_BATCH',
            processId,
            entityIds,
            entityType,
            page
        });
    }

    /**
     * Fan-out: Queue multiple pages concurrently
     * Use when API returns total count upfront
     */
    async fanOutPages({
        processId,
        entityType,
        totalPages,
        startPage = 1,
        limit
    }) {
        const messages = [];

        for (let page = startPage; page <= totalPages; page++) {
            messages.push({
                event: 'FETCH_PAGE',
                data: {
                    processId,
                    entityType,
                    page,
                    limit
                }
            });
        }

        // SQS supports up to 10 messages per batch
        const batches = this._chunk(messages, 10);

        for (const batch of batches) {
            await this.queuerUtil.sendMessageBatch({
                queueUrl: this.queueUrl,
                entries: batch.map((msg, idx) => ({
                    id: `${processId}-page-${idx}`,
                    messageBody: JSON.stringify(msg)
                }))
            });
        }
    }

    _chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = { QueueManager };
```

---

## Integration Events

Define event handlers in your integration class to handle different types of operations.

### Event Types

| Type | Purpose | Trigger |
|------|---------|---------|
| `USER_ACTION` | User-initiated operations | UI button click |
| `CRON` | Scheduled operations | CloudWatch Events |
| `QUEUE` | Queue-triggered handlers | SQS messages |
| `WEBHOOK` | External webhook events | HTTP POST from external service |

### Defining Events

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        // ... other definition properties
    };

    constructor(params) {
        super(params);

        this.events = {
            // User-triggered initial sync
            INITIAL_SYNC: {
                type: 'USER_ACTION',
                handler: this.startInitialSync.bind(this),
                title: 'Start Initial Sync',
                description: 'Sync all records from source to destination'
            },

            // Cron-triggered ongoing sync
            ONGOING_SYNC: {
                type: 'CRON',
                handler: this.startOngoingSync.bind(this),
                schedule: 'rate(15 minutes)'
            },

            // Queue handlers
            FETCH_PAGE: {
                type: 'QUEUE',
                handler: this.fetchPageHandler.bind(this)
            },
            PROCESS_BATCH: {
                type: 'QUEUE',
                handler: this.processBatchHandler.bind(this)
            },
            COMPLETE_SYNC: {
                type: 'QUEUE',
                handler: this.completeSyncHandler.bind(this)
            },

            // Webhook event logging
            LOG_WEBHOOK_EVENT: {
                type: 'WEBHOOK',
                handler: this.logWebhookEvent.bind(this)
            },

            // Post-creation setup (with delay for API key propagation)
            POST_CREATE_SETUP: {
                type: 'QUEUE',
                handler: this.handlePostCreateSetup.bind(this),
                delaySeconds: 35  // Wait for API keys to propagate
            }
        };
    }
}
```

---

## Sync Orchestration

The `SyncOrchestrator` coordinates sync operations across entity types.

### SyncOrchestrator Implementation

```javascript
class SyncOrchestrator {
    constructor({ processManager, queueManager }) {
        this.processManager = processManager;
        this.queueManager = queueManager;
    }

    /**
     * Start a sync for multiple entity types
     */
    async startSync({
        integrationId,
        userId,
        syncType,           // 'INITIAL' | 'ONGOING'
        entityTypes,        // ['contacts', 'orders', 'products']
        options = {}
    }) {
        const results = [];

        for (const entityType of entityTypes) {
            const process = await this.processManager.createSyncProcess({
                integrationId,
                userId,
                syncType,
                entityType,
                pageSize: options.pageSize || 100
            });

            // Queue the first page fetch
            await this.queueManager.queueFetchPage({
                processId: process.id,
                entityType,
                page: 0,
                limit: options.pageSize || 100,
                modifiedSince: syncType === 'ONGOING' ? options.lastSyncTimestamp : null
            });

            results.push({
                entityType,
                processId: process.id,
                status: 'QUEUED'
            });
        }

        return results;
    }
}

module.exports = { SyncOrchestrator };
```

### Sync Flow Diagram

```
1. startSync(entityTypes: ['contacts', 'orders'])
   ↓
2. For each entityType:
   - Create Process (state: INITIALIZING)
   - Queue FETCH_PAGE for page 0
   ↓
3. Worker receives FETCH_PAGE
   - Fetch first page from API
   - If page-based with total count:
     → Fan-out: Queue pages 1..N immediately
   - Queue PROCESS_BATCH for current page data
   ↓
4. Worker receives PROCESS_BATCH
   - Transform records to destination format
   - Bulk upsert to destination API
   - Update process metrics
   ↓
5. All pages processed
   - Queue COMPLETE_SYNC
   - Process state → COMPLETED
```

### Pagination Strategies

**Page-Based** (when API returns total count):
```javascript
async fetchPageHandler({ processId, entityType, page, limit }) {
    const result = await this.api.getRecords({ page, limit });

    // Fan-out optimization: queue all remaining pages immediately
    if (page === 0 && result.total) {
        const totalPages = Math.ceil(result.total / limit);

        await this.queueManager.fanOutPages({
            processId,
            entityType,
            totalPages,
            startPage: 1,
            limit
        });

        await this.processManager.updateState(processId, 'QUEUING_PAGES', {
            totalRecords: result.total,
            totalPages
        });
    }

    // Queue batch processing for current page
    await this.queueManager.queueProcessBatch({
        processId,
        entityIds: result.records.map(r => r.id),
        entityType,
        page
    });
}
```

**Cursor-Based** (when API returns nextCursor):
```javascript
async fetchPageHandler({ processId, entityType, cursor, limit }) {
    const result = await this.api.getRecords({ cursor, limit });

    // Process inline (no separate batch queue)
    await this.processRecords(processId, result.records);

    // Queue next page if more data
    if (result.nextCursor) {
        await this.queueManager.queueFetchPage({
            processId,
            entityType,
            cursor: result.nextCursor,
            limit
        });
    } else {
        // No more pages - complete sync
        await this.queueManager.queueMessage({
            action: 'COMPLETE_SYNC',
            processId
        });
    }
}
```

---

## Webhook Handling

### Webhook Event Processor

```javascript
class WebhookEventProcessor {
    /**
     * Process incoming webhook events
     */
    static async processEvent({
        webhookData,
        sourceApi,
        destinationApi,
        mappingRepository,
        eventType
    }) {
        const eventId = webhookData.id || webhookData.eventId;

        // Prevent duplicate processing
        const existing = await mappingRepository.findByExternalId(eventId);
        if (existing) {
            console.log(`Event ${eventId} already processed, skipping`);
            return { skipped: true, reason: 'duplicate' };
        }

        // Process based on event type
        switch (eventType) {
            case 'record.created':
            case 'record.updated':
                return await this.syncRecord({
                    record: webhookData.data,
                    sourceApi,
                    destinationApi,
                    mappingRepository
                });

            case 'record.deleted':
                return await this.deleteRecord({
                    recordId: webhookData.data.id,
                    destinationApi,
                    mappingRepository
                });

            default:
                console.log(`Unknown event type: ${eventType}`);
                return { skipped: true, reason: 'unknown_event' };
        }
    }

    static async syncRecord({ record, sourceApi, destinationApi, mappingRepository }) {
        // Transform record to destination format
        const transformed = this.transformRecord(record);

        // Check if mapping exists
        const mapping = await mappingRepository.findBySourceId(record.id);

        let result;
        if (mapping) {
            // Update existing
            result = await destinationApi.updateRecord(mapping.destinationId, transformed);
        } else {
            // Create new
            result = await destinationApi.createRecord(transformed);
            await mappingRepository.create({
                sourceId: record.id,
                destinationId: result.id
            });
        }

        return { success: true, action: mapping ? 'updated' : 'created' };
    }
}

module.exports = { WebhookEventProcessor };
```

### Webhook Setup Pattern

```javascript
async setupWebhooks() {
    const webhookUrl = `${process.env.BASE_URL}/webhooks/${this.Definition.name}`;

    // Create webhooks for different event types
    const webhooks = await Promise.all([
        this.sourceApi.createWebhook({
            url: webhookUrl,
            events: ['record.created', 'record.updated', 'record.deleted']
        })
    ]);

    // Persist webhook config
    await this.commands.updateIntegrationConfig({
        integrationId: this.id,
        config: {
            webhookId: webhooks[0].id,
            webhookSecret: webhooks[0].secret,
            webhookUrl,
            webhooksCreatedAt: new Date().toISOString()
        }
    });

    return webhooks;
}
```

---

## Complete Example

Here's a complete integration implementing all patterns:

```javascript
const { IntegrationBase, createFriggCommands } = require('@friggframework/core');
const { ProcessManager } = require('./services/ProcessManager');
const { QueueManager } = require('./services/QueueManager');
const { SyncOrchestrator } = require('./services/SyncOrchestrator');

class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],

        display: {
            label: 'My Integration',
            description: 'Sync data between systems',
            category: 'Data'
        },

        modules: {
            source: { definition: SourceApiDefinition },
            destination: { definition: DestinationApiDefinition }
        },

        events: [
            'SYNC_STARTED',
            'SYNC_COMPLETED',
            'SYNC_FAILED',
            'RECORD_SYNCED'
        ]
    };

    static Config = {
        syncOrder: ['contacts', 'orders', 'products'],
        batchSize: 100,
        rateLimitDelayMs: 1000
    };

    constructor(params) {
        super(params);

        this.commands = createFriggCommands({
            integrationClass: MyIntegration
        });

        this.processManager = new ProcessManager();
        this.queueManager = new QueueManager({
            queueUrl: process.env.MY_INTEGRATION_QUEUE_URL
        });
        this.syncOrchestrator = new SyncOrchestrator({
            processManager: this.processManager,
            queueManager: this.queueManager
        });

        this.events = {
            INITIAL_SYNC: {
                type: 'USER_ACTION',
                handler: this.startInitialSync.bind(this),
                title: 'Initial Sync',
                description: 'Sync all data from source to destination'
            },
            ONGOING_SYNC: {
                type: 'CRON',
                handler: this.startOngoingSync.bind(this)
            },
            FETCH_PAGE: {
                handler: this.fetchPageHandler.bind(this)
            },
            PROCESS_BATCH: {
                handler: this.processBatchHandler.bind(this)
            },
            COMPLETE_SYNC: {
                handler: this.completeSyncHandler.bind(this)
            }
        };
    }

    async startInitialSync() {
        this.emit('SYNC_STARTED', { type: 'INITIAL' });

        return await this.syncOrchestrator.startSync({
            integrationId: this.id,
            userId: this.userId,
            syncType: 'INITIAL',
            entityTypes: MyIntegration.Config.syncOrder,
            options: {
                pageSize: MyIntegration.Config.batchSize
            }
        });
    }

    async startOngoingSync() {
        const config = await this.commands.getIntegrationConfig({
            integrationId: this.id
        });

        this.emit('SYNC_STARTED', { type: 'ONGOING' });

        return await this.syncOrchestrator.startSync({
            integrationId: this.id,
            userId: this.userId,
            syncType: 'ONGOING',
            entityTypes: MyIntegration.Config.syncOrder,
            options: {
                pageSize: MyIntegration.Config.batchSize,
                lastSyncTimestamp: config.lastSyncTimestamp
            }
        });
    }

    async fetchPageHandler(data) {
        // Implementation as shown above
    }

    async processBatchHandler(data) {
        // Implementation as shown above
    }

    async completeSyncHandler({ processId }) {
        await this.processManager.completeProcess(processId);

        // Update last sync timestamp
        await this.commands.updateIntegrationConfig({
            integrationId: this.id,
            config: {
                lastSyncTimestamp: new Date().toISOString()
            }
        });

        this.emit('SYNC_COMPLETED', { processId });
    }
}

module.exports = { MyIntegration };
```

---

## Best Practices

### Rate Limiting

Always respect API rate limits:

```javascript
async processBatchHandler({ processId, entityIds, entityType }) {
    const batchSize = 5;  // Small batches for rate-limited APIs
    const delayMs = 1000; // 1 second between batches

    for (let i = 0; i < entityIds.length; i += batchSize) {
        const batch = entityIds.slice(i, i + batchSize);
        await this.processBatch(batch);

        if (i + batchSize < entityIds.length) {
            await this.sleep(delayMs);
        }
    }
}

sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Error Handling

Track errors at the process level:

```javascript
async processBatchHandler({ processId, entityIds }) {
    const results = { success: 0, errors: [] };

    for (const id of entityIds) {
        try {
            await this.processRecord(id);
            results.success++;
        } catch (error) {
            results.errors.push({
                entityId: id,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    await this.processManager.updateMetrics(processId, {
        processed: entityIds.length,
        success: results.success,
        errors: results.errors.length,
        errorDetails: results.errors
    });
}
```

### Idempotency

Use mapping repositories to prevent duplicates:

```javascript
async processRecord(sourceRecord) {
    const mapping = await this.mappingRepo.findBySourceId(sourceRecord.id);

    if (mapping) {
        // Update existing
        return await this.destinationApi.update(mapping.destinationId, sourceRecord);
    } else {
        // Create new
        const created = await this.destinationApi.create(sourceRecord);
        await this.mappingRepo.create({
            sourceId: sourceRecord.id,
            destinationId: created.id
        });
        return created;
    }
}
```

---

## Related Documentation

- [API Module Definition and Functions](/docs/reference/api-module-definition-and-functions.md) - API module structure
- [JSON Schemas](/packages/schemas/schemas/) - Canonical schema definitions:
  - `api-module-definition.schema.json` - API module validation
  - `integration-definition.schema.json` - Integration class validation
  - `app-definition.schema.json` - App configuration validation
- [CLAUDE.md](/CLAUDE.md) - Hexagonal architecture patterns (DDD section)
- [Testing Guide](/docs/TESTING_GUIDE.md) - Testing patterns
