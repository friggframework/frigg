# Frigg Provider Plugin Architecture

## Status: What Already Exists

The codebase already has multi-provider thinking in several places:

- **Queue system**: `queue-provider-factory.js` switches between `SqsQueueProvider`, `NetlifyBackgroundProvider`, `QStashQueueProvider` based on `QUEUE_PROVIDER` env var or `appDefinition.queue.provider`
- **Scheduler system**: `scheduler-service-factory.js` switches between `EventBridgeSchedulerAdapter`, `NetlifySchedulerAdapter`, `MockSchedulerAdapter`
- **Infrastructure**: `CloudProviderFactory` creates `AWSProviderAdapter` (GCP/Azure are stubs)
- **Netlify adapter**: `@friggframework/netlify-adapter` already works as a separate package with handler wrappers, config generation, and function entry points
- **v2 API routes**: Already mapped in netlify config (`/api/v2/*` → auth function). The integration router has all `/api/v2/*` routes alongside v1.

**The problem**: These pieces don't follow a *consistent plugin shape*. The netlify-adapter exports handler utilities, the queue providers live in core, the scheduler providers live in core, and infrastructure is its own thing. A provider plugin should bundle all of these into one installable package with a predictable interface.

## Design Decisions (Confirmed)

1. **All providers are separate packages** — including AWS. `@friggframework/core` has zero cloud-specific code.
2. **Database is a separate concern** from compute provider. Separate `@friggframework/database-*` packages.
3. **Database infrastructure is optional convenience** in providers. Most users just set `DATABASE_URL`.
4. **Database runtime** (Prisma schema, client, repos, connections) lives in database packages.

## Package Map

```
@friggframework/core                    # Interfaces, ports, framework logic. Zero cloud imports.
@friggframework/provider-aws            # Lambda, SQS, EventBridge, KMS, Secrets Manager, S3
@friggframework/provider-netlify        # Netlify Functions, Background Functions, Scheduled Functions
@friggframework/provider-vercel         # Vercel Functions, QStash, Cron
@friggframework/provider-gcp            # Cloud Functions, Pub/Sub, Cloud Scheduler, Cloud KMS
@friggframework/provider-azure          # Azure Functions, Service Bus, Logic Apps, Key Vault
@friggframework/provider-flyio          # Fly Machines, fly-replay routing
@friggframework/provider-cloudflare     # Workers, Queues, D1, Durable Objects
@friggframework/provider-local          # Express server, Docker Compose, node-cron, in-memory queues

@friggframework/database-postgres       # PostgreSQL Prisma schema, client, repos, migrations
@friggframework/database-mongodb        # MongoDB Prisma schema, client, repos, migrations
```

### Provider ↔ Database Compatibility

Any provider works with any database package. Some providers offer **managed database convenience** (auto-provisioned, dynamic URLs):

| Provider    | Managed DB Convenience         | Also Works With        |
|-------------|-------------------------------|------------------------|
| AWS         | Aurora PostgreSQL, DocumentDB  | Any (via DATABASE_URL) |
| Netlify     | Neon PostgreSQL               | Any (via DATABASE_URL) |
| Vercel      | Neon, PlanetScale             | Any (via DATABASE_URL) |
| GCP         | Cloud SQL, AlloyDB            | Any (via DATABASE_URL) |
| Azure       | Cosmos DB, Azure SQL          | Any (via DATABASE_URL) |
| CloudFlare  | D1 (SQLite), Hyperdrive       | Any (via DATABASE_URL) |
| fly.io      | Fly Postgres, LiteFS          | Any (via DATABASE_URL) |
| Local       | Local PG, Local Mongo          | Any (via DATABASE_URL) |

"Managed DB Convenience" means the provider package includes infrastructure builders for that DB. Everything else is just `DATABASE_URL`.

---

## Provider Plugin Interface

Every provider package exports an object conforming to this shape. Each property is a **capability** — providers implement the capabilities they support and return `null` for ones they don't.

