# CLAUDE.md - Frigg Framework

This file provides guidance to Claude Code when working with the Frigg Framework, an enterprise-grade serverless integration framework.

## Critical Context (Read First)

- **Framework**: Frigg Integration Framework - serverless native integrations at scale
- **Main Purpose**: Direct/native integrations between products and external software partners
- **Core Architecture**: Node.js serverless framework with opinionated structure for enterprise integrations
- **Key Value Prop**: Spin up integrations in minutes, deploy to production in a day
- **Deployment Target**: AWS Lambda with serverless framework, Docker Compose for local dev
- **DO NOT**: Create vendor lock-in solutions or bypass the framework's security/encryption patterns

## Framework Architecture

### Core Philosophy

Build enterprise-grade integrations as simply as `frigg init`. Framework handles the infrastructure, developers focus on integration logic.

### Monorepo Structure

```
frigg/
├── packages/core/              # Core framework functionality
│   ├── integrations/          # Base integration classes
│   ├── database/              # MongoDB utilities & connectors
│   ├── encrypt/               # KMS field-level encryption
│   ├── lambda/                # AWS Lambda utilities
│   ├── handlers/              # Request handlers & middleware
│   └── module-plugin/         # Plugin system for extensions
├── packages/devtools/         # Development & deployment tools
│   ├── frigg-cli/            # Command-line interface
│   ├── infrastructure/       # AWS infrastructure as code
│   └── management-ui/        # Admin interface
├── api-module-library/        # Pre-built API integrations
└── docs/                     # Framework documentation
```

### Integration Lifecycle

1. **Define**: Create integration class extending IntegrationBase
2. **Configure**: Set up OAuth flows, webhooks, form definitions
3. **Deploy**: Use frigg CLI for infrastructure and deployment
4. **Scale**: Framework handles serverless scaling automatically

## Essential Commands

### Development Workflow

```bash
# Create new Frigg app
frigg init my-integration

# Install API modules
frigg install hubspot
frigg install salesforce
frigg search crm

# Local development
frigg start                    # Start local server with hot reload
npm test                       # Run framework tests
npm run test:all              # Test all workspaces

# Deployment
frigg deploy --stage prod     # Deploy to production
frigg deploy --stage dev      # Deploy to development
```

### Framework Development

```bash
# Monorepo management
npm run test:all              # Test all packages
npm run use:engine            # Set Node.js version from engines
lerna publish                 # Publish all packages

# API Module Testing
npm run test:api-module-managers  # Test API module managers with watch mode
```

## Pull Request Guidelines

When contributing to the Frigg Framework, follow these guidelines for creating pull requests:

### Target Branch

- **Always create PRs targeting the `next` branch** - Never PR directly to `main`
- The `next` branch is used for pre-release versions and testing before stable releases

### Required Labels

Always add **both** of these labels to your PR:

- `release` - Triggers a new release version
- `prerelease` - Creates a pre-release version (e.g., `2.0.0-next.63`)

These labels ensure automated versioning and npm publishing via GitHub Actions.

### Pre-PR Checklist

Before creating a pull request, ensure:

1. **Project compiles successfully**:
   ```bash
   npm install
   npm run test:all
   ```

2. **No linting errors**:
   ```bash
   npm run lint:fix
   ```

3. **Changes are tested** - Add or update tests for your changes

### PR Workflow Example

```bash
# 1. Create feature branch from next
git checkout next
git pull origin next
git checkout -b fix/your-fix-description

# 2. Make changes and verify compilation
npm install
npm run test:all

# 3. Commit and push
git add .
git commit -m "fix(package): description of the fix"
git push -u origin fix/your-fix-description

# 4. Create PR targeting next branch with required labels
gh pr create --base next \
  --title "fix(package): description" \
  --body "## Summary\n- Your changes\n\n## Test plan\n- [ ] Tests pass" \
  --label "release" \
  --label "prerelease"
```

## Core Package Architecture (@friggframework/core)

### Integration Base Class Pattern

All integrations extend `IntegrationBase` with standardized methods:

```javascript
class MyIntegration extends IntegrationBase {
  // Authentication & setup
  async authRequest(params) {
    /* OAuth flow */
  }

  // Form management for Asana-style integrations
  async loadForm(params) {
    /* Dynamic form generation */
  }
  async onFormSubmit(params) {
    /* Process submissions */
  }

  // Webhook handling
  async onchange(params) {
    /* Handle watched field changes */
  }

  // Background processing
  async processJob(job) {
    /* Async job processing */
  }
}
```

