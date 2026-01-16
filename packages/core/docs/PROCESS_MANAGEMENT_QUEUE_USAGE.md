# Process Management Queue - Usage Guide

## Overview

The Process Management Queue is an **optional feature** that prevents race conditions when updating process records from concurrent workers. It uses a single FIFO (First-In-First-Out) SQS queue to ensure ordered processing of updates for each process.

## Problem Statement

Without the queue, concurrent workers can cause race conditions:

```
Time 1: Worker A reads process.totalSynced = 100
Time 2: Worker B reads process.totalSynced = 100
Time 3: Worker A adds 50 → writes totalSynced = 150
Time 4: Worker B adds 30 → writes totalSynced = 130 (overwrites Worker A's update!)
```

**Result**: Lost updates, inconsistent metrics, data corruption.

## Solution

The Process Management Queue ensures ordered processing:

```
Worker A ──┐
Worker B ──┼──→ queueProcessUpdate() ──→ FIFO Queue ──→ HandleProcessUpdate ──→ Database
Worker C ──┘                              (ordered per process)
```

## Configuration

### Environment Variables

The feature is **disabled by default** and can be enabled via environment variables:

```bash
# Enable the process management queue
PROCESS_QUEUE_ENABLED=true

# Set the FIFO queue URL
PROCESS_MANAGEMENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo
```

### Infrastructure Setup

#### 1. Create FIFO Queue (AWS SQS)

Using AWS CLI:

```bash
aws sqs create-queue \
  --queue-name process-management.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "true",
    "MessageRetentionPeriod": "1209600",
    "VisibilityTimeout": "30",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'
```

Using Serverless Framework (`serverless.yml`):

```yaml
resources:
  Resources:
    ProcessManagementQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: process-management.fifo
        FifoQueue: true
        ContentBasedDeduplication: true
        MessageRetentionPeriod: 1209600  # 14 days
        VisibilityTimeout: 30
        ReceiveMessageWaitTimeSeconds: 20
        RedrivePolicy:
          deadLetterTargetArn: !GetAtt ProcessManagementDLQ.Arn
          maxReceiveCount: 3

    ProcessManagementDLQ:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: process-management-dlq.fifo
        FifoQueue: true
        MessageRetentionPeriod: 1209600

  Outputs:
    ProcessManagementQueueUrl:
      Value: !Ref ProcessManagementQueue
      Export:
        Name: ProcessManagementQueueUrl
```

#### 2. Create Lambda Handler for Queue Processing

Add a Lambda function to process messages from the queue:

```yaml
functions:
  processUpdateHandler:
    handler: handlers/process-update-handler.handler
    events:
      - sqs:
          arn: !GetAtt ProcessManagementQueue.Arn
          batchSize: 1  # Process one update at a time per batch
          maximumBatchingWindowInSeconds: 0
    timeout: 30
    environment:
      PROCESS_QUEUE_ENABLED: true
      PROCESS_MANAGEMENT_QUEUE_URL: !Ref ProcessManagementQueue
```

Create the handler file (`handlers/process-update-handler.js`):

```javascript
const {
    HandleProcessUpdate,
    UpdateProcessState,
    UpdateProcessMetrics,
} = require('@friggframework/core');
const { createProcessRepository } = require('@friggframework/core/integrations/repositories/process-repository-factory');

// Initialize use cases
const processRepository = createProcessRepository();
const updateProcessState = new UpdateProcessState({ processRepository });
const updateProcessMetrics = new UpdateProcessMetrics({ processRepository });

const handleProcessUpdate = new HandleProcessUpdate({
    updateProcessState,
    updateProcessMetrics,
});

exports.handler = async (event) => {
    const results = [];

    for (const record of event.Records) {
        try {
            await handleProcessUpdate.executeFromSQS(record);
            results.push({ messageId: record.messageId, status: 'success' });
        } catch (error) {
            console.error('Failed to process message:', error);
            results.push({ messageId: record.messageId, status: 'failed', error: error.message });
            throw error; // Re-throw to trigger SQS retry/DLQ
        }
    }

    return { batchItemFailures: results.filter(r => r.status === 'failed') };
};
```

## Usage

### Simple API (Recommended)

The easiest way to use the queue is via the `queueProcessUpdate` utility:

