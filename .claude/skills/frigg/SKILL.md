---
name: frigg
description: Guidance on Frigg Framework, Frigg API modules, Frigg architecture and Frigg best practices.
---

# Frigg Integration Framework Expert

I am a Frigg Framework expert. When invoked, I provide comprehensive guidance on building serverless integrations using the Frigg Framework, including API module usage, architectural patterns, and best practices.

## What is Frigg?

Frigg is a powerful, opinionated **integration framework** designed to accelerate the development of **direct/native integrations** between software products and external partners.

### The Vision

- **Spin up integrations** in minutes
- **Deploy to production** within a single day
- Receive **automated notifications** when upstream APIs change
- Run on **your own cloud accounts** (no vendor lock-in)

### Core Value Proposition

- **Structured, Reusable Codebase**: Opinionated architecture promoting consistency
- **Rapid Development**: Get from concept to production in hours, not weeks
- **Serverless Architecture**: Low-cost, highly scalable deployment model
- **Enterprise-Grade Features**: Built-in security, monitoring, and error handling

## Architecture Overview

### Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────┐
│ Adapter Layer (Handlers/Routers)                       │
│  - HTTP request/response handling                      │
│  - ONLY calls use cases                                │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ Application Layer (Use Cases)                          │
│  - Business logic orchestration                        │
│  - Workflow coordination                               │
│  - Calls repositories for data access                  │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ Infrastructure Layer (Repositories)                    │
│  - Pure database operations (CRUD)                     │
│  - External API calls                                  │
│  - NO business logic                                   │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ External Systems (Database, AWS, Third-party APIs)    │
└─────────────────────────────────────────────────────────┘
```

### The Golden Rule

> **"Handlers ONLY call Use Cases, NEVER Repositories directly"**

## API Modules: The Heart of Frigg

### What are API Modules?

API Modules are **reusable connector packages** that define how to connect to third-party systems and what APIs are available. They are the building blocks that make Frigg integrations powerful.

### API Module Structure

```javascript
module.exports = {
    moduleName: 'service-name',        // Unique identifier
    API: ServiceAPIClass,              // Main API class
    requiredAuthMethods: {             // Authentication methods
        getToken: function,
        getEntityDetails: function,
        getCredentialDetails: function,
        apiPropertiesToPersist: object,
        testAuthRequest: function
    },
    env: {},                          // Environment variables
    modelName: 'ServiceModel'         // Optional model name
};
```

### How to Use API Modules

In your integration file, API modules are accessed through a clean, intuitive pattern:

```javascript
class MyIntegration extends IntegrationBase {
  async syncContacts() {
    // Direct access to third-party APIs
    const contacts = await this.hubspot.api.getContacts();
    const leads = await this.salesforce.api.createLeads(contacts);
    return leads;
  }
}
```

**Pattern**: `this.{moduleName}.api.{method}()` provides:

- **Consistent Interface**: Same pattern across all integrations
- **Automatic Authentication**: Token management handled transparently
- **Error Handling**: Built-in retry logic and error recovery
- **Type Safety**: TypeScript definitions included

### Why API Modules are Critical

1. **Eliminates Redundant Work**: No need to learn each API from scratch
2. **Ensures Consistency**: Standardized authentication, error handling, data formats
3. **Accelerates Development**: Focus on business logic, not API mechanics
4. **Improves Maintainability**: Centralized updates, version management
5. **Enterprise-Grade Features**: Automatic token refresh, rate limiting, logging

## Integration Pattern

### Creating a New Integration

```javascript
const { IntegrationBase } = require("@friggframework/core");

class MyIntegration extends IntegrationBase {
  static Definition = {
    name: "my-integration",
    version: "1.0.0",
    display: {
      label: "My Integration",
      description: "Syncs data between systems",
      category: "CRM",
    },
    modules: {
      hubspot: require("@friggframework/api-module-hubspot"),
      salesforce: require("@friggframework/api-module-salesforce"),
    },
    routes: [
      {
        path: "/sync",
        method: "POST",
        event: "SYNC_CONTACTS",
      },
    ],
  };

  constructor() {
    super();
    this.events = {
      SYNC_CONTACTS: {
        handler: this.syncContacts,
      },
    };
  }

  async syncContacts() {
    // Your integration logic here
    const contacts = await this.hubspot.api.getContacts();
    return await this.salesforce.api.createContacts(contacts);
  }
}