### Integration Patterns (Sync, Queues, Webhooks)

For complex integrations requiring sync orchestration, queue management, and webhook handling, see the **[Integration Patterns Guide](/docs/guides/INTEGRATION-PATTERNS.md)**.

Key patterns covered:

- **Process Model**: Track long-running operations with state management (`INITIALIZING` → `PROCESSING` → `COMPLETED`)
- **friggCommands**: Standardized interface for persisting integration config (`createFriggCommands()`)
- **QueueManager**: AWS SQS wrapper for async job processing with rate limiting and fan-out
- **Integration Events**: Define `USER_ACTION`, `CRON`, `QUEUE`, and `WEBHOOK` event handlers
- **SyncOrchestrator**: Coordinate sync operations across entity types

Quick example:

```javascript
const { createFriggCommands } = require('@friggframework/core');

class MyIntegration extends IntegrationBase {
    constructor(params) {
        super(params);
        this.commands = createFriggCommands({ integrationClass: MyIntegration });

        this.events = {
            INITIAL_SYNC: { type: 'USER_ACTION', handler: this.startSync.bind(this) },
            ONGOING_SYNC: { type: 'CRON', handler: this.deltaSync.bind(this) },
            PROCESS_BATCH: { handler: this.processBatch.bind(this) }
        };
    }
}
```

### Encryption & Security

- **Field-Level Encryption**: Transparent database-agnostic encryption via Prisma Client Extensions
- **AWS KMS Integration**: Enterprise-grade encryption with envelope encryption pattern (recommended for production)
- **AES Encryption**: Alternative encryption method for any environment including production
- **Environment-Based**: Auto-bypass in dev/test/local stages
- **OAuth2 Standardization**: Framework handles OAuth flows across API modules
- **Signature Validation**: HMAC signature validation for webhook security
- **VPC Support**: Lambda functions deployed in private subnets

### Database Layer

- **Multi-Database Support**: MongoDB and PostgreSQL via Prisma ORM
- **Database-Agnostic Encryption**: Same encryption logic for all databases
- **Transparent Encryption**: Repositories work with plain data, encryption automatic
- **Automatic Encryption**: Sensitive fields encrypted at rest via Prisma extension
- **Connection Management**: Automatic connection pooling and management
- **Schema Evolution**: Prisma migrations for database changes

### Field-Level Encryption Architecture

**Purpose**: Encrypt sensitive data at application layer (database-agnostic)

**Components** (`packages/core/database/encryption/`):

```
encryption-schema-registry.js      # Defines which fields are encrypted per model
field-encryption-service.js        # Orchestrates field-level encryption/decryption
prisma-encryption-extension.js     # Prisma Client Extension for transparent encryption
README.md                          # Complete configuration and usage guide
```

**Encryption Flow**:

```
Application Code (Use Cases)
    ↓ works with plain data
Repositories
    ↓ works with plain data
Prisma Extension (transparent encryption)
    ↓ encrypts before write, decrypts after read
Cryptor (Infrastructure Layer)
    ↓ AWS KMS or AES encryption
Database (encrypted storage)
```

**Hexagonal Architecture Alignment**:

- **Domain/Application Layer**: Use cases and repositories work with plain data
- **Infrastructure Layer**: Prisma extension handles encryption transparently
- **External Services**: Cryptor adapts AWS KMS and crypto library

**Configuration** (`packages/core/database/prisma.js`):

```javascript
// Automatic based on environment variables
const encryptionConfig = getEncryptionConfig();
// Returns: { enabled: boolean, method: 'kms' | 'aes' }

if (encryptionConfig.enabled) {
  const cryptor = new Cryptor({
    shouldUseAws: encryptionConfig.method === "kms",
  });
  client = client.$extends(
    createEncryptionExtension({ cryptor, enabled: true })
  );
}
```

**Environment Variables**:

```bash
# Production (AWS KMS - recommended)
KMS_KEY_ARN=arn:aws:kms:...      # AWS KMS key (auto-discovered)
STAGE=production

# AES Encryption (valid for any environment)
AES_KEY_ID=local-dev-key
AES_KEY=your-32-char-key
STAGE=production                  # Can be used in production

# Stages that bypass: dev, test, local
```

**Encrypted Fields** (defined in `encryption-schema-registry.js`):

