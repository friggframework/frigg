# CLAUDE.md - Frigg Core Runtime System

This file provides guidance to Claude Code when working with the Frigg Framework's core runtime system in `packages/core/core/`.

## Critical Context (Read First)

- **Package Purpose**: Core runtime system and foundational classes for Frigg Lambda execution
- **Main Components**: Handler factory, Worker base class, Delegate pattern, Module loading
- **Core Architecture**: Lambda-optimized runtime with connection pooling, error handling, secrets management
- **Key Integration**: AWS Lambda, SQS job processing, MongoDB connections, AWS Secrets Manager
- **Security Model**: Automatic secrets injection, database connection management, user-facing error sanitization
- **DO NOT**: Expose internal errors to users, bypass connection pooling, skip database initialization

## Core Components Architecture

### Handler Creation System (`create-handler.js:9-67`)

**Purpose**: Factory for creating Lambda handlers with consistent infrastructure setup

**Key Features**:
- **Database Connection Management**: Automatic MongoDB connection with pooling
- **Secrets Management**: AWS Secrets Manager integration via `SECRET_ARN` env var
- **Error Sanitization**: Prevents internal details from leaking to end users
- **Debug Logging**: Request/response logging with structured debug info
- **Connection Optimization**: `context.callbackWaitsForEmptyEventLoop = false` for reuse

**Handler Configuration Options**:
```javascript
const handler = createHandler({
    eventName: 'MyIntegration',           // For logging/debugging
    isUserFacingResponse: true,           // true = sanitize errors, false = pass through
    method: async (event, context) => {}, // Your Lambda function logic
    shouldUseDatabase: true               // false = skip MongoDB connection
});
```

**Error Handling Patterns**:
- **User-Facing**: Returns 500 with generic "Internal Error Occurred" message
- **Server-to-Server**: Re-throws errors for AWS to handle
- **Halt Errors**: `error.isHaltError = true` logs but returns success (no retry)

### Worker Base Class (`Worker.js:9-83`)

**Purpose**: Base class for SQS job processing with standardized patterns

**Core Responsibilities**:
- **Queue Management**: Get SQS queue URLs and send messages
- **Batch Processing**: Process multiple SQS records in sequence
- **Message Validation**: Extensible parameter validation system
- **Error Handling**: Structured error handling for async job processing

**Usage Pattern**:
```javascript
class MyWorker extends Worker {
    async _run(params, context = {}) {
        // Your job processing logic here
        // params are already JSON.parsed from SQS message body
    }
    
    _validateParams(params) {
        // Validate required parameters
        this._verifyParamExists(params, 'requiredField');
    }
}

// In your Lambda handler
const worker = new MyWorker();
await worker.run(event, context); // Process SQS Records
```

**Message Sending**:
```javascript
await worker.send({
    QueueUrl: 'https://sqs.region.amazonaws.com/account/queue',
    jobType: 'processAttachment',
    integrationId: 'abc123',
    // ... other job parameters
}, delaySeconds);
```

### Delegate Pattern System (`Delegate.js:3-27`)

**Purpose**: Observer/delegation pattern for decoupled component communication

**Core Concepts**:
- **Notification System**: Components notify delegates of events/state changes
- **Type Safety**: `delegateTypes` array defines valid notification strings
- **Bidirectional**: Supports both sending and receiving notifications
- **Null Safety**: Gracefully handles missing delegates

**Implementation Pattern**:
```javascript
class MyIntegration extends Delegate {
    constructor(params) {
        super(params);
        this.delegateTypes = ['processComplete', 'errorOccurred', 'statusUpdate'];
    }
    
    async processData(data) {
        // Do work
        await this.notify('statusUpdate', { progress: 50 });
        // More work
        await this.notify('processComplete', { result: data });
    }
    
    async receiveNotification(notifier, delegateString, object) {
        // Handle notifications from other components
        switch(delegateString) {
            case 'dataReady':
                await this.processData(object);
                break;
        }
    }
}
```

### Module Loading System (`load-installed-modules.js:1-1085`)

**Purpose**: Dynamic loading and registration of integration modules

