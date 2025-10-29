# Process State Machine

## Overview

The Process State Machine provides a structured approach to managing process lifecycle states and transitions. It ensures that processes move through valid states in a controlled manner, preventing invalid state changes and race conditions.

## State Machine Concepts

### States

A **state** represents the current status of a process at a point in time.

```javascript
const { ProcessState } = require('@friggframework/core');

ProcessState.INITIALIZING  // Process is being set up
ProcessState.RUNNING       // Process is actively executing
ProcessState.PAUSED        // Process is temporarily paused
ProcessState.COMPLETED     // Process finished successfully (terminal)
ProcessState.ERROR         // Process failed with an error (terminal)
ProcessState.CANCELLED     // Process was cancelled (terminal)
```

### Transitions

A **transition** is a change from one state to another. Not all transitions are valid.

```javascript
const { isValidTransition } = require('@friggframework/core');

// Valid transitions
isValidTransition('RUNNING', 'COMPLETED')  // true
isValidTransition('RUNNING', 'PAUSED')     // true
isValidTransition('PAUSED', 'RUNNING')     // true

// Invalid transitions
isValidTransition('COMPLETED', 'RUNNING')  // false (terminal state)
isValidTransition('INITIALIZING', 'PAUSED') // false (must go through RUNNING)
```

### Terminal States

**Terminal states** are final states with no further transitions allowed:

- `COMPLETED` - Process finished successfully
- `ERROR` - Process failed
- `CANCELLED` - Process was cancelled

Once a process reaches a terminal state, it cannot transition to any other state.

### Guards

**Guards** are conditions that must be met before allowing a transition:

```javascript
const { validateTransition } = require('@friggframework/core');

const process = { state: 'RUNNING' };

// Validate before transitioning
const result = validateTransition(process, 'COMPLETED');

if (result.valid) {
    // Proceed with transition
    await commands.process.queueStateUpdate(processId, 'COMPLETED');
} else {
    console.error(result.error);
}
```

## State Diagram

```
┌─────────────┐
│INITIALIZING │
└──────┬──────┘
       │
       ├──→ RUNNING ──→ PAUSED ──┐
       │       │                 │
       │       │←────────────────┘
       │       │
       │       ├──→ COMPLETED (terminal)
       │       ├──→ ERROR (terminal)
       │       └──→ CANCELLED (terminal)
       │
       ├──→ ERROR (terminal)
       └──→ CANCELLED (terminal)
```

## Valid State Transitions

| From State    | Valid Next States                                    | Notes |
|---------------|-----------------------------------------------------|-------|
| INITIALIZING  | RUNNING, ERROR, CANCELLED                           | Must start RUNNING or fail |
| RUNNING       | RUNNING, PAUSED, COMPLETED, ERROR, CANCELLED        | Self-transition for progress updates |
| PAUSED        | RUNNING, COMPLETED, ERROR, CANCELLED                | Can resume or terminate |
| COMPLETED     | *(none)*                                           | Terminal state |
| ERROR         | *(none)*                                           | Terminal state |
| CANCELLED     | *(none)*                                           | Terminal state |

## Usage with friggCommands

### Recommended Pattern

```javascript
const { createFriggCommands, ProcessState } = require('@friggframework/core');

const commands = createFriggCommands({ integrationClass: MyIntegration });

class MyWorker {
    async processRecords(processId, records) {
        try {
            // Start processing
            await commands.process.queueStateUpdate(
                processId,
                ProcessState.RUNNING,
                { startTime: new Date().toISOString() }
            );

            for (const record of records) {
                await this.processRecord(record);

                // Update progress (self-transition on RUNNING)
                await commands.process.queueMetricsUpdate(processId, {
                    totalProcessed: 1,
                    lastProcessedId: record.id,
                });
            }

            // Complete successfully
            await commands.process.queueCompletion(processId);

        } catch (error) {
            // Transition to ERROR state
            await commands.process.queueError(processId, error);
            throw error;
        }
    }

    async pauseProcessing(processId) {
        // Transition RUNNING -> PAUSED
        await commands.process.queueStateUpdate(
            processId,
            ProcessState.PAUSED,
            { pausedAt: new Date().toISOString() }
        );
    }

    async resumeProcessing(processId) {
        // Transition PAUSED -> RUNNING
        await commands.process.queueStateUpdate(
            processId,
            ProcessState.RUNNING,
            { resumedAt: new Date().toISOString() }
        );
    }

    async cancelProcessing(processId) {
        // Transition to CANCELLED (terminal)
        await commands.process.queueStateUpdate(
            processId,
            ProcessState.CANCELLED,
            { cancelledAt: new Date().toISOString() }
        );
    }
}
```

## Common Patterns

### Pattern 1: Simple Linear Flow

Most processes follow a simple path:

```
INITIALIZING → RUNNING → COMPLETED
```

```javascript
// Create process
const process = await createProcess.execute({
    userId,
    integrationId,
    name: 'data-sync',
    type: 'SYNC',
});
// Default state: INITIALIZING

// Start processing
await commands.process.queueStateUpdate(process.id, ProcessState.RUNNING);

// ... do work ...

// Complete
await commands.process.queueCompletion(process.id);
```

### Pattern 2: Pause/Resume Flow

For long-running processes that can be paused:

```
RUNNING → PAUSED → RUNNING → COMPLETED
```