- **Credential**: `data.access_token`, `data.refresh_token`, `data.domain`, `data.id_token`
- **IntegrationMapping**: `mapping` (complete object)
- **User**: `hashword` (password hash)
- **Token**: `token` (authentication token)

**Adding New Encrypted Fields**:

1. Open `packages/core/database/encryption/encryption-schema-registry.js`
2. Add field path to appropriate model
3. Deploy - encryption applied automatically

**Testing Encryption**:

```bash
# Health check endpoint verifies encryption
curl http://localhost:3000/health/detailed

# Check encryption status in response
{
    "checks": {
        "encryption": {
            "status": "enabled",
            "testResult": "Encryption and decryption verified successfully"
        }
    }
}
```

**See Also**:

- Complete guide: `packages/core/database/encryption/README.md`
- Cryptor adapter: `packages/core/encrypt/Cryptor.js`
- Health endpoint: `packages/core/handlers/routers/health.js`

## DevTools Package (@friggframework/devtools)

### Infrastructure as Code

Located in `packages/devtools/infrastructure/`:

- **Serverless Template Generator**: Creates complete serverless.yml configurations
- **AWS Discovery**: Automatically discovers existing AWS resources (VPC, subnets, KMS keys)
- **Build-Time Discovery**: Integrates AWS discovery into deployment process
- **IAM Generator**: Creates minimal IAM policies for deployments

### Frigg CLI Features

```bash
frigg install <module>        # Install and configure API modules
frigg start                   # Local development server
frigg deploy                  # Infrastructure deployment
frigg search <term>           # Search available API modules
```

### Development Tools

- **Mock API**: `nock`-based HTTP request mocking for tests
- **Test Utilities**: Integration validation and testing helpers
- **Management UI**: Web interface for managing integrations
- **Migration System**: Database and configuration migrations

## Security & Compliance Patterns

### OAuth2 Implementation

```javascript
// Standardized OAuth configuration
{
    oauth: {
        authorizationUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
        scopes: ['read', 'write']
    }
}
```

### Encryption Configuration

```javascript
const appDefinition = {
  encryption: {
    useDefaultKMSForFieldLevelEncryption: true,
  },
  vpc: {
    enable: true, // Deploy in private subnets
  },
};
```

### Webhook Security

- HMAC signature validation on all webhook endpoints
- Request expiration validation to prevent replay attacks
- Stateless CSRF protection for OAuth flows

## API Module Library Integration

### Installing Modules

The framework includes a library of pre-built API modules:

- **CRM Systems**: HubSpot, Salesforce, Pipedrive
- **Communication**: Slack, Microsoft Teams, Discord
- **Project Management**: Asana, Monday.com, Trello
- **Storage**: Google Drive, Dropbox, Box

### Module Structure

```javascript
// Each API module provides:
{
    Definition: IntegrationClass,
    Api: ApiClass,           // HTTP client wrapper
    Config: ConfigClass,     // Configuration management
    Tests: TestSuite        // Validation tests
}
```

## Testing Strategy

### Test Categories

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **API Module Tests**: Live API testing (excluded from CI)
- **Infrastructure Tests**: CloudFormation template validation

### Mock Patterns

```javascript
// Use framework's mock API for consistent testing
const { mockApi } = require("@friggframework/devtools/test/mock-api");

// Mock external API calls
mockApi.mockHttpRequests("hubspot", {
  "/contacts": { status: 200, data: mockContacts },
});
```

## Deployment Architecture

### Infrastructure Phases

1. **Phase 1-2**: Basic serverless deployment with VPC and encryption
2. **Phase 3**: Enhanced monitoring, CDN, code generation, CI/CD pipelines

### Environment Configuration

```javascript
// App definition drives infrastructure generation
const appDefinition = {
  name: "my-integration",
  provider: "aws",
  vpc: { enable: true },
  ssm: { enable: true },
  websockets: { enable: true }, // Phase 3
  integrations: [{ Definition: { name: "hubspot" } }],
};
```

### Resource Discovery

Framework automatically discovers and uses existing AWS resources:

- Default VPC and security groups
- Private subnets for Lambda deployment
- Customer-managed KMS keys
- Route tables for VPC endpoints

## DDD/Hexagonal Architecture Patterns