module.exports = MyIntegration;
```

## Security & Encryption

### Field-Level Encryption Architecture

**Purpose**: Encrypt sensitive data at application layer (database-agnostic)

**Architecture Layers**:

- **Prisma Extension** (`prisma-encryption-extension.js`) - Transparent encryption at Prisma level
- **Field Encryption Service** (`field-encryption-service.js`) - Orchestrates field-level encryption
- **Cryptor** (`encrypt/Cryptor.js`) - Adapter for AWS KMS and AES encryption
- **Encryption Schema Registry** - Defines which fields are encrypted

**How It Works**:

1. Use cases and repositories work with **plain data** (transparent)
2. Prisma Extension intercepts database operations
3. Field Encryption Service encrypts/decrypts specified fields
4. Cryptor uses AWS KMS or AES to perform actual encryption
5. Database stores encrypted data

**Environment Configuration**:

```bash
# Production (AWS KMS - recommended)
KMS_KEY_ARN=arn:aws:kms:...
STAGE=production

# AES Encryption (any environment)
AES_KEY_ID=local-dev-key
AES_KEY=your-32-char-key
STAGE=production

# Bypass (dev/test/local stages)
STAGE=dev
```

**Encrypted Fields** (defined in `encryption-schema-registry.js`):

- **Credential**: `data.access_token`, `data.refresh_token`, `data.domain`, `data.id_token`
- **IntegrationMapping**: `mapping` (complete object)
- **User**: `hashword`
- **Token**: `token`

**Key Features**:

- ✅ Database-agnostic (MongoDB, PostgreSQL)
- ✅ Transparent to application code
- ✅ Envelope encryption pattern
- ✅ Auto-bypass in dev/test/local environments

### API Module Authentication Methods

Frigg supports two main authentication patterns for API modules:

**1. OAuth2 (OAuth2Requester)**:

```javascript
const { OAuth2Requester } = require("@friggframework/core");

class MyApi extends OAuth2Requester {
  constructor(params) {
    super(params);
    this.baseUrl = "https://api.example.com";
    this.authorizationUri = "https://api.example.com/oauth/authorize";
    this.tokenUri = "https://api.example.com/oauth/token";
    this.client_id = process.env.CLIENT_ID;
    this.client_secret = process.env.CLIENT_SECRET;
    this.redirect_uri = process.env.REDIRECT_URI;
    this.scopes = ["read", "write"];
  }
}
```

**2. API Key (ApiKeyRequester)**:

```javascript
const { ApiKeyRequester } = require("@friggframework/core");

class QuoApi extends ApiKeyRequester {
  constructor(params) {
    super(params);
    this.baseUrl = "https://dev-public-api.openphone.dev";

    // Set API key header name
    this.API_KEY_NAME = "Authorization";

    // Get API key from params
    const apiKey = params.access_token || params.api_key;
    this.access_token = apiKey;

    if (this.access_token) {
      this.setApiKey(this.access_token);
    }
  }
}
```

**Other Supported Methods**:

- `BasicAuthRequester` - HTTP Basic Authentication
- `Requester` - Base class for custom authentication

## Key Patterns & Best Practices

### Repository Pattern

**DO**:

- ✅ Atomic operations only
- ✅ Return raw data without interpretation
- ✅ Thin wrapper around database/API
- ✅ No business logic

**DON'T**:

- ❌ Orchestrate multiple operations
- ❌ Apply business rules
- ❌ Make decisions about data meaning

### Use Case Pattern

**DO**:

- ✅ Contain business logic and validation
- ✅ Orchestrate multiple repository calls
- ✅ Make decisions based on data
- ✅ Use dependency injection

**DON'T**:

- ❌ Access database directly
- ❌ Handle HTTP concerns
- ❌ Create "god" use cases

### Handler/Adapter Pattern

**DO**:

- ✅ Call use cases (not repositories)
- ✅ Handle HTTP-specific logic only
- ✅ Map domain errors to HTTP errors
- ✅ Keep handlers thin

**DON'T**:

- ❌ Put business logic in handlers
- ❌ Call repositories directly
- ❌ Mix concerns

## Development Commands

### Project Setup

```bash
frigg init my-integration
cd my-integration
npm install
```

### Frigg CLI Commands

```bash
# Install API Modules
frigg install hubspot         # Install API module and generate integration file
frigg install salesforce
frigg search crm             # Search for available API modules

# Local Development
frigg start                  # Start local server with serverless-offline
frigg db:setup              # Setup database (Prisma generate + migrations)

# Building
frigg build                  # Build for local (skips AWS discovery)
frigg build --production     # Build with AWS discovery enabled
frigg build --stage prod --verbose

# Deployment
frigg deploy --stage prod    # Deploy to production
frigg deploy --stage dev     # Deploy to development

# Testing
npm test                     # Run framework tests

# Management UI
frigg ui                     # Start Frigg Management UI (localhost:3002)

