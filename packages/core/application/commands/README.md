# Frigg Commands - Application Service Layer

## Overview

Frigg Commands provide a clean, stable application service layer for all database operations in the Frigg Integration Framework. They abstract away the underlying ORM (currently Mongoose) and provide a consistent API for managing users, credentials, entities, and integrations.

## Why Use Commands?

### 1. **ORM Independence**
Commands isolate your integration code from the underlying database implementation. This allows Frigg to migrate between ORMs (e.g., Mongoose to Prisma) without breaking your integration code.

### 2. **Hexagonal Architecture**
Commands act as the **application service layer** in hexagonal architecture:
- **Domain Layer**: Your use cases and business logic
- **Application Layer**: Frigg Commands (this layer)
- **Infrastructure Layer**: Repositories and database models (hidden from you)

### 3. **Single Source of Truth**
All database operations flow through commands, making it easier to:
- Add caching, logging, or monitoring
- Enforce data validation rules
- Maintain consistent error handling
- Track data access patterns

### 4. **Future-Proof**
When Frigg upgrades its internals, commands maintain backward compatibility. Your integration code continues working without changes.

## Installation

Commands are available through the `@friggframework/core` package:

```javascript
const { createFriggCommands } = require('@friggframework/core');
```

## Basic Usage

### Initialize Commands

```javascript
const { createFriggCommands } = require('@friggframework/core');
const MyIntegration = require('./MyIntegration');

// Create command set with your integration class
const commands = createFriggCommands({
    integrationClass: MyIntegration
});
```

### Use Commands in Your Integration

```javascript
class MyIntegration extends IntegrationBase {
    constructor() {
        super();
        this.commands = createFriggCommands({
            integrationClass: MyIntegration
        });
    }

    async hydrateFromExternalUser(externalUserId) {
        // Find integration context by external entity ID
        const result = await this.commands.findIntegrationContextByExternalEntityId(
            externalUserId
        );

        if (result.error) {
            return { error: result.error };
        }

        // Hydrate integration with retrieved context
        this.setIntegrationRecord(result.context);
        return { record: this.record };
    }
}
```

### Use Commands in Use Cases

```javascript
const { createFriggCommands } = require('@friggframework/core');

class AuthenticateUserUseCase {
    constructor({ commands } = {}) {
        // Accept injected commands for testing, or create default
        this.commands = commands || createFriggCommands({
            integrationClass: MyIntegration
        });
    }

    async execute({ appUserId, username, email }) {
        // Find or create user
        let user = await this.commands.findUserByAppUserId(appUserId);

        if (!user) {
            user = await this.commands.createUser({
                appUserId,
                username,
                email
            });
        }

        return user;
    }
}
```

## Available Commands

### User Commands

Manage Frigg users (individuals or organizations using your integration).

```javascript
// Create a new user
const user = await commands.createUser({
    username: 'john@example.com',
    email: 'john@example.com',
    appUserId: 'external-user-123',
    password: 'optional-password' // For password-based auth
});

// Find user by app-specific user ID
const user = await commands.findUserByAppUserId('external-user-123');

// Find user by username
const user = await commands.findUserByUsername('john@example.com');

// Find user by Frigg internal ID
const user = await commands.findUserById('frigg-user-id');

// Update user
const updatedUser = await commands.updateUser('frigg-user-id', {
    email: 'newemail@example.com'
});
```

### Credential Commands

Manage OAuth tokens and API credentials.

```javascript
// Create credential
const credential = await commands.createCredential({
    userId: 'frigg-user-id',
    externalId: 'oauth-user-id',
    access_token: 'access_token_value',
    refresh_token: 'refresh_token_value',
    expires_at: new Date('2024-12-31'),
    moduleName: 'asana',
    auth_is_valid: true
});

// Find credential
const credential = await commands.findCredential({
    userId: 'frigg-user-id',
    moduleName: 'asana'
});

// Update credential (e.g., after token refresh)
const updated = await commands.updateCredential('credential-id', {
    access_token: 'new_access_token',
    expires_at: new Date('2025-01-31')
});

// Delete credential
await commands.deleteCredential('credential-id');
```

### Entity Commands

Manage module entities (connections to external services).

```javascript
// Create entity
const entity = await commands.createEntity({
    userId: 'frigg-user-id',
    externalId: 'asana-workspace-123',
    name: 'My Workspace',
    moduleName: 'asana',
    credentialId: 'credential-id'
});

// Find single entity
const entity = await commands.findEntity({
    userId: 'frigg-user-id',
    externalId: 'asana-workspace-123',
    moduleName: 'asana'
});

// Find entity by ID
const entity = await commands.findEntityById('entity-id');

// Find all entities for user
const entities = await commands.findEntitiesByUserId('frigg-user-id');

// Find entities by module
const asanaEntities = await commands.findEntitiesByUserIdAndModuleName(
    'frigg-user-id',
    'asana'
);

// Find multiple entities by IDs
const entities = await commands.findEntitiesByIds(['entity-id-1', 'entity-id-2']);

// Update entity
const updated = await commands.updateEntity('entity-id', {
    name: 'Updated Workspace Name'
});

// Delete entity
await commands.deleteEntity('entity-id');
```

### Integration Commands

Manage integration records and load full integration contexts.

