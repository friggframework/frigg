# Process Management FIFO Queue Specification

## Problem Statement

The current BaseCRMIntegration implementation has a **race condition** in process record updates:

1. Multiple queue workers process batches concurrently
2. Each worker calls `processManager.updateMetrics()`
3. Multiple workers read-modify-write the same process record simultaneously
4. **Result**: Lost updates, inconsistent metrics, potential data corruption

## Current Race Condition Example

```
Time 1: Worker A reads process.results.aggregateData.totalSynced = 100
Time 2: Worker B reads process.results.aggregateData.totalSynced = 100
Time 3: Worker A adds 50 → writes totalSynced = 150
Time 4: Worker B adds 30 → writes totalSynced = 130 (overwrites Worker A's update!)
```

## Solution: FIFO Queue for Process Updates

### Design Overview

Create a dedicated FIFO SQS queue in **Frigg Core** for all process management operations:

-   **Queue Type**: FIFO (First-In-First-Out)
-   **Message Group ID**: `process-{processId}` (ensures ordered processing per process)
-   **Message Deduplication**: Enabled (prevents duplicate updates)
-   **Dead Letter Queue**: Enabled (captures failed updates)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Current Flow (Race Condition)           │
├─────────────────────────────────────────────────────────────┤
│ Worker A ──┐                                               │
│ Worker B ──┼──→ ProcessManager.updateMetrics()             │
│ Worker C ──┘                                               │
│              └──→ ProcessRepository.update()               │
│                      (Race condition!)                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Proposed Flow (FIFO Queue)               │
├─────────────────────────────────────────────────────────────┤
│ Worker A ──┐                                               │
│ Worker B ──┼──→ QueueManager.queueProcessUpdate()          │
│ Worker C ──┘                                               │
│              └──→ ProcessManagementFIFOQueue                │
│                      └──→ ProcessUpdateHandler              │
│                              └──→ ProcessRepository.update()│
│                                   (Ordered, no races!)     │
└─────────────────────────────────────────────────────────────┘
```

## Frigg Core Implementation

### 1. Process Management Queue Factory

**File**: `/packages/core/integrations/queues/process-management-queue-factory.js`

```javascript
const { SQS } = require('aws-sdk');

/**
 * Creates FIFO queue for process management operations
 * Ensures ordered processing per process ID
 */
class ProcessManagementQueueFactory {
    constructor({ region = 'us-east-1' } = {}) {
        this.sqs = new SQS({ region });
    }

    /**
     * Create FIFO queue for process updates
     * @param {string} integrationName - Integration name (for queue naming)
     * @returns {Promise<string>} Queue URL
     */
    async createProcessManagementQueue(integrationName) {
        const queueName = `${integrationName}-process-management.fifo`;

        const params = {
            QueueName: queueName,
            Attributes: {
                FifoQueue: 'true',
                ContentBasedDeduplication: 'true',
                MessageRetentionPeriod: '1209600', // 14 days
                VisibilityTimeoutSeconds: '30',
                DelaySeconds: '0',
                ReceiveMessageWaitTimeSeconds: '20', // Long polling
                DeadLetterTargetArn: `${queueName}-dlq.fifo`, // DLQ
                MaxReceiveCount: '3', // Retry failed messages 3 times
            },
        };

        const result = await this.sqs.createQueue(params).promise();
        return result.QueueUrl;
    }

    /**
     * Send process update message to FIFO queue
     * @param {string} queueUrl - FIFO queue URL
     * @param {string} processId - Process ID (used as MessageGroupId)
     * @param {string} operation - Operation type (UPDATE_STATE, UPDATE_METRICS, COMPLETE)
     * @param {Object} data - Operation data
     * @returns {Promise<void>}
     */
    async sendProcessUpdate(queueUrl, processId, operation, data) {
        const params = {
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
                processId,
                operation,
                data,
                timestamp: new Date().toISOString(),
            }),
            MessageGroupId: `process-${processId}`,
            MessageDeduplicationId: `${processId}-${operation}-${Date.now()}`,
        };

        await this.sqs.sendMessage(params).promise();
    }
}