The Frigg Framework follows Domain-Driven Design (DDD) and Hexagonal Architecture principles to ensure clean separation of concerns, testability, and maintainability.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ Adapter Layer (Handlers/Routers)                       │
│  - HTTP request/response handling                      │
│  - Route definitions                                   │
│  - Status code mapping                                 │
│  - ONLY calls use cases                                │
└────────────────┬────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────┐
│ Application Layer (Use Cases)                          │
│  - Business logic orchestration                        │
│  - Workflow coordination                               │
│  - Business rules and validation                       │
│  - Calls repositories for data access                  │
└────────────────┬────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────┐
│ Infrastructure Layer (Repositories)                    │
│  - Pure database operations (CRUD)                     │
│  - External API calls                                  │
│  - File system access                                  │
│  - NO business logic                                   │
└────────────────┬────────────────────────────────────────┘
                 │ accesses
┌────────────────▼────────────────────────────────────────┐
│ External Systems                                        │
│  - MongoDB, PostgreSQL                                 │
│  - AWS Services (KMS, S3, SQS)                        │
│  - Third-party APIs                                    │
└─────────────────────────────────────────────────────────┘
```

### Repository Pattern

**Purpose**: Abstract data access and external system interactions into dedicated classes.

**Structure**:

```javascript
// packages/core/database/health-check-repository.js
class HealthCheckRepository {
  /**
   * Get database connection state
   * Pure database operation - no business logic
   */
  getDatabaseConnectionState() {
    const stateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const readyState = mongoose.connection.readyState;
    return {
      readyState,
      stateName: stateMap[readyState],
      isConnected: readyState === 1,
    };
  }

  /**
   * Ping database to verify connectivity
   * Returns raw response time - no interpretation
   */
  async pingDatabase(maxTimeMS = 2000) {
    const pingStart = Date.now();
    await mongoose.connection.db.admin().ping({ maxTimeMS });
    return Date.now() - pingStart;
  }
}
```

**Key Principles**:

- ✅ **Atomic operations only** - Each method does one database/API operation
- ✅ **Returns raw data** - No business logic or interpretation
- ✅ **No orchestration** - Doesn't coordinate multiple operations
- ✅ **Thin wrapper** - Minimal logic beyond the actual data access
- ❌ **No business rules** - Doesn't decide what data means
- ❌ **No workflow** - Doesn't determine what happens next

**Real Examples from Codebase**:

- `HealthCheckRepository` - Database health operations
- `SyncRepository` - Sync object CRUD operations
- `IntegrationMappingRepository` - Integration mapping persistence
- `TokenRepository` - Authentication token management
- `WebsocketConnectionRepository` - WebSocket connection tracking

### Use Case Pattern

**Purpose**: Contain business logic, orchestration, and decision-making.

**Structure**:

```javascript
// packages/core/database/use-cases/check-database-health-use-case.js
class CheckDatabaseHealthUseCase {
  constructor({ healthCheckRepository }) {
    this.repository = healthCheckRepository; // Dependency injection
  }

  async execute() {
    // Get raw data from repository
    const { stateName, isConnected } =
      this.repository.getDatabaseConnectionState();

    // Business logic: determine health status
    const result = {
      status: isConnected ? "healthy" : "unhealthy",
      state: stateName,
    };

    // Orchestration: conditionally ping if connected
    if (isConnected) {
      result.responseTime = await this.repository.pingDatabase(2000);
    }

    return result;
  }
}
```

**Key Principles**:

- ✅ **Business logic** - Makes decisions about what data means
- ✅ **Orchestration** - Coordinates multiple repository calls
- ✅ **Validation** - Enforces business rules
- ✅ **Dependency injection** - Receives repositories via constructor
- ✅ **Single responsibility** - One use case per business operation
- ❌ **No direct database access** - Always goes through repositories
- ❌ **No HTTP concerns** - Doesn't handle status codes or headers

**Real Examples from Codebase**:

- `CheckDatabaseHealthUseCase` - Orchestrates database health checking
- `TestEncryptionUseCase` - Coordinates encryption testing with verification logic
- `AuthenticateUserUseCase` - Handles user authentication workflow
- `GenerateFormMetadataUseCase` - Creates form metadata with business rules
- `SubmitFormUseCase` - Processes form submissions with validation

### Handler/Adapter Pattern

**Purpose**: Translate HTTP/SQS/Lambda events into use case calls and format responses.

**Structure**:

```javascript
// packages/core/handlers/routers/health.js (GOOD PATTERN)
const healthCheckRepository = new HealthCheckRepository();
const checkDatabaseHealthUseCase = new CheckDatabaseHealthUseCase({
  healthCheckRepository,
});

