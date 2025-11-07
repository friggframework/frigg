# Database Layer Architecture

## Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER                              │
│                    (Database Agnostic)                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Use Cases                              │  │
│  │  - CreateCredentialUseCase                               │  │
│  │  - TestEncryptionUseCase                                 │  │
│  │  - GetUserIntegrationsUseCase                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            │ depends on                          │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PORTS (Interfaces)                           │  │
│  │  - CredentialRepositoryInterface                         │  │
│  │  - UserRepositoryInterface                               │  │
│  │  - IntegrationRepositoryInterface                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ implemented by
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                           │
│                      (Adapters)                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           MongoDB Adapters                                │  │
│  │                                                           │  │
│  │  BaseRepositoryMongoDB (DocumentDB compatibility)        │  │
│  │           ▲                                               │  │
│  │           │ extends                                       │  │
│  │           │                                               │  │
│  │  ┌────────┴────────┬────────────────┬──────────────┐    │  │
│  │  │                 │                │              │    │  │
│  │  CredentialRepo   UserRepo    IntegrationRepo  ModuleRepo│  │
│  │  Mongo            Mongo       Mongo            Mongo    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         PostgreSQL Adapters                               │  │
│  │                                                           │  │
│  │  CredentialRepositoryPostgres                            │  │
│  │  UserRepositoryPostgres                                  │  │
│  │  IntegrationRepositoryPostgres                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Database Clients                                  │  │
│  │                                                           │  │
│  │  Prisma Client (core)                                    │  │
│  │  ├── prisma-mongodb/schema.prisma                        │  │
│  │  └── prisma-postgresql/schema.prisma                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
packages/core/
├── credential/
│   ├── use-cases/              # Domain layer
│   └── repositories/           # Adapter layer
│       ├── credential-repository-interface.js      # PORT
│       ├── credential-repository-mongo.js          # ADAPTER (MongoDB)
│       ├── credential-repository-postgres.js       # ADAPTER (PostgreSQL)
│       └── credential-repository-factory.js        # Factory
│
├── database/
│   ├── repositories/
│   │   ├── base-repository-mongodb.js              # MongoDB adapter base
│   │   ├── health-check-repository-interface.js   # PORT
│   │   ├── health-check-repository-mongodb.js     # ADAPTER (MongoDB)
│   │   └── health-check-repository-postgres.js    # ADAPTER (PostgreSQL)
│   │
│   ├── utils/
│   │   ├── documentdb-compatibility.js             # DocumentDB utilities
│   │   └── prisma-documentdb-wrapper.js            # Wrapper for adapters
│   │
│   ├── prisma.js                                   # Core Prisma client
│   ├── prisma-mongodb/schema.prisma                # MongoDB schema
│   └── prisma-postgresql/schema.prisma             # PostgreSQL schema
│
├── user/
│   ├── use-cases/              # Domain layer
│   └── repositories/           # Adapter layer
│       ├── user-repository-interface.js            # PORT
│       ├── user-repository-mongo.js                # ADAPTER (MongoDB)
│       └── user-repository-postgres.js             # ADAPTER (PostgreSQL)
│
└── integrations/
    ├── use-cases/              # Domain layer
    └── repositories/           # Adapter layer
        ├── integration-repository-interface.js     # PORT
        ├── integration-repository-mongo.js         # ADAPTER (MongoDB)
        └── integration-repository-postgres.js      # ADAPTER (PostgreSQL)
```

## Key Principles

### 1. **Separation of Concerns**

**Domain Layer (Use Cases):**
- Business logic only
- No database-specific code
- Depends on repository interfaces (ports)

**Infrastructure Layer (Repositories):**
- Database-specific implementations
- MongoDB adapters handle DocumentDB compatibility
- PostgreSQL adapters handle PostgreSQL specifics

### 2. **DocumentDB Compatibility Location**

❌ **WRONG: Global wrapper in `prisma.js`**
```javascript
// This would leak infrastructure concerns into core
const client = wrapPrismaForDocumentDB(new PrismaClient());
```

✅ **CORRECT: Adapter layer in MongoDB repositories**
```javascript
// DocumentDB is a MongoDB adapter concern
class CredentialRepositoryMongo extends CredentialRepositoryInterface {
    constructor() {
        const mongoBase = new BaseRepositoryMongoDB({ prismaClient: prisma });
        this.prisma = mongoBase.prisma;  // ← DocumentDB compatibility applied HERE
    }
}
```

### 3. **Why This Follows Hexagonal Architecture**

**Port (Interface):**
```javascript
class CredentialRepositoryInterface {
    async createCredential(data) {
        throw new Error('Must be implemented by adapter');
    }
}
```

**Adapter (MongoDB with DocumentDB compatibility):**
```javascript
class CredentialRepositoryMongo extends CredentialRepositoryInterface {
    constructor() {
        // MongoDB-specific adapter wraps Prisma for DocumentDB
        const mongoBase = new BaseRepositoryMongoDB({ prismaClient: prisma });
        this.prisma = mongoBase.prisma;
    }
    
    async createCredential(data) {
        // DocumentDB compatibility handled by wrapper
        return this.prisma.credential.create({ data });
    }
}
```

**Adapter (PostgreSQL - no DocumentDB concerns):**
```javascript
class CredentialRepositoryPostgres extends CredentialRepositoryInterface {
    constructor() {
        // PostgreSQL adapter uses Prisma directly (no DocumentDB concerns)
        this.prisma = prisma;
    }
    
    async createCredential(data) {
        return this.prisma.credential.create({ data });
    }
}
```

### 4. **BaseRepositoryMongoDB Role**

`BaseRepositoryMongoDB` is the **MongoDB adapter base class** that:
- Encapsulates MongoDB/DocumentDB-specific concerns
- Applies DocumentDB compatibility wrapper
- Provides common MongoDB functionality
- All MongoDB repositories extend it

**This is NOT a generic base repository** - it's specifically for MongoDB adapters.

## Summary

✅ **You were right to question it!** The architecture is:

- **`prisma-mongodb/`** - Schema definition (infrastructure)
- **`repositories/*-mongo.js`** - MongoDB adapters (infrastructure)
- **`BaseRepositoryMongoDB`** - MongoDB adapter base class (infrastructure)
- **`repositories/*-interface.js`** - Ports (domain boundary)
- **`use-cases/`** - Domain logic (core)

DocumentDB compatibility belongs in the **MongoDB adapter layer**, which is exactly where we put it! 🎯