module.exports = { ProcessManagementQueueFactory };
```

### 2. Process Update Handler

**File**: `/packages/core/integrations/handlers/process-update-handler.js`

```javascript
const {
    UpdateProcessState,
    UpdateProcessMetrics,
    GetProcess,
} = require('../use-cases');
const {
    createProcessRepository,
} = require('../repositories/process-repository-factory');

/**
 * Handler for process management FIFO queue messages
 * Processes updates in order per process ID
 */
class ProcessUpdateHandler {
    constructor() {
        const processRepository = createProcessRepository();
        this.updateProcessStateUseCase = new UpdateProcessState({
            processRepository,
        });
        this.updateProcessMetricsUseCase = new UpdateProcessMetrics({
            processRepository,
        });
        this.getProcessUseCase = new GetProcess({ processRepository });
    }

    /**
     * Handle process update message from FIFO queue
     * @param {Object} message - SQS message
     * @param {Object} message.body - Message body (JSON string)
     * @returns {Promise<void>}
     */
    async handle(message) {
        try {
            const { processId, operation, data } = JSON.parse(message.body);

            switch (operation) {
                case 'UPDATE_STATE':
                    await this.updateProcessStateUseCase.execute(
                        processId,
                        data.state,
                        data.contextUpdates
                    );
                    break;

                case 'UPDATE_METRICS':
                    await this.updateProcessMetricsUseCase.execute(
                        processId,
                        data.metricsUpdate
                    );
                    break;

                case 'COMPLETE_PROCESS':
                    await this.updateProcessStateUseCase.execute(
                        processId,
                        'COMPLETED',
                        { endTime: new Date().toISOString() }
                    );
                    break;

                case 'HANDLE_ERROR':
                    await this.updateProcessStateUseCase.execute(
                        processId,
                        'ERROR',
                        {
                            error: data.error.message,
                            errorStack: data.error.stack,
                            errorTimestamp: new Date().toISOString(),
                        }
                    );
                    break;

                default:
                    throw new Error(`Unknown process operation: ${operation}`);
            }

            console.log(
                `Process update completed: ${operation} for process ${processId}`
            );
        } catch (error) {
            console.error('Process update failed:', error);
            throw error; // Will trigger SQS retry/DLQ
        }
    }
}

module.exports = { ProcessUpdateHandler };
```

### 3. QueueManager Enhancement

**File**: `/packages/core/integrations/queues/process-queue-manager.js`

```javascript
const {
    ProcessManagementQueueFactory,
} = require('./process-management-queue-factory');

/**
 * Manages process update operations via FIFO queue
 * Prevents race conditions in concurrent process updates
 */
class ProcessQueueManager {
    constructor({ region = 'us-east-1' } = {}) {
        this.factory = new ProcessManagementQueueFactory({ region });
        this.queueUrls = new Map(); // Cache queue URLs per integration
    }

    /**
     * Get or create FIFO queue for integration
     * @param {string} integrationName - Integration name
     * @returns {Promise<string>} Queue URL
     */
    async getProcessQueueUrl(integrationName) {
        if (!this.queueUrls.has(integrationName)) {
            const queueUrl = await this.factory.createProcessManagementQueue(
                integrationName
            );
            this.queueUrls.set(integrationName, queueUrl);
        }
        return this.queueUrls.get(integrationName);
    }

    /**
     * Queue process state update
     * @param {string} integrationName - Integration name
     * @param {string} processId - Process ID
     * @param {string} state - New state
     * @param {Object} contextUpdates - Context updates
     * @returns {Promise<void>}
     */
    async queueStateUpdate(
        integrationName,
        processId,
        state,
        contextUpdates = {}
    ) {
        const queueUrl = await this.getProcessQueueUrl(integrationName);
        await this.factory.sendProcessUpdate(
            queueUrl,
            processId,
            'UPDATE_STATE',
            {
                state,
                contextUpdates,
            }
        );
    }