# API Module Authentication Testing
frigg auth test .            # Test OAuth2 or API-Key auth (interactive form)
frigg auth test attio        # Test by module name
frigg auth test . --api-key sk_xxx  # Test API-Key (explicit, skips form)
frigg auth list              # List saved credentials
frigg auth get attio --json  # Get credentials as JSON
frigg auth delete attio      # Delete saved credentials
```

### Frigg Authenticator

CLI tool for testing API module authentication flows without deploying infrastructure.

**Commands:**
- `frigg auth test <module>` - Test OAuth2 or API-Key authentication
- `frigg auth list` - List all saved credentials
- `frigg auth get <module>` - Retrieve credentials (supports `--json`, `--export`)
- `frigg auth delete [module]` - Remove credentials (supports `--all`)

**Options for `frigg auth test`:**
- `--api-key <key>` - Use explicit API key (skips interactive form)
- `--port <port>` - Callback server port (default: 3333)
- `--no-browser` - Print authorization URL instead of opening browser
- `--timeout <seconds>` - OAuth callback timeout (default: 300)
- `-v, --verbose` - Enable verbose output

**API-Key Modules with Interactive Forms:**

API-Key modules with `getAuthorizationRequirements` render interactive CLI forms:

```bash
$ frigg auth test .

📝 Quo API Authorization

  (Your Quo API key)
  API Key: ********************************

🔑 API-Key Authentication Flow
Module: quo
✓ API key configured
```

Features:
- Password masking for `ui:widget: 'password'` fields
- Help text from `ui:help` displayed before prompts
- Validation for required fields
- Multi-field support (e.g., company ID, public key, private key)

**What it tests:**
- `testAuthRequest` - Verify authentication works
- `getEntityDetails` - Validate entity consistency post-auth
- `getCredentialDetails` - Verify credential structure post-auth
- Token refresh - Test refresh mechanism if supported
- `apiPropertiesToPersist` - Verify credential and entity properties

**Example workflow:**
```bash
# Navigate to API module directory
cd packages/api-module-attio

# Set up environment variables
cat .env
# ATTIO_CLIENT_ID=xxx
# ATTIO_CLIENT_SECRET=xxx
# ATTIO_SCOPE=read:objects
# REDIRECT_URI=http://localhost:3333

# Run authentication test
frigg auth test . --verbose

# Use saved credentials in tests
frigg auth get . --json
```

### Infrastructure Commands

The Frigg CLI uses **osls** (OSS-Serverless) internally, a drop-in replacement for Serverless Framework v3:

```bash
# Direct osls usage (advanced)
osls package --config infrastructure.js --stage prod
osls deploy --config infrastructure.js --stage prod --verbose
```

## Infrastructure Architecture

### Domain-Driven Infrastructure

Frigg uses a **Domain-Driven Design** approach for infrastructure with specialized domain builders:

**Infrastructure Composer** (`infrastructure-composer.js`):

- Orchestrates all domain builders using `BuilderOrchestrator`
- Composes serverless definition from domain-specific configurations
- Manages builder dependencies and parallel execution
- Integrates with `createFriggInfrastructure()` main entry point

**Domain Builders** (in `domains/` directory):

```
domains/
├── networking/          # VPC, subnets, security groups
│   └── vpc-builder.js
├── security/           # KMS encryption keys
│   └── kms-builder.js
├── database/           # Aurora, migrations, Prisma layers
│   ├── aurora-builder.js
│   └── migration-builder.js
├── parameters/         # SSM Parameter Store
│   └── ssm-builder.js
├── integration/        # Integrations and WebSocket APIs
│   ├── integration-builder.js
│   └── websocket-builder.js
└── shared/            # Shared utilities and orchestration
    ├── builder-orchestrator.js
    └── utilities/
```

**Builder Pattern**:
Each domain builder implements:

- `shouldExecute(appDefinition)` - Conditional execution logic
- `build(appDefinition)` - Domain-specific resource generation
- Returns: `{ resources, iamStatements, environment, functions, vpcConfig, plugins, custom }`

**Infrastructure Generation Flow**:

1. Load app definition from `backend/index.js`
2. `createFriggInfrastructure()` calls `composeServerlessDefinition()`
3. Create `BuilderOrchestrator` with all domain builders
4. Orchestrator executes builders (handles validation, dependencies, parallel execution)
5. Merge builder outputs into base serverless definition
6. Write to `backend/infrastructure.js`
7. Deploy with `osls deploy`

**AWS Resource Discovery**:

- Automatic discovery of VPC, subnets, security groups
- KMS key discovery for encryption
- Aurora database discovery
- NAT Gateway and Elastic IP detection
- Integrated at build time via `FRIGG_SKIP_AWS_DISCOVERY` env var

**Key Features**:

- ✅ Domain separation of concerns
- ✅ Automatic AWS resource discovery
- ✅ Conditional builder execution (e.g., skip in local mode)
- ✅ Parallel execution where possible
- ✅ Clean, testable architecture
- ✅ Uses **osls** (OSS-Serverless) instead of Serverless Framework v3

## Frigg Management API Endpoints

Comprehensive guide to the Management API endpoints available in deployed Frigg applications. For detailed curl examples and workflows, see the [Frigg Management API Guide](../../../frigg-management-api.md) in project documentation.

### Authentication Methods

Frigg supports two authentication approaches:

**1. JWT Token Authentication (User-Facing)**

For user-facing applications where users create accounts and authenticate:

```bash
# Headers required for all authenticated requests
Authorization: Bearer ${FRIGG_JWT_TOKEN}
```

**2. Shared Secret Authentication (Backend-to-Backend)**

For backend services, automated scripts, and server-to-server communication:

```bash
# Headers required for all authenticated requests
x-frigg-api-key: ${FRIGG_API_KEY}
x-frigg-appuserid: ${FRIGG_APP_USER_ID}
```

### User Management

**Create User**

```bash
POST /user/create
Content-Type: application/json

