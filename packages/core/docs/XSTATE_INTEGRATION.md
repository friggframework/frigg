# Process State Machine vs XState Integration

## Key Differences

### Our Implementation (DB-First State Machine)

**Purpose**: Manage long-running, distributed processes with state persisted in database

**Characteristics**:
- ✅ **DB-backed**: State stored in MongoDB/PostgreSQL
- ✅ **Distributed**: Multiple workers update same process via queue
- ✅ **Asynchronous**: State transitions queued through SQS
- ✅ **Rehydration-native**: Load process from DB, state is already there
- ✅ **Audit trail**: Every state change persisted
- ✅ **Race condition safe**: FIFO queue ensures ordered updates
- ❌ **Simple transitions**: Just valid state → state mappings
- ❌ **No actions**: Can't trigger callbacks on transitions (yet)
- ❌ **No complex guards**: Basic validation only

**Use Case**:
```
Worker A (Lambda) ──→ Queue ──→ DB ──→ Worker B (Lambda)
   ↓                              ↓
Processes batch 1            Processes batch 2
State: RUNNING              State: RUNNING (from DB)
```

### XState (In-Memory State Machine)

**Purpose**: Manage complex UI/application state with rich transition logic

**Characteristics**:
- ✅ **Rich transitions**: Actions, guards, services, activities
- ✅ **Hierarchical states**: Nested states, parallel states
- ✅ **History states**: Can return to previous state
- ✅ **Visualizable**: Generate state diagrams automatically
- ✅ **Type-safe**: Full TypeScript support
- ❌ **In-memory first**: State lives in JavaScript runtime
- ❌ **Single-process**: Designed for one client/server instance
- ❌ **Serialization needed**: Must manually persist/rehydrate

**Use Case**:
```
React Component ──→ XState Machine (in-memory) ──→ Re-render
```

---

## The Problem XState Has with Backend

You're right - XState is hard for backend because:

1. **State doesn't persist** - Each Lambda invocation starts fresh
2. **Multiple workers** - Can't share in-memory state across processes
3. **No queue** - Race conditions if multiple workers update same entity
4. **Rehydration overhead** - Must serialize/deserialize on every operation

**Example problem:**
```javascript
// XState in Lambda (doesn't work well)
const machine = createMachine({ ... });

exports.handler = async (event) => {
    // State machine is fresh each invocation!
    const service = interpret(machine).start();

    // How do we restore previous state?
    // How do we share state with other Lambdas?
    // How do we prevent race conditions?
};
```

---

## How They Can Work Together (Layered Approach)

### Architecture: Our DB + Queue + XState Logic

```
┌─────────────────────────────────────────────────────┐
│         Application Layer (friggCommands)           │
│  commands.process.queueStateUpdate()                │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│         XState Layer (Optional)                     │
│  - Complex transition logic                         │
│  - Actions (send email, notify, etc.)              │
│  - Hierarchical states                              │
│  - Guards (complex conditions)                      │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│         Our State Machine (Persistence)             │
│  - Valid transitions (simple rules)                 │
│  - DB storage (process.state, process.context)      │
│  - Queue ordering (FIFO per process)                │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│         Infrastructure                              │
│  SQS Queue → Lambda → Database                      │
└─────────────────────────────────────────────────────┘
```

### Integration Pattern: XState as "Business Logic Layer"

Our state machine handles **persistence and distribution**, XState handles **complex transitions**.

**File: `process-state-machine-xstate.js`**