    /**
     * Queue process metrics update
     * @param {string} integrationName - Integration name
     * @param {string} processId - Process ID
     * @param {Object} metricsUpdate - Metrics to add
     * @returns {Promise<void>}
     */
    async queueMetricsUpdate(integrationName, processId, metricsUpdate) {
        const queueUrl = await this.getProcessQueueUrl(integrationName);
        await this.factory.sendProcessUpdate(
            queueUrl,
            processId,
            'UPDATE_METRICS',
            {
                metricsUpdate,
            }
        );
    }

    /**
     * Queue process completion
     * @param {string} integrationName - Integration name
     * @param {string} processId - Process ID
     * @returns {Promise<void>}
     */
    async queueProcessCompletion(integrationName, processId) {
        const queueUrl = await this.getProcessQueueUrl(integrationName);
        await this.factory.sendProcessUpdate(
            queueUrl,
            processId,
            'COMPLETE_PROCESS',
            {}
        );
    }

    /**
     * Queue process error handling
     * @param {string} integrationName - Integration name
     * @param {string} processId - Process ID
     * @param {Error} error - Error object
     * @returns {Promise<void>}
     */
    async queueErrorHandling(integrationName, processId, error) {
        const queueUrl = await this.getProcessQueueUrl(integrationName);
        await this.factory.sendProcessUpdate(
            queueUrl,
            processId,
            'HANDLE_ERROR',
            {
                error: {
                    message: error.message,
                    stack: error.stack,
                },
            }
        );
    }
}

module.exports = { ProcessQueueManager };
```

## Integration with BaseCRMIntegration

### Updated ProcessManager

**File**: `/Users/sean/Documents/GitHub/quo--frigg/backend/src/base/services/ProcessManager.js`

```javascript
const {
    ProcessQueueManager,
} = require('@friggframework/core/integrations/queues/process-queue-manager');

class ProcessManager {
    constructor({
        createProcessUseCase,
        updateProcessStateUseCase,
        updateProcessMetricsUseCase,
        getProcessUseCase,
        integrationName, // NEW: For FIFO queue
    }) {
        // ... existing constructor ...
        this.processQueueManager = new ProcessQueueManager();
        this.integrationName = integrationName;
    }

    /**
     * Update process state via FIFO queue (prevents race conditions)
     * @param {string} processId - Process ID to update
     * @param {string} state - New state
     * @param {Object} contextUpdates - Context updates
     * @returns {Promise<void>} (async, no return value)
     */
    async updateState(processId, state, contextUpdates = {}) {
        await this.processQueueManager.queueStateUpdate(
            this.integrationName,
            processId,
            state,
            contextUpdates
        );
    }

    /**
     * Update process metrics via FIFO queue (prevents race conditions)
     * @param {string} processId - Process ID to update
     * @param {Object} metricsUpdate - Metrics to add
     * @returns {Promise<void>} (async, no return value)
     */
    async updateMetrics(processId, metricsUpdate) {
        await this.processQueueManager.queueMetricsUpdate(
            this.integrationName,
            processId,
            metricsUpdate
        );
    }

    /**
     * Complete process via FIFO queue
     * @param {string} processId - Process ID to complete
     * @returns {Promise<void>} (async, no return value)
     */
    async completeProcess(processId) {
        await this.processQueueManager.queueProcessCompletion(
            this.integrationName,
            processId
        );
    }