Body: {
  "username": "user@example.com",
  "password": "securePassword123"
}

Response (201): {
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Login User**

```bash
POST /user/login
Content-Type: application/json

Body: {
  "username": "user@example.com",
  "password": "securePassword123"
}

Response (200): {
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Health & Status Endpoints

**Basic Health Check**

```bash
GET /health

Response (200): {
  "status": "healthy",
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

**Detailed Health Check**

```bash
GET /health/detailed
x-frigg-admin-api-key: ${ADMIN_API_KEY}

Response (200): {
  "status": "healthy",
  "timestamp": "2025-01-18T12:00:00.000Z",
  "checks": {
    "database": {
      "status": "connected",
      "responseTime": 15,
      "state": "connected"
    },
    "encryption": {
      "status": "enabled",
      "method": "kms",
      "testResult": "Encryption and decryption verified successfully"
    },
    "modules": {
      "status": "loaded",
      "count": 3
    }
  }
}
```

**Kubernetes Liveness Probe**

```bash
GET /health/live

Response (200): {
  "alive": true,
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

**Kubernetes Readiness Probe**

```bash
GET /health/ready

Response (200): {
  "ready": true,
  "timestamp": "2025-01-18T12:00:00.000Z",
  "checks": {
    "database": true,
    "modules": true
  }
}

# Returns 503 if not ready
```

### Authorization & Entity Endpoints

**Get Authorization Requirements (API Key Modules)**

```bash
GET /api/authorize?entityType=quo
Authorization: Bearer ${TOKEN}

Response (200): {
  "type": "apiKey",
  "jsonSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "title": "API Key"
      }
    },
    "required": ["apiKey"]
  }
}
```

**Get Authorization Requirements (OAuth Modules)**

```bash
GET /api/authorize?entityType=attio
Authorization: Bearer ${TOKEN}

Response (200): {
  "type": "oauth2",
  "url": "https://app.attio.com/authorize?client_id=...&redirect_uri=...&scope=...&state=..."
}
```

**Submit Authorization (Create Entity)**

```bash
POST /api/authorize
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "entityType": "quo",
  "data": {
    "apiKey": "your-api-key"
  }
}

Response (200): {
  "entity_id": "7",
  "credential_id": "12",
  "entityType": "quo"
}
```

**Create Entity from Existing Credential**

```bash
POST /api/entity
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "entityType": "hubspot",
  "data": {
    "credential_id": "12"
  }
}

Response (200): {
  "id": "15",
  "type": "hubspot",
  "details": {...}
}
```

**Get Entity Options**

```bash
GET /api/entity/options/${CREDENTIAL_ID}?entityType=hubspot
Authorization: Bearer ${TOKEN}

Response (200): {
  "options": [...],
  "entityType": "hubspot"
}
```

**Test Entity Authentication**

```bash
GET /api/entities/${ENTITY_ID}/test-auth
Authorization: Bearer ${TOKEN}

Response (200): {
  "status": "ok"
}

# Or on error:
Response (400): {
  "errors": [{
    "title": "Authentication Error",
    "message": "There was an error...",
    "timestamp": 1642512000000
  }]
}
```

**Get Entity Details**

```bash
GET /api/entities/${ENTITY_ID}
Authorization: Bearer ${TOKEN}

Response (200): {
  "id": "7",
  "type": "hubspot",
  "credential": {...},
  "details": {...}
}
```

**Get Entity Options by ID**

```bash
POST /api/entities/${ENTITY_ID}/options
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "optionType": "contacts"
}

Response (200): {
  "options": [...]
}
```

**Refresh Entity Options**

```bash
POST /api/entities/${ENTITY_ID}/options/refresh
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "forceRefresh": true
}

Response (200): {
  "options": [...],
  "refreshed": true
}
```

### Integration Management Endpoints

**List Integrations**

```bash
GET /api/integrations
Authorization: Bearer ${TOKEN}