**Key Features**:
- **Package Discovery**: Automatically find `@friggframework/api-module-*` packages
- **Module Registration**: Load and register integration classes
- **Configuration Management**: Handle module-specific configuration
- **Dependency Resolution**: Manage inter-module dependencies

## Runtime Lifecycle & Patterns

### Lambda Handler Lifecycle
1. **Pre-Execution Setup**:
   ```javascript
   initDebugLog(eventName, event);           // Debug logging setup
   await secretsToEnv();                     // Secrets Manager injection
   context.callbackWaitsForEmptyEventLoop = false; // Connection pooling
   ```

2. **Database Connection**:
   ```javascript
   if (shouldUseDatabase) {
       await connectToDatabase();            // MongoDB connection with pooling
   }
   ```

3. **Method Execution**:
   ```javascript
   return await method(event, context);     // Your integration logic
   ```

4. **Error Handling & Cleanup**:
   ```javascript
   flushDebugLog(error);                    // Debug info flush on error
   // Sanitized error response for user-facing endpoints
   ```

### SQS Job Processing Lifecycle
1. **Batch Processing**: Process all records in `event.Records` sequentially
2. **Message Parsing**: JSON.parse message body for parameters  
3. **Validation**: Run custom validation on parsed parameters
4. **Execution**: Call `_run()` method with validated parameters
5. **Error Propagation**: Let AWS handle retries/DLQ for failed jobs

### Secrets Management Integration
- **Automatic Injection**: If `SECRET_ARN` environment variable is set
- **Environment Variables**: Secrets automatically set as `process.env` variables
- **Security**: No secrets logging or exposure in error messages
- **Caching**: Secrets cached for Lambda container lifetime

## Database Connection Patterns

### Connection Pooling Strategy
```javascript
// Mongoose connection reuse across Lambda invocations
context.callbackWaitsForEmptyEventLoop = false;
await connectToDatabase(); // Reuses existing connection if available
```

### Database Usage Patterns
```javascript
// Conditional database connection
const handler = createHandler({
    shouldUseDatabase: false,  // Skip for database-free operations
    method: async (event) => {
        // No DB operations needed
        return { statusCode: 200, body: 'OK' };
    }
});
```

## Error Handling Architecture

### Error Classification
1. **User-Facing Errors**: `isUserFacingResponse: true`
   - Returns generic 500 error message
   - Prevents information disclosure
   - Logs full error details internally

2. **Server-to-Server Errors**: `isUserFacingResponse: false`
   - Re-throws original error for AWS handling
   - Used for SQS, SNS, and internal API calls
   - Enables proper retry mechanisms

3. **Halt Errors**: `error.isHaltError = true`
   - Logs error but returns success
   - Prevents infinite retries for known issues
   - Used for graceful degradation scenarios

### Debug Logging Strategy
```javascript
initDebugLog(eventName, event);  // Start logging context
// ... your code ...
flushDebugLog(error);           // Flush on error (includes full context)
```

## Integration Development Patterns

### Extending Worker for Job Processing
```javascript
class AttachmentWorker extends Worker {
    _validateParams(params) {
        this._verifyParamExists(params, 'integrationId');
        this._verifyParamExists(params, 'attachmentUrl');
        this._verifyParamExists(params, 'destination');
    }
    
    async _run(params, context) {
        const { integrationId, attachmentUrl, destination } = params;
        // Process attachment upload/download
        // Handle errors gracefully
        // Update job status
    }
}
```

### Creating Custom Handlers
```javascript
const myIntegrationHandler = createHandler({
    eventName: 'MyIntegration',
    isUserFacingResponse: true,    // Sanitize errors for users
    shouldUseDatabase: true,       // Need database access
    method: async (event, context) => {
        // Your integration logic here
        // Database is already connected
        // Secrets are in process.env
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };
    }
});
```

### Delegate Pattern for Integration Communication
```javascript
class IntegrationManager extends Delegate {
    constructor() {
        super();
        this.delegateTypes = [
            'authenticationComplete',
            'syncStarted', 
            'syncComplete',
            'errorOccurred'
        ];
    }
    
    async startSync(integrationId) {
        await this.notify('syncStarted', { integrationId });
        // ... sync logic ...
        await this.notify('syncComplete', { integrationId, recordCount: 100 });
    }
}
```

