# FRIGG FRAMEWORK - QUICK REFERENCE GUIDE

## Key Statistics

| Metric | Value |
|--------|-------|
| **Framework Version** | 1.2.2 |
| **Total JS Files** | 72 (core package) |
| **Test Files** | 133 |
| **Integration Code** | 1,111 lines |
| **Packages** | 7 (core, devtools, test, ui, configs) |
| **Database Models** | 10+ |
| **Auth Methods** | 4 (OAuth2, Basic, API Key) |
| **Architecture Pattern** | Plugin-based Monorepo |

---

## Core Components

### 1. Integration System
```
IntegrationBase (Abstract)
├── IntegrationFactory (Creates instances)
├── IntegrationModel (MongoDB storage)
├── IntegrationRouter (Express API)
└── IntegrationMapping (Data mapping)
```

### 2. Module Plugin Architecture
```
ModuleManager (Base)
├── EntityManager (Multiple entity types)
├── Auther (Authorization/credentials)
├── ModuleFactory (Instance creation)
└── Entity (API resources)
```

### 3. Authentication
```
Requester (Base HTTP client)
├── OAuth2Requester (4 grant types)
├── BasicAuthRequester (HTTP Basic)
└── ApiKeyRequester (Header-based)
```

### 4. Database Models
- UserModel / IndividualUser / OrganizationUser
- Token (with bcrypt hashing)
- State (generic mixed type)
- Entity (API resource repr.)
- Credential (encrypted storage)
- Integration (config storage)
- IntegrationMapping (external ID tracking)
- Association (relationship tracking)

---

## Design Patterns

| Pattern | Files | Purpose |
|---------|-------|---------|
| **Delegate** | Delegate.js | Event notification / loose coupling |
| **Factory** | IntegrationFactory.js, ModuleFactory.js | Instance creation |
| **Plugin** | load-installed-modules.js | Dynamic module discovery |
| **Repository** | Entity.upsert(), Mapping.upsert() | CRUD with defaults |
| **Observer** | notify()/receiveNotification() | Event handling |

---

## Security Features

✓ **Encryption at Rest**
- Dual strategy: AWS KMS or local AES
- Field-level encryption via Mongoose plugin
- Key rotation support (deprecated key handling)

✓ **Authentication**
- Bcrypt token hashing
- Token expiration enforcement
- Multiple auth mechanisms
- Credential isolation

✓ **Environment Security**
- AWS Secrets Manager integration
- Environment variable-based config
- No hardcoded secrets

---

## Serverless Optimization

1. **Connection Reuse**
   - `callbackWaitsForEmptyEventLoop: false`
   - Connection pooling between invocations

2. **Fail-Fast**
   - `bufferCommands: false` (no mongoose queuing)
   - Fail immediately if disconnected

3. **Timeout Management**
   - TimeoutCatcher for cleanup
   - Configurable cleanup grace period

4. **Async Queuing**
   - SQS Worker pattern
   - Message-based job processing

---

## REST API Endpoints

```
GET    /api/integrations           - List all
POST   /api/integrations           - Create new
PATCH  /api/integrations/:id       - Update config
DELETE /api/integrations/:id       - Remove

GET    /api/entities               - List entities
GET    /api/authorize              - Authorization flow
```

All endpoints require authenticated user.

---

## Error Hierarchy

```
Error
└── BaseError
    ├── HaltError (don't retry)
    ├── FetchError (HTTP details)
    ├── RequiredPropertyError (missing param)
    └── ParameterTypeError (type mismatch)
```

**Key Feature**: FetchError captures full HTTP context for debugging.

---

## Database Configuration

```javascript
{
  useNewUrlParser: true,
  bufferCommands: false,      // Serverless
  autoCreate: false,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
}
```

---

## OAuth2 Grant Types

1. **authorization_code** - Standard 3-legged flow
2. **refresh_token** - Token refresh with auto-retry
3. **password** - Username/password exchange
4. **client_credentials** - Server-to-server auth

**Auto-retry on 401**: Failed token refresh triggers INVALID_AUTH event

---

## Retry Logic