Response (200): {
  "entities": {
    "options": [...],           # Available integration types
    "authorized": [...]         # User's connected entities
  },
  "integrations": [             # User's active integrations
    {
      "id": "16",
      "entities": ["7", "11"],
      "status": "ENABLED",
      "config": {"type": "axiscare"}
    }
  ]
}
```

**Create Integration**

```bash
POST /api/integrations
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "entities": ["7", "11"],
  "config": {
    "type": "attio"
  }
}

Response (201): {
  "id": "16",
  "entities": ["7", "11"],
  "status": "ENABLED",
  "config": {"type": "attio"}
}
```

**Get Integration Details**

```bash
GET /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}

Response (200): {
  "id": "16",
  "entities": ["7", "11"],
  "status": "ENABLED",
  "config": {"type": "attio"}
}
```

**Update Integration**

```bash
PATCH /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "config": {
    "syncDirection": "unidirectional",
    "autoSync": true
  }
}

Response (200): {
  "id": "16",
  "config": {
    "type": "attio",
    "syncDirection": "unidirectional",
    "autoSync": true
  }
}
```

**Delete Integration**

```bash
DELETE /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}

Response (204): {}
```

**Test Integration Authentication**

```bash
GET /api/integrations/${INTEGRATION_ID}/test-auth
Authorization: Bearer ${TOKEN}

Response (200): {
  "status": "ok"
}

# Or on error:
Response (400): {
  "errors": [{...}]
}
```

**Get Integration Config Options**

```bash
GET /api/integrations/${INTEGRATION_ID}/config/options
Authorization: Bearer ${TOKEN}

Response (200): {
  "options": [
    {
      "key": "syncDirection",
      "type": "select",
      "options": ["bidirectional", "unidirectional"]
    }
  ]
}
```

**Refresh Integration Config Options**

```bash
POST /api/integrations/${INTEGRATION_ID}/config/options/refresh
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "forceRefresh": true
}

Response (200): {
  "options": [...],
  "refreshed": true
}
```

**Get Integration Actions**

```bash
GET /api/integrations/${INTEGRATION_ID}/actions
POST /api/integrations/${INTEGRATION_ID}/actions
Authorization: Bearer ${TOKEN}

Response (200): {
  "actions": [
    {
      "id": "INITIAL_SYNC",
      "label": "Initial Sync",
      "description": "Perform initial data synchronization"
    }
  ]
}
```

**Get Action Options**

```bash
GET /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options
Authorization: Bearer ${TOKEN}

Response (200): {
  "options": [...]
}
```

**Refresh Action Options**

```bash
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options/refresh
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "forceRefresh": true
}

Response (200): {
  "options": [...]
}
```

**Execute Integration Action**

```bash
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}
Authorization: Bearer ${TOKEN}
Content-Type: application/json

Body: {
  "parameters": {...}
}

Response (200): {
  "message": "Initial sync started for AxisCare clients",
  "processIds": ["36"],
  "clientObjectTypes": ["clients"]
}

# Common actions:
# - INITIAL_SYNC - Trigger initial data sync
# - SYNC_NOW - Force immediate sync
# - REFRESH_SCHEMA - Refresh integration schema
```

### Database Migration Endpoints

**Trigger Database Migration**

```bash
POST /db-migrate
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Content-Type: application/json

Body: {
  "userId": "admin",
  "dbType": "postgresql",
  "stage": "production"
}

Response (202): {
  "success": true,
  "processId": "mig-1642512000-abc123",
  "state": "INITIALIZING",
  "statusUrl": "/db-migrate/mig-1642512000-abc123",
  "message": "Migration job queued successfully"
}
```

**Check Migration Status**

```bash
GET /db-migrate/status?stage=production
x-frigg-admin-api-key: ${ADMIN_API_KEY}

Response (200): {
  "upToDate": true,
  "pendingMigrations": 0,
  "dbType": "postgresql",
  "stage": "production"
}

# Or if migrations pending:
Response (200): {
  "upToDate": false,
  "pendingMigrations": 3,
  "dbType": "postgresql",
  "stage": "production",
  "recommendation": "Run POST /db-migrate to apply pending migrations"
}
```

**Get Migration Details**

```bash
GET /db-migrate/${MIGRATION_ID}?stage=production
x-frigg-admin-api-key: ${ADMIN_API_KEY}

Response (200): {
  "processId": "mig-1642512000-abc123",
  "type": "DATABASE_MIGRATION",
  "state": "COMPLETED",
  "context": {
    "dbType": "postgresql",
    "stage": "production",
    "migrationCommand": "prisma migrate deploy"
  },
  "results": {
    "success": true,
    "duration": "2.5s"
  },
  "createdAt": "2025-01-18T12:00:00.000Z",
  "updatedAt": "2025-01-18T12:00:02.500Z"
}
```

### OAuth Redirect Endpoint

**OAuth Redirect Handler**

```bash
GET /api/integrations/redirect/${APP_ID}?code=...&state=...