```javascript
const { createMachine, interpret } = require('xstate');
const { ProcessState } = require('./process-state-machine');

/**
 * XState machine definition for process lifecycle
 *
 * This is the "business logic" layer - complex transitions, actions, guards.
 * Our DB-backed state machine handles persistence and distribution.
 */
const processXStateMachine = createMachine({
    id: 'process',
    initial: ProcessState.INITIALIZING,

    states: {
        [ProcessState.INITIALIZING]: {
            on: {
                START: {
                    target: ProcessState.RUNNING,
                    actions: ['notifyUserStarted', 'logProcessStart'],
                    cond: 'hasRequiredData',
                },
                CANCEL: ProcessState.CANCELLED,
            },
        },

        [ProcessState.RUNNING]: {
            // Nested states for complex workflows
            initial: 'fetching',
            states: {
                fetching: {
                    on: {
                        FETCHED: 'processing',
                    },
                },
                processing: {
                    on: {
                        PROCESSED: 'saving',
                    },
                },
                saving: {
                    on: {
                        SAVED: {
                            target: '#process.COMPLETED',
                            actions: ['sendCompletionEmail'],
                        },
                    },
                },
            },

            on: {
                PAUSE: {
                    target: ProcessState.PAUSED,
                    actions: ['saveCheckpoint'],
                },
                ERROR: {
                    target: ProcessState.ERROR,
                    actions: ['logError', 'notifyAdmin'],
                },
                CANCEL: ProcessState.CANCELLED,
            },
        },

        [ProcessState.PAUSED]: {
            on: {
                RESUME: {
                    target: ProcessState.RUNNING,
                    actions: ['restoreCheckpoint'],
                },
                CANCEL: ProcessState.CANCELLED,
            },
        },

        [ProcessState.COMPLETED]: {
            type: 'final',
            entry: ['archiveProcess', 'sendSuccessNotification'],
        },

        [ProcessState.ERROR]: {
            type: 'final',
            entry: ['logErrorDetails', 'sendErrorNotification'],
        },

        [ProcessState.CANCELLED]: {
            type: 'final',
            entry: ['cleanupResources'],
        },
    },
}, {
    // Actions (side effects)
    actions: {
        notifyUserStarted: (context, event) => {
            console.log('Process started:', context.processId);
            // Could send email, webhook, etc.
        },
        logProcessStart: (context, event) => {
            // Log to analytics
        },
        sendCompletionEmail: (context, event) => {
            // Send email when process completes
        },
        saveCheckpoint: (context, event) => {
            // Save current position for resume
        },
        restoreCheckpoint: (context, event) => {
            // Load saved position
        },
    },

    // Guards (conditions)
    guards: {
        hasRequiredData: (context, event) => {
            return context.dataSourceId && context.userId;
        },
    },
});

/**
 * Adapter: XState → Our DB-backed State Machine
 *
 * This translates XState transitions into our persistent state updates
 */
class XStateProcessAdapter {
    constructor({ processId, commands }) {
        this.processId = processId;
        this.commands = commands;
        this.service = null;
    }

    /**
     * Initialize XState service from persisted state
     * @param {Object} process - Process from database
     */
    async hydrate(process) {
        // Restore XState from DB state
        const service = interpret(processXStateMachine, {
            // Restore context from process.context
            context: {
                processId: this.processId,
                ...process.context,
            },
        });

        // Start from persisted state
        service.start(process.state);

        // Listen for state changes → persist to DB
        service.onTransition(async (state) => {
            if (state.changed) {
                // Persist XState state to our DB
                await this.commands.process.queueStateUpdate(
                    this.processId,
                    state.value, // XState state
                    {
                        // Serialize XState context
                        xstateContext: state.context,
                        // Include nested state if hierarchical
                        xstateSubState: typeof state.value === 'object'
                            ? JSON.stringify(state.value)
                            : null,
                    }
                );
            }
        });

        this.service = service;
        return service;
    }

    /**
     * Send event to XState machine (triggers transitions)
     */
    async send(event) {
        if (!this.service) {
            throw new Error('Service not hydrated. Call hydrate() first.');
        }

        this.service.send(event);
        // State change automatically persisted via onTransition listener
    }

    /**
     * Get current state (from XState)
     */
    getState() {
        return this.service?.state;
    }
}

module.exports = {
    processXStateMachine,
    XStateProcessAdapter,
};
```

### Usage: XState + Our State Machine

```javascript
const { createFriggCommands, GetProcess } = require('@friggframework/core');
const { XStateProcessAdapter } = require('./process-state-machine-xstate');

const commands = createFriggCommands({ integrationClass: MyIntegration });
const getProcess = new GetProcess({ processRepository });

class MyWorker {
    async processWithXState(processId) {
        // 1. Load process from DB (our persistence layer)
        const process = await getProcess.execute(processId);

        // 2. Hydrate XState from DB state (business logic layer)
        const adapter = new XStateProcessAdapter({
            processId,
            commands,
        });
        await adapter.hydrate(process);

        // 3. Use XState for complex transitions
        await adapter.send('START');
        // → XState validates transition
        // → XState runs actions (notifyUserStarted, logProcessStart)
        // → XState transitions to RUNNING
        // → Adapter persists to DB via our queue

        // 4. Process data
        for (const batch of batches) {
            await adapter.send('FETCHED');  // RUNNING.fetching → RUNNING.processing
            await this.processBatch(batch);
            await adapter.send('PROCESSED'); // RUNNING.processing → RUNNING.saving
            await this.saveBatch(batch);
            await adapter.send('SAVED');     // RUNNING.saving → COMPLETED
        }

        // XState automatically:
        // - Runs sendCompletionEmail action
        // - Transitions to COMPLETED (final state)
        // - Persists to DB
    }
}
```