```javascript
// @friggframework/provider-{name}/index.js
module.exports = {
    name: 'aws',  // Unique provider identifier

    // ── Runtime Adapters (used in deployed functions) ──────────────

    // Wrap user's handler function for the platform's runtime
    // Lambda: adds secretsToEnv, callbackWaitsForEmptyEventLoop
    // Netlify: adds serverless-http bridge
    // Vercel: adds edge/serverless adapter
    createHandler,              // (options) => platform-native handler function

    // Wrap an Express router into a platform-native handler
    // (Most providers use serverless-http; some need custom adapters)
    createAppHandler,           // (name, router, shouldUseDb?) => handler

    // Queue adapter — send async jobs, parse incoming queue events
    QueueProvider,              // Class extending core QueueProvider

    // Scheduler adapter — one-time scheduled jobs
    SchedulerAdapter,           // Class extending core SchedulerServiceInterface

    // Encryption adapter — envelope encryption key management
    CryptorAdapter,             // Class extending core Cryptor (KMS, Vault, AES, etc.)

    // Secrets loader — fetch secrets into process.env at startup
    // AWS: Secrets Manager. Vercel/Netlify: env vars (no-op). GCP: Secret Manager.
    loadSecrets,                // async () => void

    // Function invoker — call another function from within a function
    // AWS: Lambda.invoke(). Netlify: HTTP call. Vercel: HTTP call.
    invokeFunctionAdapter,      // { invoke(functionName, payload) }

    // WebSocket adapter — push messages to connected clients
    // AWS: API Gateway Management API. Others: platform-specific or null.
    WebSocketAdapter,           // Class or null

    // Platform-specific utilities (e.g., Lambda TimeoutCatcher)
    utils: {},

    // ── Build-Time / Infrastructure ────────────────────────────────

    // Generate platform config from app definition
    // AWS: serverless.yml. Netlify: netlify.toml. Vercel: vercel.json.
    generateConfig,             // (appDefinition, options?) => string | object

    // Generate environment variable template
    generateEnvTemplate,        // (appDefinition) => { VAR_NAME: 'description' }

    // Infrastructure builders (optional — for managed resources)
    // AWS: VPC, Aurora, KMS, SQS, EventBridge builders
    // Netlify: minimal (Neon auto-provisioned)
    // Local: docker-compose.yml generation
    infrastructureBuilders: [], // InfrastructureBuilder[] for builder orchestrator

    // Validate app definition for this provider
    validate,                   // (appDefinition) => { valid, errors[], warnings[] }

    // Function entry point templates / generators
    // Returns file content for platform-specific function entry points
    getFunctionEntryPoints,     // (appDefinition) => { [filename]: content }

    // ── Metadata ───────────────────────────────────────────────────

    // Which database packages this provider has managed convenience for
    recommendedDatabases: ['database-postgres'],

    // Default env vars this provider sets automatically
    providedEnvVars: ['DATABASE_URL', 'NETLIFY_SITE_ID'],

    // Platform detection — auto-detect if running on this provider
    detect,                     // () => boolean (check env vars like NETLIFY, VERCEL, AWS_LAMBDA_FUNCTION_NAME)
};
```

---

## How Existing Code Maps to This Shape

### Netlify Today → provider-netlify Plugin

| Plugin Interface Property | Existing Code | Location Today | Status |
|---|---|---|---|
| `name` | — | — | NEW (trivial) |
| `createHandler` | `createNetlifyHandler()` | `netlify-adapter/lib/create-netlify-handler.js` | EXISTS |
| `createAppHandler` | `createNetlifyAppHandler()` | `netlify-adapter/lib/create-netlify-app-handler.js` | EXISTS |
| `QueueProvider` | `NetlifyBackgroundProvider` | `core/queues/providers/netlify-background-provider.js` | EXISTS in core — move here |
| `SchedulerAdapter` | `NetlifySchedulerAdapter` | `core/infrastructure/scheduler/netlify-scheduler-adapter.js` | EXISTS in core — move here |
| `CryptorAdapter` | AES (default) | `core/encrypt/Cryptor.js` (AES branch) | Reuse core AES, no custom cryptor needed |
| `loadSecrets` | No-op | — | NEW (trivial — Netlify has env vars natively) |
| `invokeFunctionAdapter` | — | — | NEW (HTTP call to function URL) |
| `WebSocketAdapter` | `null` | — | Not supported on Netlify |
| `generateConfig` | `generateNetlifyToml()` | `netlify-adapter/lib/generate-netlify-config.js` | EXISTS |
| `generateEnvTemplate` | `generateNetlifyEnvTemplate()` | `netlify-adapter/lib/generate-netlify-config.js` | EXISTS |
| `validate` | `validateNetlifyDbConfig()` | `netlify-adapter/lib/netlify-db.js` | EXISTS (partial) |
| `getFunctionEntryPoints` | Function files in `functions/` dir | `netlify-adapter/functions/*.js` | EXISTS as files, needs to become generator |
| `detect` | — | — | NEW: `() => !!process.env.NETLIFY` |