# Redirects to:
${FRONTEND_URI}/redirect/${APP_ID}?code=...&state=...

# Used for OAuth callback handling after third-party authorization
```

### Common Response Codes

- **200 OK** - Successful request
- **201 Created** - Resource successfully created
- **202 Accepted** - Request accepted, processing asynchronously
- **204 No Content** - Successful deletion
- **400 Bad Request** - Invalid request parameters
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource not found
- **500 Internal Server Error** - Server error
- **503 Service Unavailable** - Service not ready (health checks)

## Common Tips & Tricks

### 1. API Module Discovery

Before writing custom API code, check if a module exists:

```bash
frigg search [keyword]
```

### 2. Local Testing with Docker

Use Docker Compose for local MongoDB and LocalStack:

```bash
npm run docker:start
npm run frigg:start
```

### 3. Testing Encryption

Verify encryption is working:

```bash
curl http://localhost:3000/health/detailed
# Check "encryption" section in response
```

### 4. Debugging Integration Issues

1. Check Docker services are running
2. Verify `.env` has required credentials
3. Check integration is registered in app definition
4. Review handler implementation
5. Test API module's `testAuthRequest` method

### 5. Command System for Database Operations

Use Frigg commands instead of direct ORM access:

```javascript
const { createFriggCommands } = require("@friggframework/core");

const commands = createFriggCommands({
  integrationClass: MyIntegration,
});

const user = await commands.findUserByAppUserId("external-user-123");
const credential = await commands.createCredential({
  userId: user.id,
  access_token: "token",
  moduleName: "asana",
});
```

### 6. Scheduler Commands for Scheduled Jobs

Use scheduler commands for one-time scheduled jobs (e.g., notification renewals, delayed tasks):

```javascript
const { createSchedulerCommands } = require("@friggframework/core");

const schedulerCommands = createSchedulerCommands({
  integrationName: "zoho",
});

// Schedule a one-time job
await schedulerCommands.scheduleJob({
  jobId: `renewal-${integrationId}-${Date.now()}`,
  scheduledAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days
  event: "REFRESH_WEBHOOK",
  payload: { integrationId, executionId },
  queueUrl: process.env.ZOHO_QUEUE_URL, // Uses standard Frigg env var
});

// Delete a scheduled job
await schedulerCommands.deleteJob(jobId);

// Check job status
const status = await schedulerCommands.getJobStatus(jobId);
// Returns: { exists: boolean, scheduledAt?: string, state?: string }
```

**Key Features**:

- **AWS EventBridge Scheduler**: Production environment uses EventBridge for reliable scheduling
- **Mock Scheduler**: Local development uses in-memory mock (set `SCHEDULER_PROVIDER=mock`)
- **Auto-cleanup**: Schedules auto-delete after execution (`ActionAfterCompletion: DELETE`)
- **Queue URL to ARN**: Internally derives SQS ARN from queue URL (standard Frigg pattern)
- **Graceful Degradation**: If scheduler not configured, logs warning but doesn't fail

**Environment Variables**:

```bash
# Production (auto-detected)
SCHEDULER_ROLE_ARN=arn:aws:iam::...:role/...  # IAM role for EventBridge
ZOHO_QUEUE_URL=https://sqs...                  # Integration queue URL (Frigg sets this)

# Local Development
SCHEDULER_PROVIDER=mock                         # Use mock scheduler
STAGE=local                                    # Auto-selects mock
```

### 7. Event Handling with Delegate Pattern

**Current Implementation**: Frigg uses a **Delegate pattern** for event propagation (not EventBus).

**How Delegate Works**:

```javascript
const { Delegate } = require("@friggframework/core");

class MyClass extends Delegate {
  constructor(params) {
    super(params);
    this.delegateTypes = ["TOKEN_REFRESHED", "AUTH_FAILED"];
  }

  async onTokenRefresh() {
    await this.notify("TOKEN_REFRESHED", { userId, tokenData });
  }

  async receiveNotification(notifier, delegateString, object) {
    if (delegateString === "TOKEN_REFRESHED") {
      // Handle token refresh notification
    }
  }
}
```

**Future Plans**: Migration to EventBus architecture is planned.

**Note**: The Delegate pattern provides observer-like functionality for communication between components, but is limited compared to a full EventBus implementation.

### 7. VPC Configuration

Always enable VPC for production deployments:

```javascript
const appDefinition = {
  vpc: {
    enable: true, // Deploy in private subnets
    createNew: false, // Use existing VPC (default)
    enableVPCEndpoints: true, // Create VPC endpoints for AWS services
  },
};
```

### 8. Using OSS-Serverless (osls)

Frigg uses **osls** (OSS-Serverless) instead of Serverless Framework v3:

```bash
# The Frigg CLI internally uses osls
frigg build --production
frigg deploy --stage prod