router.get("/health/ready", async (_req, res) => {
  // Call use case (NOT repository directly)
  const dbHealth = await checkDatabaseHealthUseCase.execute();

  // Business decision: determine readiness
  const isDbReady = dbHealth.status === "healthy";
  const isReady = isDbReady && areModulesReady;

  // HTTP-specific: map to status code and JSON response
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    timestamp: new Date().toISOString(),
    checks: { database: isDbReady, modules: areModulesReady },
  });
});
```

**Key Principles**:

- ✅ **HTTP-specific logic only** - Status codes, headers, response formatting
- ✅ **Calls use cases** - Never calls repositories directly
- ✅ **Thin adapter** - Minimal logic, delegates to use cases
- ✅ **Error mapping** - Translates domain errors to HTTP errors
- ❌ **No business logic** - Doesn't contain domain rules or orchestration
- ❌ **No database access** - Never imports or uses repositories

### Dependency Injection Pattern

**Structure**:

```javascript
// Good: Use case receives dependencies via constructor
class ProcessAttachmentUseCase {
  constructor({ asanaRepository, frontifyRepository, fileStorageRepository }) {
    this.asanaRepo = asanaRepository;
    this.frontifyRepo = frontifyRepository;
    this.fileStorage = fileStorageRepository;
  }

  async execute(attachmentId) {
    const attachment = await this.asanaRepo.getAttachment(attachmentId);
    const file = await this.fileStorage.download(attachment.url);
    return await this.frontifyRepo.uploadAsset(file);
  }
}