**Verdict**: Netlify is ~80% done. Mainly needs: gather scattered pieces into one plugin shape, move queue/scheduler adapters from core.

### AWS Today → provider-aws Plugin

| Plugin Interface Property | Existing Code | Location Today | Status |
|---|---|---|---|
| `name` | — | — | NEW (trivial) |
| `createHandler` | `createHandler()` | `core/core/create-handler.js` | EXISTS in core — move here |
| `createAppHandler` | `createAppHandler()` | `core/handlers/app-handler-helpers.js` | EXISTS in core — move here |
| `QueueProvider` | `SqsQueueProvider` | `core/queues/providers/sqs-queue-provider.js` | EXISTS in core — move here |
| `SchedulerAdapter` | `EventBridgeSchedulerAdapter` | `core/infrastructure/scheduler/eventbridge-scheduler-adapter.js` | EXISTS in core — move here |
| `CryptorAdapter` | KMS branch of `Cryptor` | `core/encrypt/Cryptor.js` | EXISTS — extract KMS to own class |
| `loadSecrets` | `secretsToEnv()` | `core/core/secrets-to-env.js` | EXISTS in core — move here |
| `invokeFunctionAdapter` | Lambda invoker | `core/database/adapters/lambda-invoker.js` | EXISTS in core — move here |
| `WebSocketAdapter` | API Gateway Management | `core/database/models/WebsocketConnection.js` | EXISTS in core — move here |
| `utils.TimeoutCatcher` | `TimeoutCatcher` | `core/lambda/TimeoutCatcher.js` | EXISTS in core — move here |
| `generateConfig` | Serverless.yml builders | `devtools/infrastructure/` | EXISTS — complex, many builders |
| `generateEnvTemplate` | — | — | NEW |
| `infrastructureBuilders` | VPC, Aurora, KMS, SQS, EventBridge builders | `devtools/infrastructure/domains/` | EXISTS |
| `validate` | `validateAppDefinition()` | Various | EXISTS (partial) |
| `getFunctionEntryPoints` | Serverless handler configs | Generated by infrastructure builders | EXISTS implicitly |
| `detect` | — | — | NEW: `() => !!process.env.AWS_LAMBDA_FUNCTION_NAME` |

**Verdict**: AWS has all the code but it's scattered across core. The work is extraction + reorganization.

### What Core Keeps (Ports/Interfaces)

```
packages/core/
├── queues/
│   └── queue-provider.js                    # Abstract base class (send, batchSend, parseEvent)
├── infrastructure/scheduler/
│   └── scheduler-service-interface.js       # Abstract base class (scheduleOneTime, deleteSchedule, getScheduleStatus)
├── encrypt/
│   └── cryptor-interface.js                 # Abstract base class (generateDataKey, decryptDataKey, encrypt, decrypt)
├── handlers/
│   └── handler-interface.js                 # createHandler contract definition
├── core/
│   └── secrets-interface.js                 # loadSecrets contract
│   └── function-invoker-interface.js        # invoke contract
│   └── websocket-interface.js               # WebSocket adapter contract
│   └── Worker.js                            # Base Worker (uses injected QueueProvider, no SQS imports)
│   └── Delegate.js                          # Unchanged
├── integrations/                            # Unchanged — provider-agnostic
├── modules/                                 # Unchanged — provider-agnostic
├── user/                                    # Unchanged — provider-agnostic
├── credential/                              # Unchanged — provider-agnostic
├── database/
│   ├── encryption/                          # Stays — works with any Cryptor adapter
│   ├── config.js                            # DB_TYPE detection (reads from appDefinition or env)
│   └── prisma.js                            # Prisma client factory (loads from database package)
└── provider-registry.js                     # NEW — resolves installed provider at runtime
```

### Provider Registry (How Core Finds the Provider)