## Performance Optimization Patterns

### Connection Reuse
```javascript
// ALWAYS set this in handlers for performance
context.callbackWaitsForEmptyEventLoop = false;
```

### Conditional Database Usage
```javascript
// Skip database for lightweight operations
const handler = createHandler({
    shouldUseDatabase: false,  // Faster cold starts
    method: healthCheckMethod
});
```

### SQS Batch Processing Optimization
```javascript
// Process records sequentially (not parallel) for resource control
for (const record of records) {
    await this._run(JSON.parse(record.body), context);
}
```

## Repository & Use Case Architecture

The Frigg Framework follows DDD/Hexagonal Architecture with clear separation between handlers, use cases, and repositories.

### Repository Pattern in Core

**Purpose**: Abstract database and external system access into dedicated repository classes.

**Structure**:
```javascript
// Example: packages/core/database/websocket-connection-repository.js
class WebsocketConnectionRepository {
    /**
     * Create a new WebSocket connection record
     * Pure database operation - no business logic
     */
    async createConnection(connectionId) {
        return await WebsocketConnection.create({ connectionId });
    }

    /**
     * Delete a WebSocket connection record
     * Returns raw deletion result
     */
    async deleteConnection(connectionId) {
        return await WebsocketConnection.deleteOne({ connectionId });
    }

    /**
     * Get all active connections
     * Returns raw data from database
     */
    async getActiveConnections() {
        return await WebsocketConnection.getActiveConnections();
    }
}
```

**Repository Responsibilities**:
- ✅ **CRUD operations** - Create, Read, Update, Delete database records
- ✅ **Query execution** - Run database queries and return results
- ✅ **Data access only** - No interpretation or decision-making
- ✅ **Atomic operations** - Each method performs one database operation
- ❌ **NO business logic** - Don't decide what data means or what to do with it
- ❌ **NO orchestration** - Don't coordinate multiple operations

**Real Repository Examples**:
- `WebsocketConnectionRepository` - WebSocket persistence (packages/core/database/websocket-connection-repository.js)
- `SyncRepository` - Sync object management (packages/core/syncs/sync-repository.js)
- `IntegrationMappingRepository` - Integration mappings (packages/core/integrations/integration-mapping-repository.js)
- `TokenRepository` - Token operations (packages/core/database/token-repository.js)
- `HealthCheckRepository` - Health check data access (packages/core/database/health-check-repository.js)

### Use Case Pattern in Core

**Purpose**: Contain business logic, orchestration, and workflow coordination.

**Structure**:
```javascript
// Example: packages/core/database/use-cases/check-database-health-use-case.js
class CheckDatabaseHealthUseCase {
    constructor({ healthCheckRepository }) {
        // Dependency injection - receive repository via constructor
        this.repository = healthCheckRepository;
    }

    async execute() {
        // 1. Get raw data from repository
        const { stateName, isConnected } = this.repository.getDatabaseConnectionState();

        // 2. Apply business logic - determine health status
        const result = {
            status: isConnected ? 'healthy' : 'unhealthy',
            state: stateName,
        };

        // 3. Orchestration - conditionally perform additional checks
        if (isConnected) {
            result.responseTime = await this.repository.pingDatabase(2000);
        }

        return result;
    }
}
```

**Use Case Responsibilities**:
- ✅ **Business logic** - Make decisions based on data
- ✅ **Orchestration** - Coordinate multiple repository calls
- ✅ **Validation** - Enforce business rules
- ✅ **Workflow** - Determine what happens next
- ✅ **Error handling** - Handle domain-specific errors
- ❌ **NO direct database access** - Always use repositories
- ❌ **NO HTTP concerns** - Don't know about status codes or headers

**Real Use Case Examples**:
- `CheckDatabaseHealthUseCase` - Database health business logic (packages/core/database/use-cases/check-database-health-use-case.js)
- `TestEncryptionUseCase` - Encryption testing workflow (packages/core/database/use-cases/test-encryption-use-case.js)

### Handler Pattern in Core

**Purpose**: Translate Lambda/HTTP/SQS events into use case calls.