```javascript
// Find integration context by external entity ID
// Returns { context, error } where context includes record + hydrated modules
const result = await commands.findIntegrationContextByExternalEntityId(
    'external-user-or-workspace-id'
);

if (!result.error) {
    integration.setIntegrationRecord(result.context);
}

// Load integration context by integration ID
const result = await commands.loadIntegrationContextById('integration-id');

if (!result.error) {
    integration.setIntegrationRecord(result.context);
}
```

## Architecture Principles

### Dependency Injection for Testing

Commands support dependency injection for testing:

```javascript
// Production code - uses real repositories
const commands = createFriggCommands({ integrationClass: MyIntegration });

// Test code - inject mocks
const mockCommands = {
    createUser: jest.fn().mockResolvedValue({ id: 'user-123' }),
    findUserByAppUserId: jest.fn().mockResolvedValue(null)
};

const useCase = new MyUseCase({ commands: mockCommands });
```

### Integration vs Unit Testing

**Commands are designed for integration testing** - they use real repositories by default:

```javascript
// ❌ Don't do this - commands always use real repositories
const commands = createFriggCommands({
    userRepository: mockUserRepo  // This parameter doesn't exist
});

// ✅ Do this - inject mocked commands into your use cases
const useCase = new MyUseCase({
    commands: mockCommands
});
```

### Error Handling

Commands return domain objects directly. Handle errors at the use case level:

```javascript
try {
    const user = await commands.createUser({ username, email });
    return { success: true, user };
} catch (error) {
    // Handle database errors
    return { success: false, error: error.message };
}
```

For integration context operations, errors are returned in the result:

```javascript
const result = await commands.findIntegrationContextByExternalEntityId(userId);

if (result.error) {
    return { error: result.error };
}

// Use result.context
```

## Migration Guide

### From Direct Model Access

**Before (❌ Don't do this):**
```javascript
const { User } = require('@friggframework/core');

const user = await User.findOne({ appUserId: '123' });
```

**After (✅ Do this):**
```javascript
const { createFriggCommands } = require('@friggframework/core');

const commands = createFriggCommands({ integrationClass: MyIntegration });
const user = await commands.findUserByAppUserId('123');
```

### From IntegrationRepository (Backend Pattern)

**Before (❌ Old pattern):**
```javascript
const { IntegrationRepository } = require('./repositories/IntegrationRepository');

this.integrationRepository = new IntegrationRepository(MyIntegration);
const result = await this.integrationRepository.loadIntegrationRecordByAsanaUser(userId);
```

**After (✅ New pattern):**
```javascript
const { createFriggCommands } = require('@friggframework/core');

this.commands = createFriggCommands({ integrationClass: MyIntegration });
const result = await this.commands.findIntegrationContextByExternalEntityId(userId);
```

## Best Practices

### 1. Create Commands Once
Initialize commands in your constructor:

```javascript
class MyIntegration extends IntegrationBase {
    constructor() {
        super();
        this.commands = createFriggCommands({ integrationClass: MyIntegration });
    }
}
```

### 2. Pass Commands to Use Cases
Use dependency injection for testability:

```javascript
class MyUseCase {
    constructor({ commands } = {}) {
        this.commands = commands || createFriggCommands({
            integrationClass: MyIntegration
        });
    }
}
```

### 3. Use Specific Finders
Use the most specific finder method:

```javascript
// ✅ Good - specific finder
const user = await commands.findUserByAppUserId('123');

// ❌ Less efficient - generic finder
const user = await commands.findUser({ appUserId: '123' });
```

### 4. Handle Null Returns
Most finders return `null` if not found:

```javascript
const user = await commands.findUserByAppUserId('123');

if (!user) {
    // Handle user not found
    user = await commands.createUser({ ... });
}
```

## Command Reference

| Category | Command | Description |
|----------|---------|-------------|
| **User** | `createUser(data)` | Create new Frigg user |
| | `findUserByAppUserId(appUserId)` | Find by external app user ID |
| | `findUserByUsername(username)` | Find by username |
| | `findUserById(id)` | Find by Frigg user ID |
| | `updateUser(id, updates)` | Update user properties |
| **Credential** | `createCredential(data)` | Create OAuth credential |
| | `findCredential(filter)` | Find credential by filter |
| | `updateCredential(id, updates)` | Update credential (token refresh) |
| | `deleteCredential(id)` | Delete credential |
| **Entity** | `createEntity(data)` | Create module entity |
| | `findEntity(filter)` | Find entity by filter |
| | `findEntityById(id)` | Find by entity ID |
| | `findEntitiesByUserId(userId)` | Find all user entities |
| | `findEntitiesByUserIdAndModuleName(userId, moduleName)` | Find user entities for module |
| | `findEntitiesByIds(ids)` | Find multiple by IDs |
| | `updateEntity(id, updates)` | Update entity properties |
| | `deleteEntity(id)` | Delete entity |
| **Integration** | `findIntegrationContextByExternalEntityId(externalId)` | Load integration + modules by external ID |
| | `loadIntegrationContextById(integrationId)` | Load integration + modules by ID |

## Support

For questions or issues with commands:
1. Check this README
2. Review the main Frigg documentation
3. Open an issue on the Frigg Framework repository

## Related Documentation

- [Frigg Framework Overview](../../README.md)
- [Integration Development Guide](../../docs/integration-guide.md)
- [Hexagonal Architecture](../../docs/architecture.md)