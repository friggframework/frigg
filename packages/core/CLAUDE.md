# CLAUDE.md - Frigg Framework Core Package

This file provides guidance to Claude Code when working with the Frigg Framework's core package (`@friggframework/core`).

## Critical Context (Read First)

-   **Package Purpose**: Core framework functionality for building enterprise serverless integrations
-   **Main Architecture**: Hexagonal/DDD architecture with clear separation of adapters, use cases, and repositories
-   **Key Technologies**: Node.js, Express, AWS Lambda, MongoDB/PostgreSQL (Prisma), AWS KMS encryption
-   **Core Value**: Provides building blocks for integration developers - they extend IntegrationBase and use framework services
-   **Security Model**: Field-level encryption, OAuth2 flows, signature validation, VPC deployment
-   **DO NOT**: Bypass architectural layers, skip encryption for sensitive data, expose internal errors to users

## Table of Contents

1. [Package Overview](#package-overview)
2. [Architecture Principles](#architecture-principles)
3. [Essential Commands](#essential-commands)
4. [Directory Structure](#directory-structure)
5. [Core Components](#core-components)
6. [Development Workflow](#development-workflow)
7. [Testing Strategy](#testing-strategy)
8. [Anti-Patterns](#anti-patterns)

## Package Overview

`@friggframework/core` is the foundational package of the Frigg Framework, providing:

-   **IntegrationBase**: Base class all integrations extend
-   **Database Layer**: Multi-database support (MongoDB, DocumentDB, PostgreSQL) with Prisma ORM
-   **Encryption**: Transparent field-level encryption with AWS KMS or AES
-   **User Management**: Individual and organizational user support
-   **Module System**: API module loading and credential management
-   **Lambda Runtime**: Handler factory, worker base class, timeout management
-   **Error Handling**: Standardized error types with proper HTTP status codes
-   **Event System**: Integration lifecycle events and user actions

## Architecture Principles

### Hexagonal Architecture (Ports and Adapters)

The core package strictly follows hexagonal architecture:

```
┌─────────────────────────────────────────────────────────┐
│                  Adapters (Inbound)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ HTTP/REST   │  │ Lambda      │  │ SQS Workers │    │
│  │ (handlers/) │  │ (core/)     │  │ (queues/)   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
┌─────────▼─────────────────▼─────────────────▼───────────┐
│              Application Layer (Use Cases)              │
│  ┌────────────────────────────────────────────────┐    │
│  │ CreateIntegration, UpdateIntegration,          │    │
│  │ LoginUser, ProcessAttachmentJob, etc.          │    │
│  └────────────────────┬───────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │ calls
┌───────────────────────▼─────────────────────────────────┐
│                Domain Layer (Entities)                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ IntegrationBase, User, Credential, Entity      │    │
│  └────────────────────┬───────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │ persisted by
┌───────────────────────▼─────────────────────────────────┐
│            Infrastructure Layer (Repositories)          │
│  ┌────────────────────────────────────────────────┐    │
│  │ IntegrationRepository, UserRepository,         │    │
│  │ CredentialRepository, ModuleRepository         │    │
│  └────────────────────┬───────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │ accesses
┌───────────────────────▼─────────────────────────────────┐
│                  External Systems                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ MongoDB  │  │ Postgres │  │ AWS KMS  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Golden Rules

1. **Handlers NEVER call repositories directly** - Always go through use cases
2. **Use cases contain business logic** - Not repositories or handlers
3. **Repositories are pure data access** - No business logic or orchestration
4. **Domain entities have behavior** - Not just data bags
5. **Encryption is transparent** - Application code works with plain data

## Essential Commands

### Development

```bash
# Install dependencies
npm install

# Generate Prisma clients (both MongoDB and PostgreSQL)
npm run prisma:generate

# Format and lint code
npm run lint:fix

# Run tests
npm test

# Run specific test file
npm test -- path/to/test.test.js

# Run tests for specific pattern
npm test -- --testPathPattern="encryption"
```

### Prisma Database Operations

```bash
# Generate clients
npm run prisma:generate:mongo      # MongoDB only
npm run prisma:generate:postgres   # PostgreSQL only
npm run prisma:generate            # Both databases

# Database migrations
npm run prisma:push:mongo          # Push MongoDB schema
npm run prisma:migrate:postgres    # Run PostgreSQL migrations
```

### Testing

```bash
# All tests
npm test

# Specific test categories
npm test -- database/encryption/   # Encryption tests
npm test -- integrations/          # Integration tests
npm test -- handlers/              # Handler tests
```

## Directory Structure

```
packages/core/
├── application/              # Application-level commands and initialization
│   └── commands/            # Command pattern implementations
├── assertions/              # Validation and assertion utilities
├── associations/            # Entity association management
├── core/                    # Runtime system (Lambda, Workers, Delegates)
│   └── CLAUDE.md           # Detailed core runtime documentation
├── credential/              # Credential management
│   ├── repositories/       # Credential data access
│   └── use-cases/          # Credential business logic
├── database/                # Database layer and encryption
│   ├── encryption/         # Field-level encryption system
│   │   └── README.md       # Comprehensive encryption documentation
│   ├── models/             # Mongoose models
│   ├── repositories/       # Database repositories
│   └── use-cases/          # Database health and management
├── encrypt/                 # Cryptor adapter for AWS KMS and AES
├── errors/                  # Error type definitions
├── handlers/                # HTTP/Lambda request handlers
│   └── routers/            # Express routers
├── integrations/            # Integration domain and lifecycle
│   ├── integration-base.js # Base class for all integrations
│   ├── repositories/       # Integration data access
│   ├── tests/              # Integration tests
│   └── use-cases/          # Integration business logic
├── lambda/                  # AWS Lambda utilities
├── logs/                    # Logging system
├── modules/                 # API module system
│   ├── requester/          # HTTP client implementations
│   └── repositories/       # Module data access
├── prisma-mongodb/          # MongoDB Prisma schema
├── prisma-postgresql/       # PostgreSQL Prisma schema
├── queues/                  # SQS job queue management
├── syncs/                   # Data synchronization
├── token/                   # Token management
│   └── repositories/       # Token data access
├── types/                   # TypeScript type definitions
├── user/                    # User management
│   ├── repositories/       # User data access
│   └── use-cases/          # User business logic
├── utils/                   # Utility functions
├── websocket/               # WebSocket connection management
│   └── repositories/       # WebSocket data access
├── index.js                 # Main export file
├── package.json             # Package configuration
└── README.md                # Package documentation
```

## Core Components

### 1. Integration System (`/integrations`)

**Purpose**: Foundation for building integrations between external systems.

**Key Files**:

-   `integration-base.js` - Base class all integrations extend
-   `integration.js` - Integration domain aggregate using Proxy pattern
-   `options.js` - Integration configuration and options

**Use Cases**:

-   `create-integration.js` - Create new integration instance
-   `update-integration.js` - Update integration configuration
-   `delete-integration-for-user.js` - Remove integration
-   `get-integration-instance.js` - Load integration with modules
-   `load-integration-context.js` - Full integration context loading

**Repositories**:

-   `integration-repository-factory.js` - Creates database-specific repositories
-   `integration-repository-mongo.js` - MongoDB implementation
-   `integration-repository-postgres.js` - PostgreSQL implementation
-   `integration-mapping-repository-*.js` - Mapping data persistence

**Integration developers extend IntegrationBase**:

```javascript
const { IntegrationBase } = require('@friggframework/core');

class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        modules: {
            serviceA: 'service-a',
            serviceB: 'service-b',
        },
    };

    async onCreate({ integrationId }) {
        // Setup logic
        await super.onCreate({ integrationId });
    }
}
```

### 2. Database Layer (`/database`)

**Purpose**: Multi-database support with transparent encryption.

**Key Components**:

-   `prisma.js` - Prisma client initialization with encryption extension
-   `mongo.js` - Mongoose connection management (legacy)
-   `models/` - Mongoose model definitions

**Encryption System** (`/database/encryption`):

-   **Transparent encryption**: Application code never sees encrypted data
-   **Database-agnostic**: Works with MongoDB and PostgreSQL
-   **AWS KMS or AES**: Production KMS, development AES
-   **Configurable**: Via environment variables and app definition

**See**: `database/encryption/README.md` for comprehensive documentation

**Repositories**:

-   `health-check-repository.js` - Database health monitoring
-   `token-repository.js` - Authentication tokens
-   `websocket-connection-repository.js` - WebSocket connections
-   DocumentDB-enabled adapters mirror the MongoDB APIs but execute raw commands (`$runCommandRaw`, `$aggregateRaw`) for compatibility; encrypted models (e.g., credentials) still delegate reads to Prisma so the encryption extension can decrypt secrets transparently.

**Use Cases**:

-   `check-database-health-use-case.js` - Database health checks
-   `test-encryption-use-case.js` - Encryption verification

### 3. User Management (`/user`)

**Purpose**: Individual and organizational user authentication.

**User Types**:

-   **Individual Users**: Personal accounts with email/password
-   **Organization Users**: Business accounts with organization-level access
-   **Hybrid**: Support both simultaneously

**Authentication Methods**:

-   Password-based (bcrypt hashed)
-   Token-based (Bearer tokens)
-   App-based (external app user IDs)

**Use Cases**:

-   `login-user.js` - User authentication
-   `create-individual-user.js` - Create personal account
-   `create-organization-user.js` - Create business account
-   `get-user-from-bearer-token.js` - Token authentication

**Repositories**:

-   `user-repository-factory.js` - Creates database-specific repositories
-   `user-repository-mongo.js` - MongoDB implementation
-   `user-repository-postgres.js` - PostgreSQL implementation

**Configuration** (in app definition):

```javascript
{
    user: {
        usePassword: true,              // Enable password auth
        primary: 'individual',          // Primary user type
        individualUserRequired: true,   // Require individual user
        organizationUserRequired: false // Optional org user
    }
}
```

### 4. Module System (`/modules`)

**Purpose**: API module loading, credential management, and HTTP clients.

**Key Classes**:

-   `Credential` - API credentials domain entity
-   `Entity` - External service entity (account, workspace, etc.)
-   `Requester` - Base HTTP client class
-   `OAuth2Requester` - OAuth 2.0 flow implementation
-   `ApiKeyRequester` - API key authentication
-   `BasicAuthRequester` - Basic authentication

**Module Factory**:

-   `ModuleFactory` - Creates and configures API module instances
-   Handles credential injection
-   Manages module lifecycle

**Repositories**:

-   `module-repository.js` - Module data access
-   `credential-repository.js` - Credential persistence (encrypted)

### 5. Core Runtime System (`/core`)

**Purpose**: Lambda-optimized runtime with handlers, workers, and delegates.

**See**: `core/CLAUDE.md` for comprehensive documentation

**Key Components**:

-   `create-handler.js` - Lambda handler factory
-   `Worker.js` - SQS job processing base class
-   `Delegate.js` - Observer/delegation pattern
-   `load-installed-modules.js` - Dynamic module loading

**Handler Pattern**:

```javascript
const { createHandler } = require('@friggframework/core');

const handler = createHandler({
    eventName: 'MyIntegration',
    isUserFacingResponse: true, // Sanitize errors
    shouldUseDatabase: true, // Connect to DB
    method: async (event, context) => {
        // Your logic here
        return { statusCode: 200, body: 'Success' };
    },
});
```

**Worker Pattern**:

```javascript
const { Worker } = require('@friggframework/core');

class MyWorker extends Worker {
    _validateParams(params) {
        this._verifyParamExists(params, 'requiredField');
    }

    async _run(params, context) {
        // Process SQS message
    }
}
```

### 6. Encryption System (`/encrypt`)

**Purpose**: Cryptor adapter for AWS KMS and AES encryption.

**Key Class**: `Cryptor.js`

-   Envelope encryption pattern
-   AWS KMS integration
-   AES-256-GCM fallback
-   Key rotation support

**Usage**:

```javascript
const { Cryptor } = require('@friggframework/core');

const cryptor = new Cryptor({
    shouldUseAws: process.env.KMS_KEY_ARN ? true : false,
});

const encrypted = await cryptor.encrypt('sensitive-data');
const decrypted = await cryptor.decrypt(encrypted);
```

### 7. Handlers & Routers (`/handlers`)

**Purpose**: HTTP/Lambda request handling and routing.

**Key Routers**:

-   `integration-router.js` - Integration CRUD operations
-   `auth.js` - Authentication endpoints
-   `health.js` - Health check endpoints with encryption verification

**Handler Types**:

-   **User-facing**: Sanitize errors, friendly responses
-   **Server-to-server**: Full error details for debugging
-   **Background workers**: SQS message processing

**Event Dispatcher**:

-   `integration-event-dispatcher.js` - Routes events to integration handlers
-   Supports lifecycle events and user actions

### 8. Error Handling (`/errors`)

**Purpose**: Standardized error types with proper HTTP semantics.

**Error Types**:

-   `BaseError` - Base error class
-   `FetchError` - HTTP request failures
-   `HaltError` - Stop processing without retry
-   `RequiredPropertyError` - Missing required parameters
-   `ParameterTypeError` - Invalid parameter type

**Usage**:

```javascript
const { RequiredPropertyError } = require('@friggframework/core');

if (!userId) {
    throw new RequiredPropertyError('userId is required');
}
```

### 9. Logging System (`/logs`)

**Purpose**: Structured logging with debug capabilities.

**Functions**:

-   `debug(message, data)` - Debug logging
-   `initDebugLog(eventName, event)` - Initialize debug context
-   `flushDebugLog(error)` - Flush logs on error

**Usage**:

```javascript
const { debug, initDebugLog, flushDebugLog } = require('@friggframework/core');

initDebugLog('MyIntegration', event);
debug('Processing request', { userId, action });
// ... your code ...
flushDebugLog(); // On error
```

### 10. Lambda Utilities (`/lambda`)

**Purpose**: AWS Lambda-specific utilities.

**Key Classes**:

-   `TimeoutCatcher` - Detect approaching Lambda timeout
-   Graceful shutdown handling

**Usage**:

```javascript
const { TimeoutCatcher } = require('@friggframework/core');

exports.handler = async (event, context) => {
    const timeoutCatcher = new TimeoutCatcher(context);

    if (timeoutCatcher.isNearTimeout()) {
        // Save state and exit gracefully
    }
};
```

## Development Workflow

### Adding a New Use Case

1. **Create use case file** in appropriate `use-cases/` directory:

```javascript
// integrations/use-cases/my-new-use-case.js
class MyNewUseCase {
    constructor({ integrationRepository, userRepository }) {
        this.integrationRepo = integrationRepository;
        this.userRepo = userRepository;
    }

    async execute(userId, integrationId) {
        // Business logic here
        const user = await this.userRepo.findById(userId);
        const integration = await this.integrationRepo.findById(integrationId);

        // Validate, orchestrate, coordinate
        // Return result
    }
}

module.exports = { MyNewUseCase };
```

2. **Add tests** in corresponding `tests/` directory
3. **Export** from parent index.js if needed
4. **Use in handler** - handlers call use cases, not repositories

### Adding Encrypted Fields

**For custom models** (integration developers):

In `backend/index.js`:

```javascript
const appDefinition = {
    encryption: {
        schema: {
            MyCustomModel: {
                fields: ['secretData', 'data.apiKey'],
            },
        },
    },
};
```

**For core models** (framework developers):

Edit `database/encryption/encryption-schema-registry.js`:

```javascript
const ENCRYPTION_SCHEMA = {
    MyModel: {
        fields: ['sensitiveField'],
    },
};
```

### Database Migrations

**MongoDB** (Prisma push):

```bash
npm run prisma:push:mongo
```

**PostgreSQL** (Prisma migrate):

```bash
npm run prisma:migrate:postgres
```

### Integration Development

1. **Extend IntegrationBase** in your app
2. **Define static Definition** with name, version, modules
3. **Implement lifecycle methods**: `onCreate`, `onUpdate`, `onDelete`
4. **Add event handlers** for webhooks and user actions
5. **Use framework services**: repositories, encryption, logging

## Testing Strategy

### Test Categories

1. **Unit Tests**: Use cases with mocked repositories
2. **Integration Tests**: Full flow with real dependencies
3. **Repository Tests**: Database operations
4. **Handler Tests**: HTTP/Lambda response testing

### Test Structure

```javascript
describe('MyUseCase', () => {
    let useCase;
    let mockRepository;

    beforeEach(() => {
        mockRepository = {
            findById: jest.fn(),
            save: jest.fn(),
        };
        useCase = new MyUseCase({ repository: mockRepository });
    });

    it('executes successfully', async () => {
        mockRepository.findById.mockResolvedValue({ id: '123' });

        const result = await useCase.execute('123');

        expect(result).toBeDefined();
        expect(mockRepository.findById).toHaveBeenCalledWith('123');
    });
});
```

### Running Tests

```bash
# All tests
npm test

# Specific file
npm test -- path/to/test.test.js

# Pattern matching
npm test -- --testPathPattern="encryption"

# With coverage
npm test -- --coverage
```

### Test Doubles

Use test doubles from `@friggframework/test` package for consistent mocking.

## Anti-Patterns

### Architecture Anti-Patterns

❌ **Don't call repositories from handlers** - Always use use cases
❌ **Don't put business logic in repositories** - Repositories are pure data access
❌ **Don't put HTTP concerns in use cases** - Use cases are protocol-agnostic
❌ **Don't bypass encryption** - Sensitive data must be encrypted
❌ **Don't expose internal errors to users** - Use `isUserFacingResponse: true`
❌ **Don't skip connection pooling** - Set `callbackWaitsForEmptyEventLoop = false`

### Development Anti-Patterns

❌ **Don't modify node_modules** - Extend through proper patterns
❌ **Don't hardcode credentials** - Use environment variables
❌ **Don't skip tests** - Maintain test coverage
❌ **Don't commit secrets** - Use .gitignore and AWS Secrets Manager
❌ **Don't ignore linting errors** - Run `npm run lint:fix`

### Integration Development Anti-Patterns

❌ **Don't bypass IntegrationBase** - Always extend the base class
❌ **Don't ignore lifecycle methods** - Implement onCreate, onUpdate, onDelete
❌ **Don't skip signature validation** - Validate all webhooks
❌ **Don't sync operations in handlers** - Use background workers for long tasks
❌ **Don't ignore errors** - Proper error handling and logging

## Environment Variables

### Required

-   `AWS_REGION` - AWS region for services
-   `DATABASE_URL` - Database connection string (auto-set)
-   `DB_TYPE` - Database type: 'mongodb' or 'postgresql'

### Encryption

-   `KMS_KEY_ARN` - AWS KMS key ARN (production)
-   `AES_KEY_ID` - AES key ID (development)
-   `AES_KEY` - AES encryption key (development)
-   `STAGE` - Environment stage (dev, test, local bypass encryption)

### Optional

-   `SECRET_ARN` - AWS Secrets Manager ARN for auto-injection
-   `DEBUG` - Debug logging pattern
-   `LOG_LEVEL` - Logging level (debug, info, warn, error)

## Version Information

-   **Current Version**: 2.0.0-next.0 (pre-release)
-   **Node.js**: >=18 required
-   **Dependencies**: See package.json for full list

## Support and Documentation

-   **Main Framework CLAUDE.md**: See root Frigg CLAUDE.md for framework-wide guidance
-   **Core Runtime**: See `core/CLAUDE.md` for Lambda/Worker patterns
-   **Encryption**: See `database/encryption/README.md` for encryption details
-   **Package README**: See `README.md` for API reference

## Recent Important Changes

### Field-Level Encryption JSON Object Support

**Date**: 2025-01-06

**Problem**: The `FieldEncryptionService` was converting objects to the string `"[object Object]"` before encrypting, corrupting JSON fields like `IntegrationMapping.mapping`.

**Solution**: Added `_serializeForEncryption()` and `_deserializeAfterDecryption()` methods:

-   Objects are now JSON.stringify'd before encryption
-   Decrypted strings are JSON.parse'd back to objects
-   Plain strings work as before

**Files Changed**:

-   `database/encryption/field-encryption-service.js`
-   `database/encryption/field-encryption-service.test.js`

**Test Coverage**: All 40 tests pass, including new object encryption test.

**Impact**: `IntegrationMapping.mapping` and other JSON fields now correctly round-trip through encryption.

---

**Built with ❤️ by the Frigg Framework team**