**Handler Should ONLY**:
- Define routes and event handlers
- Call use cases (NOT repositories)
- Map use case results to HTTP/Lambda responses
- Handle protocol-specific concerns (status codes, headers)

**❌ WRONG - Handler contains business logic**:
```javascript
// BAD: Business logic in handler
router.get('/health', async (req, res) => {
    const state = mongoose.connection.readyState;
    const isHealthy = state === 1;  // ❌ Business logic in handler

    if (isHealthy) {  // ❌ Orchestration in handler
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping();  // ❌ Direct DB access
        const responseTime = Date.now() - pingStart;
        res.json({ status: 'healthy', responseTime });
    }
});
```

**✅ CORRECT - Handler delegates to use case**:
```javascript
// GOOD: Handler calls use case
const healthCheckRepository = new HealthCheckRepository();
const checkDatabaseHealthUseCase = new CheckDatabaseHealthUseCase({
    healthCheckRepository
});

router.get('/health', async (req, res) => {
    // Call use case - all business logic is there
    const health = await checkDatabaseHealthUseCase.execute();

    // Handler only maps to HTTP response
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});
```

### Dependency Direction

**The Golden Rule**:
> "Handlers ONLY call Use Cases, NEVER Repositories or Business Logic directly"

**Correct Flow**:
```
Handler/Router (createHandler)
    ↓ calls
Use Case (execute)
    ↓ calls
Repository (CRUD methods)
    ↓ accesses
Database/External System
```

**Why This Matters**:
- **Testability**: Use cases can be tested with mocked repositories
- **Reusability**: Use cases can be called from handlers, CLI, background jobs
- **Maintainability**: Business logic is centralized, not scattered across handlers
- **Flexibility**: Swap repository implementations without changing use cases

### Migration from Old Patterns

**Old Pattern (Mongoose models everywhere)**:
```javascript
// BAD: Direct model access in handlers
const handler = createHandler({
    method: async (event) => {
        const user = await User.findById(event.userId);  // ❌ Direct model access
        if (!user.isActive) {  // ❌ Business logic in handler
            throw new Error('User not active');
        }
        await Sync.create({ userId: user.id });  // ❌ Direct model access
    }
});
```

**New Pattern (Repository + Use Case)**:
```javascript
// GOOD: Repository abstracts data access
class UserRepository {
    async findById(userId) {
        return await User.findById(userId);
    }
}

class SyncRepository {
    async createSync(data) {
        return await Sync.create(data);
    }
}

// GOOD: Use case contains business logic
class ActivateUserSyncUseCase {
    constructor({ userRepository, syncRepository }) {
        this.userRepo = userRepository;
        this.syncRepo = syncRepository;
    }

    async execute(userId) {
        const user = await this.userRepo.findById(userId);

        if (!user.isActive) {  // ✅ Business logic in use case
            throw new Error('User not active');
        }

        return await this.syncRepo.createSync({ userId: user.id });
    }
}

// GOOD: Handler delegates to use case
const handler = createHandler({
    method: async (event) => {
        const useCase = new ActivateUserSyncUseCase({
            userRepository: new UserRepository(),
            syncRepository: new SyncRepository()
        });
        return await useCase.execute(event.userId);
    }
});
```

### Integration with Worker Pattern

**Workers should also follow this pattern**:

```javascript
class ProcessAttachmentWorker extends Worker {
    constructor() {
        super();
        // Inject repositories into use case
        this.useCase = new ProcessAttachmentUseCase({
            asanaRepository: new AsanaRepository(),
            frontifyRepository: new FrontifyRepository()
        });
    }

    _validateParams(params) {
        this._verifyParamExists(params, 'attachmentId');
    }

    async _run(params, context) {
        // Worker delegates to use case
        return await this.useCase.execute(params.attachmentId);
    }
}
```

### When to Extract to Repository/Use Case

**Extract to Repository when you see**:
- Direct Mongoose model calls (`User.findById()`, `Sync.create()`)
- Database queries in handlers or business logic
- External API calls scattered across codebase
- File system or AWS SDK operations in handlers