---

## When to Use Each

### Use Our Simple State Machine (Current Implementation)

✅ **Simple linear workflows**
```
INITIALIZING → RUNNING → COMPLETED
```

✅ **Distributed processing with queue ordering**
```
Multiple workers → FIFO queue → Consistent state
```

✅ **Basic validation**
```
Can only pause from RUNNING state
Cannot transition from terminal states
```

**Example**: Batch sync process with progress tracking

---

### Add XState Layer When You Need

✅ **Complex transition logic**
```javascript
on: {
    SUBMIT: {
        target: 'processing',
        cond: (ctx) => ctx.retries < 3 && ctx.hasValidToken,
        actions: ['incrementRetries', 'logAttempt'],
    },
}
```

✅ **Hierarchical states (sub-states)**
```
RUNNING
  ├── fetching
  ├── processing
  └── saving
```

✅ **Actions on transitions**
```javascript
entry: ['sendEmail', 'logToAnalytics', 'updateDashboard'],
exit: ['cleanup', 'saveCheckpoint'],
```

✅ **History states**
```javascript
// Return to previous sub-state when resuming
hist: {
    type: 'history',
}
```

**Example**: Multi-step approval workflow with notifications, retries, and rollback

---

## Layering Decision Tree

```
Do you need complex state logic?
├─ NO → Use our simple state machine
│       ✓ Fast
│       ✓ Simple
│       ✓ DB-backed
│       ✓ Queue-ordered
│
└─ YES → Add XState layer
        ├─ Hierarchical states? → XState
        ├─ Actions on transitions? → XState
        ├─ Complex guards? → XState
        └─ Visual state diagrams? → XState

        Still get:
        ✓ DB persistence (our layer)
        ✓ Queue ordering (our layer)
        ✓ Distributed workers (our layer)
```

---

## Implementation Strategy

### Phase 1: Current (Simple State Machine) ✅

```javascript
// Already implemented
await commands.process.queueStateUpdate(processId, 'RUNNING');
```

**Good for**: 90% of use cases

### Phase 2: XState Integration (Future)

```javascript
// Optional enhancement
const adapter = new XStateProcessAdapter({ processId, commands });
await adapter.hydrate(process);
await adapter.send('START');
```

**Add when needed**: Complex workflows requiring actions/guards/hierarchical states

### Phase 3: Hybrid Approach (Best of Both)

```javascript
// Simple processes: Use direct commands
if (workflow.isSimple) {
    await commands.process.queueStateUpdate(processId, 'RUNNING');
}

// Complex processes: Use XState
if (workflow.isComplex) {
    const adapter = new XStateProcessAdapter({ processId, commands });
    await adapter.send('START');
}
```

---

## Summary

| Aspect | Our State Machine | XState | Layered (Both) |
|--------|------------------|--------|----------------|
| **Persistence** | ✅ DB-backed | ❌ In-memory | ✅ DB-backed |
| **Distribution** | ✅ Multi-worker | ❌ Single-process | ✅ Multi-worker |
| **Queue Ordering** | ✅ FIFO | ❌ None | ✅ FIFO |
| **Rehydration** | ✅ Native | ❌ Manual | ✅ Native |
| **Complex Logic** | ❌ Simple | ✅ Rich | ✅ Rich |
| **Actions** | ❌ None | ✅ Full | ✅ Full |
| **Guards** | ⚠️ Basic | ✅ Complex | ✅ Complex |
| **Hierarchical** | ❌ Flat | ✅ Nested | ✅ Nested |
| **Visualize** | ❌ No | ✅ Yes | ✅ Yes |

**Best of both worlds**: Use our state machine for persistence/distribution, optionally add XState for complex transition logic.

---

## Recommendation

1. **Start simple** - Use our current state machine for most processes
2. **Add XState when needed** - Complex workflows, actions, hierarchical states
3. **Keep both layers** - Our layer handles persistence, XState handles logic
4. **Adapter pattern** - XStateProcessAdapter bridges the two worlds

The beauty is: **They're complementary, not competitive!**
- Our layer: "Where state is stored and how it's synchronized"
- XState layer: "What transitions are valid and what happens during transitions"