```javascript
// packages/core/provider-registry.js
//
// Resolves the installed provider package at runtime.
// Detection order:
//   1. Explicit: appDefinition.provider (e.g., 'aws', 'netlify')
//   2. Environment: FRIGG_PROVIDER env var
//   3. Auto-detect: Call each installed provider's detect() function
//   4. Fallback: 'local' if @friggframework/provider-local is installed

function resolveProvider(appDefinition) {
    // 1. Explicit declaration
    const explicit = appDefinition?.provider || process.env.FRIGG_PROVIDER;
    if (explicit) {
        return requireProvider(explicit);
    }

    // 2. Auto-detect from environment
    const providerNames = ['aws', 'netlify', 'vercel', 'gcp', 'azure', 'flyio', 'cloudflare'];
    for (const name of providerNames) {
        try {
            const provider = requireProvider(name);
            if (provider.detect()) return provider;
        } catch (e) { /* not installed */ }
    }

    // 3. Fallback to local
    return requireProvider('local');
}

function requireProvider(name) {
    return require(`@friggframework/provider-${name}`);
}
```

---

## Database Plugin Interface

Every database package exports:

```javascript
// @friggframework/database-{type}/index.js
module.exports = {
    name: 'postgres',  // or 'mongodb'

    // ── Runtime ────────────────────────────────────────────────────

    // Prisma client factory — returns configured PrismaClient
    // Handles: client loading, encryption extension, connection options
    createPrismaClient,         // (options?) => PrismaClient

    // Connection management
    connect,                    // async () => PrismaClient
    disconnect,                 // async () => void

    // Repository factories — create repo instances for this DB type
    repositories: {
        createCredentialRepository,
        createIntegrationRepository,
        createUserRepository,
        createEntityRepository,
        createIntegrationMappingRepository,
        // ... all repository factories
    },

    // Schema initialization (MongoDB needs collection creation; PG uses migrations)
    initializeSchema,           // async (prismaClient) => void

    // ── Build-Time ─────────────────────────────────────────────────

    // Prisma schema file path (for code generation)
    schemaPath,                 // Absolute path to schema.prisma

    // Migration support
    getMigrationCommand,        // () => string (e.g., 'npx prisma migrate deploy')

    // ── Metadata ───────────────────────────────────────────────────

    // Database type identifier (matches DB_TYPE env var values)
    dbType: 'postgresql',       // 'postgresql' | 'mongodb' | 'documentdb'

    // Required environment variables
    requiredEnvVars: ['DATABASE_URL'],

    // Validate database configuration
    validate,                   // (appDefinition) => { valid, errors[], warnings[] }
};
```

### How Core Finds the Database Package

```javascript
// packages/core/database/database-registry.js
//
// Similar to provider-registry but for database packages.
// Detection order:
//   1. Explicit: appDefinition.database.type (e.g., 'postgres', 'mongodb')
//   2. Environment: DB_TYPE env var
//   3. Auto-detect: Check which @friggframework/database-* is installed

function resolveDatabase(appDefinition) {
    const dbConfig = appDefinition?.database;

    if (dbConfig?.postgres?.enable) return requireDatabase('postgres');
    if (dbConfig?.mongoDB?.enable) return requireDatabase('mongodb');
    // Legacy: documentdb maps to mongodb package with different connection options
    if (dbConfig?.documentDB?.enable) return requireDatabase('mongodb');

    const envType = process.env.DB_TYPE;
    if (envType === 'postgresql') return requireDatabase('postgres');
    if (envType === 'mongodb' || envType === 'documentdb') return requireDatabase('mongodb');

    throw new Error(
        '[Frigg] No database package configured. Install @friggframework/database-postgres ' +
        'or @friggframework/database-mongodb and configure in your app definition.'
    );
}

function requireDatabase(name) {
    return require(`@friggframework/database-${name}`);
}
```

---

## App Definition Changes

```javascript
// backend/index.js — user's app definition
const Definition = {
    name: 'my-frigg-app',

    // NEW: explicit provider (optional — auto-detected if omitted)
    provider: 'aws',  // 'aws' | 'netlify' | 'vercel' | 'gcp' | 'azure' | 'flyio' | 'cloudflare' | 'local'

    // UNCHANGED: database config
    database: {
        postgres: { enable: true },
        // OR: mongoDB: { enable: true },
    },

    // UNCHANGED: integrations
    integrations: [MyIntegration],

    // SIMPLIFIED: encryption just declares method
    encryption: {
        fieldLevelEncryption: 'provider-default', // 'provider-default' | 'aes' | 'none'
        // Provider decides: AWS→KMS, others→AES
    },

    // SIMPLIFIED: queue/scheduler are provider concerns
    // (Provider chooses its own queue/scheduler implementation)
    // Users CAN override if they want a different queue on a provider:
    queue: {
        provider: 'qstash',  // Override: use QStash instead of provider default
    },
};
```