    /**
     * Handle process error via FIFO queue
     * @param {string} processId - Process ID to update
     * @param {Error} error - Error object
     * @returns {Promise<void>} (async, no return value)
     */
    async handleError(processId, error) {
        await this.processQueueManager.queueErrorHandling(
            this.integrationName,
            processId,
            error
        );
    }
}
```

## Serverless Infrastructure

### FIFO Queue Creation

**File**: `/packages/devtools/infrastructure/serverless-template.js`

```javascript
const attachProcessManagementQueues = (definition, AppDefinition) => {
    for (const integration of AppDefinition.integrations) {
        const integrationName = integration.Definition.name;

        // Create FIFO queue for process management
        const processQueueName = `${integrationName}ProcessManagementQueue`;
        const processDLQName = `${integrationName}ProcessManagementDLQ`;

        // FIFO Queue
        definition.resources.Resources[processQueueName] = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: `${integrationName}-process-management.fifo`,
                FifoQueue: true,
                ContentBasedDeduplication: true,
                MessageRetentionPeriod: 1209600, // 14 days
                VisibilityTimeoutSeconds: 30,
                DelaySeconds: 0,
                ReceiveMessageWaitTimeSeconds: 20, // Long polling
                RedrivePolicy: {
                    deadLetterTargetArn: {
                        'Fn::GetAtt': [processDLQName, 'Arn'],
                    },
                    maxReceiveCount: 3,
                },
            },
        };

        // Dead Letter Queue
        definition.resources.Resources[processDLQName] = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: `${integrationName}-process-management-dlq.fifo`,
                FifoQueue: true,
                MessageRetentionPeriod: 1209600,
            },
        };

        // Process Update Handler Function
        const processHandlerName = `${integrationName}ProcessUpdateHandler`;
        definition.functions[processHandlerName] = {
            handler:
                'node_modules/@friggframework/core/handlers/process-update-handler.handler',
            reservedConcurrency: 1, // Process updates sequentially per integration
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': [processQueueName, 'Arn'] },
                        batchSize: 1, // Process one update at a time
                        maximumBatchingWindowInSeconds: 5,
                    },
                },
            ],
            timeout: 30,
            environment: {
                INTEGRATION_NAME: integrationName,
            },
        };
    }
};
```

## Benefits

### ✅ Race Condition Prevention

-   FIFO queue ensures ordered processing per process ID
-   MessageGroupId = `process-{processId}` guarantees sequential updates
-   No more lost updates or inconsistent metrics

### ✅ Cost Optimization

-   Only one FIFO queue per integration (not per process)
-   MessageGroupId provides ordering without expensive per-process queues
-   Long polling reduces API calls

### ✅ Reliability

-   Dead Letter Queue captures failed updates
-   Retry mechanism with exponential backoff
-   Content-based deduplication prevents duplicate processing

### ✅ Scalability

-   Each integration has its own process management queue
-   Process updates don't block data processing
-   Can scale process update handlers independently

## Migration Strategy

### Phase 1: Current Implementation (Native Queue)

-   Use existing integration queue for process updates
-   Accept potential race conditions for now
-   Focus on core functionality

### Phase 2: FIFO Queue Implementation

-   Implement FIFO queue infrastructure in Frigg Core
-   Update ProcessManager to use FIFO queue
-   Deploy with feature flag

### Phase 3: Full Migration

-   Switch all integrations to FIFO queue
-   Remove native queue process update code
-   Monitor for race condition elimination

## Cost Analysis

### FIFO Queue Costs (per integration)

-   **Queue Creation**: Free
-   **Message Storage**: $0.40 per million messages
-   **Message Processing**: $0.40 per million requests
-   **Example**: 10 integrations, 1000 process updates/day = ~$2.40/month

### Benefits vs Costs

-   **Cost**: ~$2.40/month for 10 integrations
-   **Benefit**: Eliminates race conditions, ensures data consistency
-   **ROI**: High - prevents data corruption and debugging time

## Implementation Priority

**High Priority** - Race conditions in process updates can cause:

-   Lost sync progress
-   Inconsistent metrics
-   Difficult debugging
-   Data integrity issues

**Recommended Timeline**:

1. **Week 1**: Implement FIFO queue infrastructure in Frigg Core
2. **Week 2**: Update ProcessManager to use FIFO queue
3. **Week 3**: Deploy and test with one integration
4. **Week 4**: Roll out to all integrations

This solution provides a robust, scalable approach to process management while maintaining the performance benefits of concurrent data processing.