```
Backoff: [1, 3, 10, 30, 60, 180] seconds

Retries on:
- Connection reset (ECONNRESET)
- Rate limit (429)
- Server error (5xx)
- Unauthorized with refresh (401)
```

---

## Module Discovery

```javascript
// Loads packages matching pattern: frigg-module-*
loadInstalledModules()
// Returns array of module definitions from package.json
```

---

## Key Files by Purpose

### Authentication
- `module-plugin/requester/oauth-2.js` - OAuth2 implementation
- `module-plugin/requester/requester.js` - Base HTTP client
- `module-plugin/auther.js` - Auth management

### Encryption
- `encrypt/encrypt.js` - Mongoose plugin
- `encrypt/Cryptor.js` - Key management
- `encrypt/aes.js` - Local encryption

### Database
- `database/mongo.js` - Connection management
- `database/models/*.js` - Schema definitions

### API
- `integrations/integration-router.js` - Express routes
- `integrations/integration-factory.js` - Instance creation

### Lambda
- `core/create-handler.js` - Lambda wrapper
- `core/Worker.js` - SQS processor
- `lambda/TimeoutCatcher.js` - Timeout management

### Errors
- `errors/fetch-error.js` - HTTP error details
- `errors/base-error.js` - Custom error base

---

## Environment Variables

### Database
- `MONGO_URI` - MongoDB connection string

### Encryption
- `STAGE` - Environment (dev, test, prod)
- `KMS_KEY_ARN` - AWS KMS key ARN
- `AES_KEY` - Local encryption key
- `AES_KEY_ID` - Key identifier
- `DEPRECATED_AES_KEY` - Old key for rotation

### AWS
- `AWS_REGION` - Lambda region
- `SECRET_ARN` - Secrets Manager ARN

### Encryption Bypass
- `BYPASS_ENCRYPTION_STAGE` - Comma-separated stages to skip encryption

---

## Common Tasks

### Add New Integration Type
1. Create class extending `IntegrationBase`
2. Define static `Config` with events
3. Implement required methods
4. Register in `IntegrationFactory`

### Add Module Plugin
1. Create class extending `ModuleManager`
2. Implement `getName()`, `getInstance()`, `getAuthorizationRequirements()`
3. Package as `frigg-module-*`
4. Add to package.json dependencies

### Enable Encryption
1. Add `lhEncrypt: true` to schema field
2. Set encryption environment variables
3. Mongoose plugin handles pre/post hooks

### Add Custom Auth Type
1. Create class extending `Requester`
2. Implement `addAuthHeaders()`
3. Implement `isAuthenticated()`
4. Register requester type in `ModuleConstants`

---

## Testing

- **Framework**: Jest
- **Database**: mongodb-memory-server (isolated)
- **Coverage**: 133 test files across monorepo
- **Setup**: `jest-setup.js` in core package

---

## Performance Considerations

1. **Connection Pooling**: Reuse across Lambda invocations
2. **Caching**: No built-in caching (add Redis for performance)
3. **Rate Limits**: Handle via backoff retry
4. **Batch Operations**: Process one item at a time (add bulk support)
5. **Encryption**: Slight overhead for field-level encryption

---

## Known Limitations

1. **No Webhook Support**: Polling/sync only
2. **No Caching Layer**: Every request hits external API
3. **No Rate Limiting**: Relies on backoff retry
4. **TypeScript Not Required**: Only used for tooling
5. **Manual Bulk Ops**: No native batch operations

---

## Recommended Next Steps

### Immediate (1-2 weeks)
- [ ] Fix typo in ApiKeyRequester.length
- [ ] Add TypeScript support
- [ ] Document OAuth2 variants
- [ ] Create architecture diagrams

### Short-term (1-3 months)
- [ ] Implement Redis caching
- [ ] Add webhook support
- [ ] Enhanced monitoring/logging
- [ ] Bulk operation support

### Long-term (6+ months)
- [ ] GraphQL API option
- [ ] Module marketplace
- [ ] Advanced sync strategies
- [ ] Multi-tenancy improvements

---

## Document Location

Full comprehensive report: `/home/user/frigg/HIVE_MIND_RESEARCH_REPORT.md`