---

## What Moves Where (File-Level)

### Files That Move to `@friggframework/provider-aws`

| Current Location | What It Does |
|---|---|
| `core/core/create-handler.js` | Lambda handler wrapper (secretsToEnv, callbackWaitsForEmptyEventLoop) |
| `core/core/secrets-to-env.js` | AWS Secrets Manager → process.env |
| `core/core/Worker.js` | SQS client hardcoded in base class → extract SQS parts |
| `core/queues/providers/sqs-queue-provider.js` | SQS queue adapter |
| `core/infrastructure/scheduler/eventbridge-scheduler-adapter.js` | EventBridge scheduler |
| `core/encrypt/Cryptor.js` (KMS branch) | AWS KMS envelope encryption |
| `core/lambda/TimeoutCatcher.js` | Lambda timeout detection |
| `core/database/repositories/migration-status-repository-s3.js` | S3 migration state storage |
| `core/database/adapters/lambda-invoker.js` | Lambda function invocation |
| `core/database/models/WebsocketConnection.js` (API Gateway part) | API Gateway WebSocket |
| `devtools/infrastructure/domains/` (all AWS builders) | CloudFormation generation |
| `packages/serverless-plugin/` | Serverless framework plugin |

### Files That Move to `@friggframework/provider-netlify`

| Current Location | What It Does |
|---|---|
| `devtools/netlify-adapter/lib/create-netlify-handler.js` | Netlify handler wrapper |
| `devtools/netlify-adapter/lib/create-netlify-app-handler.js` | Express→Netlify bridge |
| `devtools/netlify-adapter/lib/generate-netlify-config.js` | netlify.toml generator |
| `devtools/netlify-adapter/lib/netlify-db.js` | Config validation |
| `devtools/netlify-adapter/functions/` | Function entry points |
| `core/queues/providers/netlify-background-provider.js` | Netlify Background queue |
| `core/infrastructure/scheduler/netlify-scheduler-adapter.js` | Netlify scheduler |

### Files That Move to `@friggframework/database-postgres`

| Current Location | What It Does |
|---|---|
| `core/prisma-postgresql/schema.prisma` | PostgreSQL Prisma schema |
| All `*-repository-postgres.js` files | PostgreSQL repo implementations |
| PostgreSQL-specific migration scripts | Schema migrations |

### Files That Move to `@friggframework/database-mongodb`

| Current Location | What It Does |
|---|---|
| `core/prisma-mongodb/schema.prisma` | MongoDB Prisma schema |
| All `*-repository-mongo.js` files | MongoDB repo implementations |
| `core/database/utils/mongodb-schema-init.js` | Collection initialization |
| `core/database/mongoose-models/` (if any remain) | Mongoose compatibility |

### Files That Stay in `@friggframework/core`

| File/Directory | Why It Stays |
|---|---|
| `core/integrations/` | Provider-agnostic integration lifecycle |
| `core/modules/` | API module system (HubSpot, Salesforce, etc.) |
| `core/user/` | User management |
| `core/credential/` | Credential storage |
| `core/syncs/` | Sync orchestration |
| `core/errors/` | Error types |
| `core/logs/` | Logging |
| `core/handlers/routers/` | Express routers (provider-agnostic) |
| `core/queues/queue-provider.js` | Queue interface (port) |
| `core/infrastructure/scheduler/scheduler-service-interface.js` | Scheduler interface (port) |
| `core/database/encryption/` | Encryption extension (works with any Cryptor) |
| `core/database/config.js` | DB type detection |
| `core/database/prisma.js` | Prisma client factory (delegates to database package) |
| All `*-repository-factory.js` files | Factory pattern (delegates to database package) |
| All `*-repository-interface.js` / base classes | Repository contracts |
| `core/core/Delegate.js` | Provider-agnostic delegation |

### Files That Need Refactoring (Mixed Concerns)

| File | Issue | Action |
|---|---|---|
| `core/encrypt/Cryptor.js` | KMS + AES in one class | Split: KMS → provider-aws, AES → core (default), interface → core |
| `core/core/Worker.js` | SQS client hardcoded | Inject QueueProvider instead of hardcoding SQS |
| `core/application/commands/scheduler-commands.js` | `deriveArnFromQueueUrl()` assumes SQS | Make queue ID format provider-agnostic |
| `core/queues/queue-provider-factory.js` | Hardcoded switch on provider names | Use provider registry instead |
| `core/infrastructure/scheduler/scheduler-service-factory.js` | Hardcoded switch on provider names | Use provider registry instead |