```javascript
// Start processing
await commands.process.queueStateUpdate(processId, ProcessState.RUNNING);

// User pauses
await commands.process.queueStateUpdate(processId, ProcessState.PAUSED, {
    pauseReason: 'User requested pause',
});

// Later, user resumes
await commands.process.queueStateUpdate(processId, ProcessState.RUNNING, {
    resumedAt: new Date().toISOString(),
});

// Complete
await commands.process.queueCompletion(processId);
```

### Pattern 3: Error Handling

Processes can fail at any point:

```
RUNNING → ERROR (terminal)
```

```javascript
try {
    await commands.process.queueStateUpdate(processId, ProcessState.RUNNING);

    // Process data
    await this.processData();

    await commands.process.queueCompletion(processId);

} catch (error) {
    // Transition to ERROR state (terminal)
    await commands.process.queueError(processId, error);
    throw error; // Re-throw to fail worker
}
```

### Pattern 4: Batch Processing with Progress Updates

Self-transitions on RUNNING state to track progress:

```
RUNNING → RUNNING → RUNNING → COMPLETED
  (10%)     (50%)     (100%)
```

```javascript
await commands.process.queueStateUpdate(processId, ProcessState.RUNNING);

for (let i = 0; i < batches.length; i++) {
    await this.processBatch(batches[i]);

    // Self-transition on RUNNING to update context
    await commands.process.queueStateUpdate(
        processId,
        ProcessState.RUNNING,
        {
            currentBatch: i + 1,
            totalBatches: batches.length,
            percentComplete: ((i + 1) / batches.length) * 100,
        }
    );

    // Update metrics
    await commands.process.queueMetricsUpdate(processId, {
        totalProcessed: batches[i].length,
    });
}

await commands.process.queueCompletion(processId);
```

## Integration with Queue

The process management queue ensures state transitions are **ordered** and **consistent**:

```javascript
// Multiple workers concurrently updating same process
Worker A: commands.process.queueMetricsUpdate(processId, { count: 50 })
Worker B: commands.process.queueMetricsUpdate(processId, { count: 30 })
Worker C: commands.process.queueCompletion(processId)

// Queue ensures ordered processing:
// 1. Worker A's update (count: 50)
// 2. Worker B's update (count: 80 total)
// 3. Worker C's completion
// No race conditions!
```

### Why Queue + State Machine?

| Without Queue | With Queue + State Machine |
|---------------|---------------------------|
| Race conditions | Ordered processing |
| Lost updates | All updates preserved |
| Inconsistent state | Valid transitions only |
| Hard to debug | Clear audit trail |

## Validation

### Validating Before Transition

```javascript
const { validateTransition } = require('@friggframework/core');

const process = await getProcess.execute(processId);

// Check if transition is allowed
const result = validateTransition(process, 'PAUSED');

if (!result.valid) {
    throw new Error(`Cannot pause: ${result.error}`);
}

// Proceed with transition
await commands.process.queueStateUpdate(processId, ProcessState.PAUSED);
```

### Getting Valid Next States

```javascript
const { getValidNextStates } = require('@friggframework/core');

const process = await getProcess.execute(processId);
const validStates = getValidNextStates(process.state);

console.log(`Valid next states: ${validStates.join(', ')}`);
// Output: "Valid next states: PAUSED, COMPLETED, ERROR, CANCELLED, RUNNING"
```

## Future Enhancements

The current state machine implementation is intentionally simple. Future enhancements could include:

### 1. XState Integration

For complex workflows, integrate with [XState](https://xstate.js.org/):

```javascript
import { createMachine } from 'xstate';

const processMachine = createMachine({
    id: 'process',
    initial: 'initializing',
    states: {
        initializing: { on: { START: 'running' } },
        running: {
            on: {
                PAUSE: 'paused',
                COMPLETE: 'completed',
                ERROR: 'error',
            },
        },
        paused: { on: { RESUME: 'running' } },
        completed: { type: 'final' },
        error: { type: 'final' },
    },
});
```

### 2. Actions on Transitions

Execute callbacks when transitioning:

```javascript
const transitions = {
    onEnterRunning: async (process) => {
        await notifyUser(process.userId, 'Process started');
    },
    onEnterCompleted: async (process) => {
        await sendCompletionEmail(process);
    },
};
```

### 3. Conditional Transitions

Add complex business logic guards:

```javascript
const guards = {
    canComplete: (process) => {
        return process.results.totalProcessed >= process.context.expectedTotal;
    },
};
```

### 4. State History

Track all state transitions for audit trail:

```javascript
process.stateHistory = [
    { state: 'INITIALIZING', timestamp: '2024-01-01T10:00:00Z' },
    { state: 'RUNNING', timestamp: '2024-01-01T10:01:00Z' },
    { state: 'PAUSED', timestamp: '2024-01-01T10:05:00Z' },
    { state: 'RUNNING', timestamp: '2024-01-01T10:10:00Z' },
    { state: 'COMPLETED', timestamp: '2024-01-01T10:15:00Z' },
];
```

## Best Practices

1. **Always validate transitions** before queuing state updates
2. **Use terminal states** to prevent accidental updates to completed processes
3. **Self-transition on RUNNING** to update progress without changing state
4. **Include context** in state updates for debugging and audit trails
5. **Handle errors gracefully** with proper error state transitions
6. **Check queue is enabled** before using process commands (gracefully degrade)

## See Also

- [Process Management Queue Usage](./PROCESS_MANAGEMENT_QUEUE_USAGE.md)
- [Process Management Queue Spec](./PROCESS_MANAGEMENT_QUEUE_SPEC.md)
- [friggCommands README](../application/commands/README.md)