# Advanced: Direct osls usage
osls package --config infrastructure.js
osls deploy --config infrastructure.js --stage prod --verbose
osls info --config infrastructure.js --stage prod
```

**Why osls?**

- Drop-in replacement for Serverless Framework v3
- Open-source and community-maintained
- Compatible with existing serverless.yml configurations
- No vendor lock-in

### 9. Frigg Management UI

Web-based interface for managing integrations:

```bash
# Start Management UI (runs on localhost:3002)
frigg ui

# Features:
# - User session simulation
# - Environment variable management
# - Integration testing
# - Real-time logs and monitoring
# - Code generation
# - AWS resource discovery status
```

**Management UI Capabilities**:

- ✅ Test integrations without deploying
- ✅ Manage environment variables
- ✅ View and simulate user sessions
- ✅ Monitor AWS resources
- ✅ Generate integration code
- ✅ View CloudWatch logs

## Anti-Patterns to Avoid

### Integration Anti-Patterns

- ❌ Don't bypass the integration lifecycle - always extend IntegrationBase
- ❌ Don't hardcode credentials - use encryption and OAuth flows
- ❌ Don't ignore VPC configuration
- ❌ Don't skip signature validation on webhooks
- ❌ Don't create custom infrastructure - use provided templates

### Architecture Anti-Patterns

- ❌ Don't put business logic in handlers
- ❌ Don't call repositories from handlers
- ❌ Don't put orchestration in repositories
- ❌ Don't mix concerns in single files
- ❌ Don't skip dependency injection
- ❌ Don't create "god" use cases

### Development Anti-Patterns

- ❌ Don't assume data structures are always consistent - add null checks
- ❌ Don't make quick fixes without investigating root causes
- ❌ Don't update one package without checking others in monorepo
- ❌ Don't skip running full test suite for both databases

## Development Philosophy

**Quality Over Speed**:

- ✅ Find the **best solution**, not the fastest
- ✅ Think holistically about framework interactions
- ✅ Be thorough - check ALL affected files across packages
- ✅ Maintain consistency with hexagonal architecture
- ✅ Update tests, docs, types together

**When Making Changes**:

1. Investigate root causes first
2. Search entire monorepo for related code
3. Check core package, devtools, API modules, tests, docs
4. Run full test suite
5. Consider both current and future implications

## Key Resources

- **Documentation**: https://docs.friggframework.org
- **Community Slack**: https://friggframework.org/#contact
- **GitHub Repositories**:
  - **Frigg Framework**: https://github.com/friggframework/frigg/tree/next
  - **API Module Library**: https://github.com/friggframework/api-module-library/tree/next
- **Commands README**: `packages/core/application/commands/README.md`
- **Encryption Guide**: `packages/core/database/encryption/README.md`

## Quick Reference

### File Structure

```
packages/core/              # Core framework
├── integrations/          # Base integration classes
├── database/              # Database utilities & Prisma
├── encrypt/               # Cryptor (KMS & AES)
└── handlers/              # Request handlers & routers

packages/devtools/         # Development tools
├── frigg-cli/            # CLI commands (build, deploy, install, start, ui)
├── infrastructure/       # AWS Infrastructure as Code
│   ├── domains/         # Domain builders (DDD)
│   │   ├── networking/  # VPC, subnets, security
│   │   ├── security/    # KMS encryption
│   │   ├── database/    # Aurora, migrations
│   │   ├── parameters/  # SSM Parameter Store
│   │   ├── integration/ # Integration & WebSocket
│   │   └── shared/      # Orchestrator & utilities
│   ├── infrastructure-composer.js  # Main orchestrator
│   └── create-frigg-infrastructure.js  # Entry point
├── management-ui/        # Web-based management interface
└── test/                 # Testing utilities & mocks

packages/serverless-plugin/  # Frigg serverless plugin