---

## Implementation Phases

### Phase 1: Define Interfaces in Core (Non-Breaking)

Add interface files alongside existing code. No moves yet. Existing code continues to work.

- Create `core/provider-registry.js` with `resolveProvider()`
- Create `core/database/database-registry.js` with `resolveDatabase()`
- Create interface files: `cryptor-interface.js`, `handler-interface.js`, `secrets-interface.js`, `function-invoker-interface.js`, `websocket-interface.js`
- Create `core/encrypt/aes-cryptor.js` (extract AES logic from Cryptor.js)
- Refactor `Worker.js` to accept injected QueueProvider
- Refactor `scheduler-commands.js` to be queue-format-agnostic

### Phase 2: Create provider-aws Package (Extract, Don't Rewrite)

Move AWS-specific files to `@friggframework/provider-aws`. Core imports from the provider via the registry. Add `@friggframework/provider-aws` as a dependency of apps (not core).

- Move all files listed in "Files That Move to provider-aws" table
- Wire up provider-registry so existing apps work with `provider: 'aws'` or auto-detect
- Ensure `core` has no `@aws-sdk/*` imports after this phase
- All existing tests pass with provider-aws installed

### Phase 3: Create provider-netlify Package (Extract Existing Work)

Move the netlify-adapter and Netlify-specific queue/scheduler code.

- Move all files listed in "Files That Move to provider-netlify" table
- Implement full provider interface shape

### Phase 4: Create Database Packages (Extract)

Split database runtime into `database-postgres` and `database-mongodb`.

- Move Prisma schemas, repo implementations, migration scripts
- Refactor `prisma.js` to delegate to installed database package
- Refactor all repository factories to delegate to database package
- All existing tests pass with appropriate database package installed

### Phase 5: Create provider-local Package

Docker Compose development experience. Express server, in-memory queues, node-cron, mock encryption.

### Phase 6: Stub Additional Providers

Create package shells with detect() + validate() + generateConfig() for Vercel, GCP, Azure, fly.io, CloudFlare. Community can flesh these out.

### Phase 7: CLI Updates

Update `frigg init` to ask which provider and database. Update `frigg deploy` to delegate to provider's deployment logic.

---

## User Experience After Migration

### New Project Setup
```bash
npm init frigg my-app
# Prompts: Which provider? → aws
# Prompts: Which database? → postgres
# Installs: @friggframework/core, @friggframework/provider-aws, @friggframework/database-postgres
```

### Existing AWS Project Migration
```bash
# 1. Install provider + database packages
npm install @friggframework/provider-aws @friggframework/database-postgres

# 2. Add to app definition
const Definition = {
    provider: 'aws',  // optional if auto-detect works
    database: { postgres: { enable: true } },
    // ... rest unchanged
};

# 3. That's it. Everything else works the same.
```

### Switching Providers
```bash
# Switch from AWS to Netlify
npm uninstall @friggframework/provider-aws
npm install @friggframework/provider-netlify

# Update app definition
const Definition = {
    provider: 'netlify',
    // ... rest unchanged (integrations, database, encryption all portable)
};
```

---

## Cross-Provider Capabilities

Some capabilities are platform-agnostic and work across providers:

| Capability | Package | Works With |
|---|---|---|
| **QStash queue** | Already in core (`qstash-queue-provider.js`) | Any provider (HTTP-based) |
| **AES encryption** | Stays in core (`Cryptor.js` AES branch) | Any provider (no cloud dependency) |
| **Mock scheduler** | Stays in core (`mock-scheduler-adapter.js`) | Local dev on any provider |

**Design implication**: The `queue.provider` override in app definition lets users pick QStash on *any* provider. Provider plugins supply their default queue implementation, but it's not locked. Same for encryption — AES is always available; KMS is an AWS provider bonus.

## Other Providers Worth Listing

Beyond the initial 8, these are plausible future providers:

- **Railway** — Container-based, managed Postgres, cron jobs
- **Render** — Similar to Railway, background workers, cron
- **DigitalOcean App Platform** — Functions + managed DB
- **Supabase** — Edge Functions + Postgres (they ARE the database)
- **Deno Deploy** — Deno-native serverless
- **Fastly Compute** — WASM-based edge compute

These don't need packages now but the interface should accommodate them.