```javascript
const { queueProcessUpdate } = require('@friggframework/core');

// Queue a state update
await queueProcessUpdate.queueStateUpdate(
    processId,
    'RUNNING',
    { step: 2, currentBatch: 'batch-456' }
);

// Queue a metrics update
await queueProcessUpdate.queueMetricsUpdate(processId, {
    totalProcessed: 100,
    totalFailed: 2,
    totalSkipped: 5,
});

// Queue process completion
await queueProcessUpdate.queueProcessCompletion(processId);

// Queue error handling
try {
    // ... processing logic
} catch (error) {
    await queueProcessUpdate.queueErrorHandling(processId, error);
    throw error;
}

// Check if queue is enabled
if (queueProcessUpdate.isEnabled()) {
    console.log('Process queue is enabled');
}
```

### Behavior When Disabled

If `PROCESS_QUEUE_ENABLED` is not `true`, all methods return `null` (no-op):

```javascript
const result = await queueProcessUpdate.queueStateUpdate(processId, 'RUNNING');
// result === null (queue is disabled)
```

This allows you to integrate the queue without breaking existing code when disabled.

### Integration with Existing Code

**Before (direct updates, race conditions possible):**

```javascript
const { UpdateProcessState } = require('@friggframework/core');

class MyWorker {
    async processRecords(processId, records) {
        for (const record of records) {
            await this.processRecord(record);

            // Direct update - race condition risk!
            await this.updateProcessState.execute(processId, 'RUNNING', {
                lastProcessedId: record.id,
            });
        }
    }
}
```

**After (queued updates, no race conditions):**

```javascript
const { queueProcessUpdate } = require('@friggframework/core');

class MyWorker {
    async processRecords(processId, records) {
        for (const record of records) {
            await this.processRecord(record);

            // Queued update - no race condition!
            await queueProcessUpdate.queueStateUpdate(processId, 'RUNNING', {
                lastProcessedId: record.id,
            });
        }
    }
}
```

### Advanced Usage: Direct Service Access

For more control, use `ProcessQueueService` directly:

```javascript
const { ProcessQueueService, ProcessUpdateMessage, ProcessUpdateOperation } = require('@friggframework/core');

const queueService = new ProcessQueueService({
    queueUrl: process.env.PROCESS_MANAGEMENT_QUEUE_URL,
});

// Create and send custom message
const message = new ProcessUpdateMessage({
    processId: 'proc-123',
    operation: ProcessUpdateOperation.UPDATE_STATE,
    data: {
        state: 'RUNNING',
        contextUpdates: { step: 1 },
    },
});

await queueService.sendMessage(message);
```

## How It Works

### FIFO Queue Ordering

Messages are grouped by `processId` using `MessageGroupId`:

```javascript
MessageGroupId: 'process-{processId}'
```

This ensures:
- All updates for `proc-123` are processed in order
- Updates for `proc-123` and `proc-456` can be processed concurrently
- No race conditions within a single process

### Message Deduplication

Messages use `MessageDeduplicationId` to prevent duplicates:

```javascript
MessageDeduplicationId: '{processId}-{operation}-{timestamp}'
```

This allows:
- Multiple operations on the same process (different IDs)
- Automatic deduplication of exact duplicates (same ID)

### Operation Types

Four operation types are supported:

1. **UPDATE_STATE**: Updates process state and context
2. **UPDATE_METRICS**: Updates process metrics (cumulative)
3. **COMPLETE_PROCESS**: Marks process as completed
4. **HANDLE_ERROR**: Marks process as errored

## Architecture

### Hexagonal Architecture

```
┌─────────────────────────────────────────────┐
│          Application Layer                  │
│  - queueProcessUpdate (utility)             │
│  - HandleProcessUpdate (use case)           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          Domain Layer                       │
│  - ProcessUpdateMessage (value object)      │
│  - ProcessQueueService (domain service)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          Infrastructure                     │
│  - SQS Client (AWS SDK)                     │
│  - ProcessRepository (MongoDB/PostgreSQL)   │
└─────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Layer |
|-----------|----------------|-------|
| `queueProcessUpdate` | Public API for queueing updates | Application |
| `ProcessQueueService` | Sends messages to SQS queue | Domain Service |
| `ProcessUpdateMessage` | Immutable message value object | Domain |
| `HandleProcessUpdate` | Processes messages from queue | Application |
| `UpdateProcessState` | Updates process state in DB | Application |
| `UpdateProcessMetrics` | Updates process metrics in DB | Application |

## Testing

### Unit Tests

```javascript
const { ProcessUpdateMessage, ProcessUpdateOperation } = require('@friggframework/core');

describe('ProcessUpdateMessage', () => {
    it('should create UPDATE_STATE message', () => {
        const message = new ProcessUpdateMessage({
            processId: 'proc-123',
            operation: ProcessUpdateOperation.UPDATE_STATE,
            data: { state: 'RUNNING', contextUpdates: {} },
        });

        expect(message.processId).toBe('proc-123');
        expect(message.getMessageGroupId()).toBe('process-proc-123');
    });
});
```

### Integration Tests

```javascript
const { queueProcessUpdate } = require('@friggframework/core');