api-module-library/        # Pre-built API modules (separate repo)
```

### Essential Patterns

**Integration Definition**:

```javascript
static Definition = {
    name: 'integration-name',
    version: '1.0.0',
    display: { label, description, category },
    modules: { service1: definition, service2: definition },
    routes: [{ path, method, event }]
};
```

**Event Handler**:

```javascript
constructor() {
    super();
    this.events = {
        EVENT_NAME: { handler: this.handlerMethod }
    };
}
```

**API Access**:

```javascript
await this.{moduleName}.api.{method}()
```

## AI Assistant Development Guidelines

### Fast Iteration Pattern

When developing features requiring Frigg framework changes:

**Infrastructure & Core Framework Changes (Fast ~2min iteration)**:

1. **Phase 1: Local Iteration**

   - Edit files directly in `node_modules/@friggframework/{core|devtools|serverless-plugin}/`
   - Run `frigg build --production` to inspect compiled output
   - Verify package sizes, CloudFormation templates
   - Iterate until build output is correct

2. **Phase 2: Upstream & Deploy**
   - Port working changes from node_modules to local `frigg/` repo
   - Run affected tests: `npx jest path/to/changed-file.test.js`
   - Commit and push to trigger canary build (~90s)
   - Install canary: `npm install @friggframework/package@canary`
   - Deploy to hosted environment and verify end-to-end

**API Module Changes (Fast iteration)**:

1. **Phase 1: Local Development**

   - Edit files in `node_modules/@friggframework/api-module-{name}/`
   - Run `frigg start` for local testing
   - Run integration tests
   - Iterate until tests pass

2. **Phase 2: Upstream & Deploy**
   - Port changes to local `api-module-library/{module}/` repo
   - Run full test suite
   - Commit, push, wait for canary
   - Install canary and deploy

### Test-Driven Development (TDD)

**Mandatory TDD Process**:

1. **RED**: Write failing test first
2. **GREEN**: Write minimal code to pass test
3. **REFACTOR**: Clean up while keeping tests green

**When TDD is Required**:

- All business logic (use cases)
- Bug fixes (test reproduces bug first)
- Infrastructure changes affecting deployment
- Any change with non-obvious behavior

**Test Distribution for Features**:

- **Use Cases**: 20-40 comprehensive tests (>90% coverage)
- **Repositories**: 5-10 tests (adapter logic, >80% coverage)
- **Handlers**: 2-4 tests (loading/wiring only)

### Architecture Principles

**Hexagonal Architecture**:

- **Domain Layer**: Pure business logic, no framework dependencies
- **Infrastructure Layer**: Repositories, API clients, external adapters
- **Adapter Layer**: HTTP handlers, Lambda functions, workers (<50 lines)

**Golden Rules**:

- ✅ Handlers ONLY call use cases
- ✅ Use cases contain all business logic
- ✅ Repositories are pure data access
- ✅ Domain entities have behavior
- ✅ Encryption is transparent

### Common Troubleshooting

| Symptom                        | Likely Cause              | Fix                                     |
| ------------------------------ | ------------------------- | --------------------------------------- |
| `Cannot find module './src/*'` | src/ excluded from Lambda | Check if handler needs it; use env vars |
| `handler is undefined`         | Export mismatch           | Verify `module.exports = { handler }`   |
| Port 3306 instead of 5432      | Aurora wrong port         | Set `Port: 5432` explicitly             |
| Lambda can't connect to Aurora | Missing security group    | Add self-referencing SG rule port 5432  |

### Quality Standards

**Before Committing**:

- [ ] Tests written first (TDD)
- [ ] All tests passing locally
- [ ] No linter errors
- [ ] Package sizes verified (if infrastructure change)
- [ ] CloudWatch logs checked (if handler change)
- [ ] Documentation updated (if public API change)

### Canary Workflow

**Publishing**:

- Push to feature branch → GitHub Actions builds canary (~90s)
- Version: `2.0.0--canary.{build}.{commit}.0`
- Check: `npm view @friggframework/package@canary version`

**Installing**:

```bash
npm install @friggframework/core@canary
npm install @friggframework/devtools@canary
```

## When to Use This Skill

Invoke this skill when:

- User asks for Frigg information, guidance, or best practices
- User needs help with Frigg integrations, architecture, or development
- Creating new Frigg integrations
- Working with API modules
- Debugging integration issues
- Following best practices and avoiding anti-patterns
- Setting up local development environment
- Deploying to AWS infrastructure
- Having to run Frigg CLI commands

## Example Workflows

### 1. Creating a New Integration

```javascript
// 1. Install API modules
// frigg install hubspot
// frigg install salesforce

// 2. Create integration class
class HubSpotToSalesforceSync extends IntegrationBase {
  static Definition = {
    name: "hubspot-salesforce-sync",
    modules: {
      hubspot: require("@friggframework/api-module-hubspot"),
      salesforce: require("@friggframework/api-module-salesforce"),
    },
  };

  async syncContacts() {
    const contacts = await this.hubspot.api.getContacts();
    return await this.salesforce.api.createLeads(contacts);
  }
}

// 3. Deploy
// frigg deploy --stage prod
```

### 2. Adding Encrypted Fields

```javascript
// packages/core/database/encryption/encryption-schema-registry.js
const ENCRYPTED_FIELDS = {
  Credential: [
    "data.access_token",
    "data.refresh_token",
    "data.custom_secret", // Add new field
  ],
};
```

### 3. Creating a Use Case

```javascript
class SyncContactsUseCase {
  constructor({ hubspotRepository, salesforceRepository }) {
    this.hubspot = hubspotRepository;
    this.salesforce = salesforceRepository;
  }

  async execute(userId) {
    // Business logic
    const contacts = await this.hubspot.fetchContacts(userId);
    const validated = contacts.filter((c) => c.email);
    return await this.salesforce.createLeads(validated);
  }
}
```