// Usage in handler
const useCase = new ProcessAttachmentUseCase({
  asanaRepository: new AsanaRepository(),
  frontifyRepository: new FrontifyRepository(),
  fileStorageRepository: new S3Repository(),
});
```

**Benefits**:

- Easy to test (mock repositories)
- Clear dependencies
- Flexible implementation swapping
- Follows SOLID principles

### The Golden Rule

> **"Handlers/Adapters ONLY call Use Cases, NEVER Repositories or Business Logic directly"**

**Correct Dependency Direction**:

```
Handler → Use Case → Repository → Database/External System
```

**❌ WRONG - Handler calls repository directly**:

```javascript
router.get("/health", async (req, res) => {
  const state = healthCheckRepository.getDatabaseConnectionState(); // ❌ WRONG
  res.json({ healthy: state.isConnected });
});
```

**✅ CORRECT - Handler calls use case**:

```javascript
router.get("/health", async (req, res) => {
  const health = await checkDatabaseHealthUseCase.execute(); // ✅ CORRECT
  res.json({ healthy: health.status === "healthy" });
});
```

### When to Create Use Cases

**Create a use case when**:

- Coordinating multiple repository calls
- Applying business rules or validation
- Making decisions based on data
- Orchestrating a workflow
- Need to reuse logic in multiple handlers/contexts

**Example Scenarios**:

- ✅ Checking database health with ping and state interpretation
- ✅ Processing form submissions with validation
- ✅ Syncing data between systems with conflict resolution
- ✅ Generating dynamic forms based on configuration

**Don't create use case for**:

- ❌ Simple CRUD operations (direct repository call is fine in handler for trivial cases)
- ❌ Pure data transformation without business logic
- ❌ Simple pass-through operations

### Testing Benefits

**Repository Testing** (Infrastructure):

```javascript
test("HealthCheckRepository.pingDatabase returns response time", async () => {
  const repo = new HealthCheckRepository();
  const time = await repo.pingDatabase(2000);
  expect(time).toBeGreaterThan(0);
});
```

**Use Case Testing** (Business Logic):

```javascript
test("CheckDatabaseHealthUseCase returns unhealthy when disconnected", async () => {
  const mockRepo = {
    getDatabaseConnectionState: () => ({
      stateName: "disconnected",
      isConnected: false,
    }),
  };
  const useCase = new CheckDatabaseHealthUseCase({
    healthCheckRepository: mockRepo,
  });
  const result = await useCase.execute();

  expect(result.status).toBe("unhealthy");
  expect(result.state).toBe("disconnected");
});
```

**Handler Testing** (HTTP Adapter):

```javascript
test("GET /health/ready returns 503 when database unhealthy", async () => {
  // Mock use case
  const mockUseCase = { execute: async () => ({ status: "unhealthy" }) };

  const res = await request(app).get("/health/ready");
  expect(res.status).toBe(503);
});
```

### Migration Path for Existing Code

**If you find code that violates these patterns**:

1. **Identify business logic in handlers** - Extract to use cases
2. **Find direct database access** - Move to repositories
3. **Locate orchestration in repositories** - Move to use cases
4. **Create use cases incrementally** - Start with most complex logic
5. **Write tests** - Validate behavior before and after refactoring

**Example**: See `packages/core/handlers/routers/HEALTHCHECK.md` TODO section for health.js refactoring plan.

## Development Principles

**CRITICAL: Quality Over Speed**

When working on the Frigg Framework, always prioritize finding the **best solution** over quick fixes:

✅ **Do the right thing, not the fast thing**

- Investigate root causes before implementing fixes
- Prefer defensive coding patterns that handle edge cases
- Consider both current and future implications of changes

✅ **Think holistically**

- Understand how different parts of the framework interact
- Check for similar patterns elsewhere in the codebase (packages/core, packages/devtools, api-modules)
- Maintain consistency with hexagonal architecture patterns
- Update tests, documentation, type definitions, and related code together

✅ **Avoid potentially breaking actions**

- Never assume data structures are always consistent
- Add null/undefined checks for optional properties

✅ **Be thorough, not lazy**

- Search the entire monorepo for related occurrences
- Update ALL affected files across all packages, not just the obvious ones
- Check core package, devtools, API modules, tests, documentation, type definitions, and examples
- Run the full test suite for both databases to catch unexpected issues
- Review changes carefully to ensure no unintended side effects

## Anti-Patterns to Avoid

### Integration & Framework Anti-Patterns

❌ **Don't bypass the integration lifecycle** - Always extend IntegrationBase
❌ **Don't hardcode credentials** - Use the encryption system and OAuth flows
❌ **Don't ignore VPC configuration** - Security requires private subnet deployment
❌ **Don't skip signature validation** - All webhooks must validate signatures
❌ **Don't create custom infrastructure** - Use the provided templates and discovery
❌ **Don't mix async/sync patterns** - Use the job queue for background processing
❌ **Don't bypass the plugin system** - Extend functionality through proper channels

### DDD/Hexagonal Architecture Anti-Patterns

❌ **Don't put business logic in handlers** - Extract to use cases
❌ **Don't call repositories from handlers** - Always go through use cases
❌ **Don't put orchestration in repositories** - Keep repositories atomic
❌ **Don't mix concerns in single files** - Separate handlers, use cases, repositories
❌ **Don't make repositories decide business outcomes** - That's the use case's job
❌ **Don't skip dependency injection** - Always inject repositories into use cases
❌ **Don't directly access infrastructure from use cases** - Use repositories as adapters
❌ **Don't create "god" use cases** - Keep use cases focused on single operations

## Development Best Practices

### Integration Development

1. Start with `frigg init` for consistent structure
2. Use existing API modules when possible
3. Follow the IntegrationBase method contracts
4. Implement proper error handling and logging
5. Use the encryption system for sensitive data

### Testing Approach

1. Write unit tests for integration logic
2. Use mock API for external service testing
3. Include integration tests for complete workflows
4. Test OAuth flows with real credentials in development
5. Validate infrastructure templates before deployment

### Performance Optimization

- Use provisioned concurrency for critical Lambda functions
- Implement proper database connection pooling
- Cache frequently accessed data appropriately
- Monitor and optimize cold start times
- Use VPC endpoints to reduce NAT Gateway costs

## Framework Extensions

### Custom API Modules

Create new API modules following the established patterns:

1. Extend IntegrationBase for integration logic
2. Create Api class for HTTP client wrapper
3. Implement Config class for configuration management
4. Add comprehensive test suite
5. Submit to api-module-library for community use

### Plugin Development

Extend core functionality through the module-plugin system:

1. Create plugin following the established interface
2. Register plugin in app definition
3. Include documentation and examples
4. Test thoroughly with multiple integration types

## Community & Support

- **Documentation**: https://docs.friggframework.org
- **Community Slack**: Join via https://friggframework.org/#contact
- **GitHub**: https://github.com/friggframework/frigg
- **Issues**: Report bugs and request features via GitHub issues
- **Contributing**: See CONTRIBUTING.md for contribution guidelines

## Version Management

Framework uses semantic versioning with automated releases:

- **Major**: Breaking API changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes and improvements

Current stable version: v2.0.0-next.0 (pre-release)
Recommended Node.js: >=18
Recommended npm: >=9