describe('Process Queue Integration', () => {
    beforeEach(() => {
        process.env.PROCESS_QUEUE_ENABLED = 'true';
        process.env.PROCESS_MANAGEMENT_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/test.fifo';
    });

    it('should queue state update', async () => {
        await queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING');
        // Assert message sent to SQS
    });
});
```

## Performance Considerations

### Latency

- **Without Queue**: Immediate database update (~50-100ms)
- **With Queue**: Asynchronous via SQS (~100-500ms)

The queue adds latency but prevents race conditions. For most use cases, the trade-off is acceptable.

### Cost

- **SQS FIFO**: $0.40 per million requests
- **Example**: 10,000 process updates/day = ~$0.12/month

### Throughput

- **Single Queue**: Handles all processes
- **MessageGroupId**: Ensures ordering per process
- **Concurrent Processing**: Different processes can be processed in parallel

## Monitoring

### CloudWatch Metrics

Monitor these SQS metrics:

- `NumberOfMessagesSent`: Messages queued
- `NumberOfMessagesReceived`: Messages processed
- `ApproximateAgeOfOldestMessage`: Queue backlog
- `NumberOfMessagesDeleted`: Successful processing

### Dead Letter Queue (DLQ)

Failed messages (after 3 retries) are sent to the DLQ:

```bash
# Check DLQ for failed messages
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/process-management-dlq.fifo
```

## Troubleshooting

### Messages Not Being Processed

1. Check Lambda function is subscribed to queue
2. Verify `PROCESS_QUEUE_ENABLED=true` in Lambda environment
3. Check CloudWatch Logs for errors

### Race Conditions Still Occurring

1. Verify `PROCESS_QUEUE_ENABLED=true` in worker environment
2. Ensure all workers use `queueProcessUpdate` instead of direct updates
3. Check MessageGroupId is set correctly (should be `process-{processId}`)

### Messages in DLQ

1. Check DLQ messages: `aws sqs receive-message --queue-url <dlq-url>`
2. Review error logs in CloudWatch
3. Fix underlying issue (e.g., database connection, invalid data)
4. Optionally replay DLQ messages

## Migration Guide

### Step 1: Add Infrastructure

1. Create FIFO queue (see Configuration section)
2. Deploy Lambda handler
3. Set environment variables

### Step 2: Update Code

Replace direct updates:

```javascript
// Before
await updateProcessState.execute(processId, 'RUNNING', context);

// After
await queueProcessUpdate.queueStateUpdate(processId, 'RUNNING', context);
```

### Step 3: Enable Queue

```bash
export PROCESS_QUEUE_ENABLED=true
export PROCESS_MANAGEMENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo
```

### Step 4: Monitor

- Watch CloudWatch metrics
- Check DLQ for failures
- Verify no race conditions

## Best Practices

1. **Always Use the Queue for Concurrent Updates**: If multiple workers update the same process, use the queue
2. **Keep Messages Small**: Only include necessary data in updates
3. **Monitor the DLQ**: Set up alerts for messages in DLQ
4. **Set Appropriate Timeouts**: Lambda timeout should be > SQS visibility timeout
5. **Use Environment Variables**: Don't hardcode queue URLs
6. **Test Both Modes**: Test with queue enabled and disabled

## FAQ

### Q: Is the queue required?

**A:** No, it's optional. Enable it only if you have concurrent workers updating the same process.

### Q: What happens if I don't enable the queue?

**A:** All `queueProcessUpdate` methods return `null` (no-op). Your code continues to work without changes.

### Q: Can I use this for real-time updates?

**A:** The queue adds latency (~100-500ms). For real-time requirements, consider direct updates with optimistic locking.

### Q: How many queues do I need?

**A:** One. The single queue handles all processes using `MessageGroupId` for ordering.

### Q: What if a message fails?

**A:** SQS retries up to 3 times, then sends to DLQ. Review DLQ messages and fix underlying issues.

### Q: Can I mix queued and direct updates?

**A:** Not recommended. Mixing can still cause race conditions. Choose one approach per process.

## See Also

- [PROCESS_MANAGEMENT_QUEUE_SPEC.md](./PROCESS_MANAGEMENT_QUEUE_SPEC.md) - Technical specification
- [AWS SQS FIFO Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [Process Management Documentation](./PROCESS_MANAGEMENT.md)