**Extract to Use Case when you see**:
- Business logic in handlers (if/else based on data)
- Orchestration of multiple operations
- Validation and error handling logic
- Workflow coordination

### Testing with Repository/Use Case Pattern

**Repository Tests** (Integration tests with real DB):
```javascript
describe('WebsocketConnectionRepository', () => {
    it('creates connection record', async () => {
        const repo = new WebsocketConnectionRepository();
        const result = await repo.createConnection('conn-123');
        expect(result.connectionId).toBe('conn-123');
    });
});
```

**Use Case Tests** (Unit tests with mocked repositories):
```javascript
describe('CheckDatabaseHealthUseCase', () => {
    it('returns unhealthy when disconnected', async () => {
        const mockRepo = {
            getDatabaseConnectionState: () => ({
                stateName: 'disconnected',
                isConnected: false
            })
        };
        const useCase = new CheckDatabaseHealthUseCase({
            healthCheckRepository: mockRepo
        });
        const result = await useCase.execute();
        expect(result.status).toBe('unhealthy');
    });
});
```

**Handler Tests** (HTTP/Lambda response tests):
```javascript
describe('Health Handler', () => {
    it('returns 503 when unhealthy', async () => {
        // Mock use case
        const mockUseCase = {
            execute: async () => ({ status: 'unhealthy' })
        };
        // Test HTTP response
        const response = await handler(mockEvent, mockContext);
        expect(response.statusCode).toBe(503);
    });
});
```

## Anti-Patterns to Avoid

### Core Runtime Anti-Patterns
❌ **Don't expose internal errors** to user-facing endpoints - use `isUserFacingResponse: true`
❌ **Don't skip connection optimization** - always set `callbackWaitsForEmptyEventLoop = false`
❌ **Don't parallel process SQS records** - sequential processing prevents resource exhaustion
❌ **Don't hardcode queue URLs** - use the Worker's `getQueueURL()` method
❌ **Don't bypass parameter validation** - always implement `_validateParams()` in Workers
❌ **Don't leak secrets in logs** - the system handles this, don't override
❌ **Don't ignore delegate types** - define valid `delegateTypes` array for type safety

### DDD/Hexagonal Architecture Anti-Patterns
❌ **Don't access models directly in handlers** - create repositories to abstract data access
❌ **Don't put business logic in handlers** - extract to use cases
❌ **Don't call repositories from handlers** - always go through use cases
❌ **Don't put orchestration in repositories** - repositories should be atomic CRUD operations
❌ **Don't skip dependency injection** - inject repositories into use cases via constructor
❌ **Don't create "god" use cases** - keep use cases focused on single business operations
❌ **Don't mix database queries with business logic** - separate into repository + use case

## Testing Patterns

### Handler Testing
```javascript
const { createHandler } = require('@friggframework/core/core');

const testHandler = createHandler({
    isUserFacingResponse: false, // Get full errors in tests
    shouldUseDatabase: false,    // Mock/skip DB in tests
    method: yourTestMethod
});

// Test with mock event/context
const result = await testHandler(mockEvent, mockContext);
```

### Worker Testing
```javascript
class TestWorker extends Worker {
    _validateParams(params) {
        this._verifyParamExists(params, 'testField');
    }
    
    async _run(params, context) {
        // Your test logic
        return { processed: true };
    }
}

// Test SQS record processing
const worker = new TestWorker();
await worker.run({
    Records: [{
        body: JSON.stringify({ testField: 'value' })
    }]
});
```

## Environment Variables

### Required Variables
- `AWS_REGION`: AWS region for SQS operations
- `SECRET_ARN`: (Optional) AWS Secrets Manager secret ARN for automatic injection

### Database Variables
- MongoDB connection variables (handled by `../database/mongo`)
- See database module documentation for complete list

### Queue Variables
- Queue URLs typically passed as parameters, not environment variables
- Use Worker's `getQueueURL()` method for dynamic queue discovery

## Security Considerations

- **Secrets**: Never log or expose secrets in error messages
- **Error Messages**: Always sanitize errors for user-facing responses  
- **Database**: Connection pooling reuses connections securely
- **SQS**: Message validation prevents injection attacks
- **Logging**: Debug logs include sensitive data - handle carefully in production