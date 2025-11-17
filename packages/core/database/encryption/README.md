# Frigg Field-Level Encryption

Database-agnostic field-level encryption for Frigg using Prisma Client Extensions and AWS KMS/AES.

## Overview

This module provides **transparent field-level encryption** for sensitive data in Frigg integrations. It works identically for MongoDB and PostgreSQL, using Prisma Client Extensions to automatically encrypt data on write and decrypt on read.

### Key Features

-   ✅ **Database-agnostic**: Works with MongoDB, PostgreSQL, and future databases
-   ✅ **Transparent**: Repositories and use cases work with plain data
-   ✅ **Hexagonal architecture**: Clean separation of concerns
-   ✅ **AWS KMS support**: Enterprise-grade encryption with AWS Key Management Service
-   ✅ **Local AES fallback**: Development mode using local encryption keys
-   ✅ **Environment-based**: Automatic bypass in dev/test/local environments
-   ✅ **Envelope encryption**: Secure key management pattern

## Architecture

### Hexagonal Layers

```
Application Layer (Use Cases)
         ↓ works with plain data
Infrastructure Layer (Repositories)
         ↓ works with plain data
Infrastructure Layer (Prisma Extension)
         ↓ transparent encrypt/decrypt
Infrastructure Layer (Cryptor)
         ↓ calls AWS KMS or crypto library
External Systems (AWS KMS, Database)
```

### Components

1. **encryption-schema-registry.js** - Defines which fields are encrypted
2. **field-encryption-service.js** - Orchestrates field-level encryption
3. **prisma-encryption-extension.js** - Prisma Client Extension for transparent encryption
4. **Cryptor.js** (`../encrypt/`) - Adapter for AWS KMS and AES encryption

## Configuration

### Database Selection

Database type is configured in `backend/index.js` app definition:

```javascript
const appDefinition = {
    database: {
        mongoDB: {
            enable: true, // Use MongoDB
        },
        documentDB: {
            enable: false, // Use DocumentDB (MongoDB-compatible)
            tlsCAFile: './security/global-bundle.pem',
        },
        postgres: {
            enable: false, // Use PostgreSQL
        },
    },
    // ... other config
};
```

**Important**: Only enable ONE database at a time. The framework will use the first enabled database in this priority order:

1. PostgreSQL (`postgres.enable = true`)
2. MongoDB (`mongoDB.enable = true`)
3. DocumentDB (`documentDB.enable = true`)

### Encryption Configuration

In `backend/index.js`:

```javascript
const appDefinition = {
    encryption: {
        fieldLevelEncryptionMethod: 'kms', // or 'aes'
        createResourceIfNoneFound: true, // Auto-create KMS key if missing
    },
    // ... other config
};
```

### Environment Variables

#### Production (AWS KMS)

```bash
# AWS KMS encryption (recommended for production)
KMS_KEY_ARN=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
STAGE=production
```

The `KMS_KEY_ARN` is usually auto-discovered by Frigg infrastructure:

-   Set by AWS discovery: `AWS_DISCOVERY_KMS_KEY_ARN`
-   Copied to `KMS_KEY_ARN` during deployment

#### AES Encryption

```bash
# AES encryption (can be used in any environment including production)
AES_KEY_ID=local-dev-key
AES_KEY=your-32-character-secret-key-here
STAGE=production  # or development, staging, etc.
```

**⚠️ Important**: Encryption is automatically **disabled** when `STAGE` is set to `dev`, `test`, or `local`, regardless of key configuration.

### Bypass Encryption

To explicitly disable encryption:

```bash
# Disable encryption (development only)
STAGE=development  # or dev, test, local
```

Or simply don't configure any encryption keys. In Production field level encryption **must** be enabled.

## Encrypted Fields

Fields are defined in `encryption-schema-registry.js`:

```javascript
const CORE_ENCRYPTION_SCHEMA = {
    Credential: {
        fields: [
            // OAuth tokens
            'data.access_token',      // OAuth access token
            'data.refresh_token',     // OAuth refresh token
            'data.id_token',          // OpenID Connect ID token
            // API key authentication (multiple naming conventions)
            'data.api_key',           // API key (snake_case - recommended)
            'data.apiKey',            // API key (camelCase)
            'data.API_KEY_VALUE',     // API key (legacy screaming snake)
            // Basic authentication
            'data.password',          // Password for basic auth
            // OAuth client credentials
            'data.client_secret',     // OAuth client secret
        ],
    },
    IntegrationMapping: {
        fields: ['mapping'], // Complete mapping object
    },
    User: {
        fields: ['hashword'], // Password hash
    },
    Token: {
        fields: ['token'], // Authentication token
    },
};
```

**Note**: The core schema now includes common authentication fields for OAuth, API key, and basic authentication. API modules should use `api_key` (snake_case) in their `apiPropertiesToPersist.credential` arrays for consistency with OAuth2Requester and BasicAuthRequester conventions.

### API Module Credential Naming Conventions

When creating API module definitions, use **snake_case** for credential property names to ensure automatic encryption:

**✅ Recommended (automatically encrypted):**
```javascript
// API Module Definition
const Definition = {
    requiredAuthMethods: {
        apiPropertiesToPersist: {
            credential: ['api_key'],           // ✅ Automatically encrypted
            credential: ['access_token', 'refresh_token'],  // ✅ OAuth - encrypted
            credential: ['username', 'password'],           // ✅ Basic auth - encrypted
        }
    }
};

// API class (extends ApiKeyRequester)
class MyApi extends ApiKeyRequester {
    constructor(params) {
        super(params);
        this.api_key = params.api_key;  // ✅ snake_case convention
    }
}
```

**❌ Avoid (requires manual encryption schema):**
```javascript
apiPropertiesToPersist: {
    credential: ['customToken', 'proprietaryKey']  // ❌ Not in core schema
}
```

For custom credential fields not in the core schema, use the custom encryption schema feature (see below).

### Extending Encryption Schema

#### Option 1: Module-Level Encryption (API Module Developers)

**NEW**: API modules can now declare their encryption requirements directly in the module definition:

```javascript
// api-module-library/my-service/definition.js
const Definition = {
    moduleName: 'myService',
    API: MyServiceApi,

    // Declare which credential fields need encryption
    encryption: {
        credentialFields: ['api_key', 'webhook_secret']
    },

    requiredAuthMethods: {
        apiPropertiesToPersist: {
            credential: ['api_key', 'webhook_secret'],  // These will be auto-encrypted
            entity: []
        },
        // ... other methods
    }
};
```

**How it works**:
1. Module declares `encryption.credentialFields` array
2. Framework automatically adds `data.` prefix: `['api_key']` → `['data.api_key']`
3. Fields are merged with core encryption schema on app startup
4. All modules across all integrations are scanned and combined

**Benefits**:
- ✅ Module authors control their own security requirements
- ✅ No need to modify core framework or app configuration
- ✅ Automatic encryption for API key-based integrations
- ✅ Works seamlessly with `apiPropertiesToPersist`

**Example - API Key Module**:
```javascript
// API Module Definition
const Definition = {
    moduleName: 'axiscare',
    API: AxisCareApi,
    encryption: {
        credentialFields: ['api_key']  // Auto-encrypted as 'data.api_key'
    },
    requiredAuthMethods: {
        apiPropertiesToPersist: {
            credential: ['api_key']  // Will be encrypted automatically
        }
    }
};

// API Class (extends ApiKeyRequester)
class AxisCareApi extends ApiKeyRequester {
    constructor(params) {
        super(params);
        this.api_key = params.api_key;  // snake_case convention
    }
}
```

**Example - Custom Authentication**:
```javascript
const Definition = {
    moduleName: 'customService',
    encryption: {
        credentialFields: [
            'signing_key',
            'webhook_secret',
            'data.custom_nested_field'  // Can specify data. prefix explicitly
        ]
    }
};
```

**Limitations**:
- Only supports Credential model fields (stored in `credential.data`)
- Cannot encrypt entity fields or custom models (use app-level schema for those)
- Applied globally once - module schemas loaded at app startup

#### Option 2: App-Level Custom Schema (Integration Developers)

Integration developers can extend encryption without modifying core framework files.

**In `backend/index.js`:**

```javascript
const appDefinition = {
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
        createResourceIfNoneFound: true,

        // Custom encryption schema
        schema: {
            // Your custom models
            MyCustomModel: {
                fields: ['secretData', 'data.apiKey'],
            },

            // Extend core models with additional fields
            Credential: {
                fields: ['data.customToken'], // Merged with core fields
            },
        },
    },
    integrations: [MyIntegration],
    // ... rest of config
};
```

**Features:**

-   ✅ No framework file modifications needed
-   ✅ Encryption for custom Prisma models
-   ✅ Extends core models with additional fields
-   ✅ Automatic validation on startup
-   ✅ Protects against overriding core encrypted fields

**Example with Custom Model:**

```javascript
// 1. Define custom Prisma model (in your backend prisma schema)
model AsanaTaskMapping {
  id              Int      @id @default(autoincrement())
  taskGid         String
  webhookToken    String   // Sensitive!
  customApiSecret String   // Sensitive!
  metadata        Json
}

// 2. Add to encryption schema in backend/index.js
const appDefinition = {
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
        schema: {
            AsanaTaskMapping: {
                fields: [
                    'webhookToken',
                    'customApiSecret'
                ]
            }
        }
    }
};

// 3. Use normally in your repositories - encryption is automatic!
await prisma.asanaTaskMapping.create({
    data: {
        webhookToken: 'secret123',  // Auto-encrypted
        customApiSecret: 'api-key'  // Auto-encrypted
    }
});
```

**Validation:**

-   Invalid field paths → Error on startup with clear message
-   Attempting to override core fields → Error on startup
-   Empty/null schema → Silently ignored

**Debug:**

```bash
# Enable debug logging to see custom schema loading
FRIGG_DEBUG=1 npm run frigg:start
```

#### Option 3: Modifying Core Schema (Framework Developers)

Framework developers maintaining core models can modify `encryption-schema-registry.js`:

1. Open `encryption-schema-registry.js`
2. Add field to `CORE_ENCRYPTION_SCHEMA`:

```javascript
const CORE_ENCRYPTION_SCHEMA = {
    Credential: {
        fields: [
            'data.access_token',
            'data.refresh_token',
            'data.new_core_field', // New core field
        ],
    },
};
```

3. Deploy - encryption applied automatically to all integrations

**When to use:**

-   Adding encryption for new framework-level sensitive fields
-   Adding new core models (User, Token, etc.)
-   Security baseline changes affecting all integrations

**When NOT to use:**

-   Integration-specific sensitive data (use custom schema instead)
-   Temporary/experimental encryption (use custom schema instead)

#### After Adding Encrypted Fields

After adding fields to `encryption-schema-registry.js`:

1. **For MongoDB/PostgreSQL**: No code changes needed (automatic via Prisma Extension)
2. **For DocumentDB**: Encryption is automatic via DocumentDBEncryptionService
   (service reads from same registry)

## How It Works

### Write Operation (Create/Update)

```javascript
// Application code (use case or repository)
await prisma.credential.create({
    data: {
        data: { access_token: 'secret123' },
    },
});

// What happens:
// 1. Prisma extension intercepts query
// 2. FieldEncryptionService encrypts matching fields
// 3. Cryptor generates data key via KMS
// 4. Cryptor encrypts value with data key
// 5. Database stores: { data: { access_token: 'keyId:iv:cipher:encKey' }}
// 6. Extension decrypts return value
// 7. Application receives: { data: { access_token: 'secret123' }}
```

### Read Operation (Find)

```javascript
// Application code
const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
});

// What happens:
// 1. Prisma queries database
// 2. Database returns encrypted data
// 3. Extension intercepts result
// 4. FieldEncryptionService decrypts matching fields
// 5. Cryptor decrypts with KMS
// 6. Application receives plain data
```

### Encryption Format

Encrypted values use **envelope encryption**:

```
Format: "keyId:encryptedText:encryptedKey"
Example: "base64KeyId:iv:ciphertext:base64EncryptedDataKey"
```

**Why Envelope Encryption?**

-   Reduces KMS API calls (one DEK per field, cached)
-   Master key never leaves KMS
-   Enables key rotation without re-encrypting all data
-   Better performance at scale

### Known Limitations

#### Prisma Relations with `include` Bypass Decryption

**⚠️ Critical**: When using Prisma's `include` option to fetch related models, the encryption extension **cannot decrypt** nested relation data.

**Problem:**

```javascript
// ❌ WRONG: Credential will NOT be decrypted
const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: { credential: true }, // Nested credential stays encrypted!
});

// entity.credential.data.access_token will be encrypted:
// "keyId:iv:ciphertext:encKey" instead of plain text
```

**Root Cause:**

The Prisma encryption extension hooks into top-level model queries via `$allModels`. When you use `include`, Prisma internally fetches the nested relation, but the extension only sees the parent model name (`Entity`), not the nested model (`Credential`). Therefore, the `Credential` data bypasses the decryption logic.

**Solution:**

Always fetch relations with **separate queries**:

```javascript
// ✅ CORRECT: Fetch entity and credential separately
const entity = await prisma.entity.findUnique({
    where: { id: entityId },
});

// Separate query ensures decryption
const credential = await prisma.credential.findUnique({
    where: { id: entity.credentialId },
});

// Combine in application layer
return {
    ...entity,
    credential, // Now properly decrypted
};
```

**Best Practice (Bulk Operations):**

For fetching multiple entities with credentials, use bulk fetching to avoid N+1 queries:

```javascript
// Fetch all entities
const entities = await prisma.entity.findMany({
    where: { userId },
});

// Bulk fetch credentials (single query)
const credentialIds = entities.map((e) => e.credentialId).filter(Boolean);
const credentials = await prisma.credential.findMany({
    where: { id: { in: credentialIds } },
});

// Create lookup map
const credentialMap = new Map(credentials.map((c) => [c.id, c]));

// Combine in application layer
return entities.map((e) => ({
    ...e,
    credential: credentialMap.get(e.credentialId) || null,
}));
```

**Verified:**

-   ✅ `postgres-relation-decryption.test.js` - Proves the bug exists
-   ✅ `postgres-decryption-fix-verification.test.js` - Verifies separate queries work
-   ✅ `mongo-decryption-fix-verification.test.js` - Verifies fix for MongoDB

**Implementation Examples:**

See `modules/repositories/module-repository-postgres.js` and `module-repository-mongo.js` for complete implementation examples using `_fetchCredential()` and `_fetchCredentialsBulk()` helper methods.

## DocumentDB Encryption

### Why DocumentDB Needs Manual Encryption

DocumentDB repositories use `$runCommandRaw()` for MongoDB protocol compatibility, which bypasses Prisma Client Extensions. This means the automatic encryption extension does not apply.

### DocumentDBEncryptionService

For DocumentDB repositories, use `DocumentDBEncryptionService` to manually encrypt/decrypt documents before/after database operations.

#### Usage Example

```javascript
const { DocumentDBEncryptionService } = require('../documentdb-encryption-service');
const { insertOne, findOne } = require('../documentdb-utils');

class MyRepositoryDocumentDB {
    constructor() {
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async create(data) {
        // Encrypt before write
        const encrypted = await this.encryptionService.encryptFields('ModelName', data);
        const id = await insertOne(this.prisma, 'CollectionName', encrypted);

        // Decrypt after read
        const doc = await findOne(this.prisma, 'CollectionName', { _id: id });
        const decrypted = await this.encryptionService.decryptFields('ModelName', doc);

        return decrypted;
    }
}
```

#### Configuration

Uses the same environment variables and Cryptor as the Prisma Extension:
- `STAGE`: Bypasses encryption for dev/test/local
- `KMS_KEY_ARN`: AWS KMS encryption (production)
- `AES_KEY_ID` + `AES_KEY`: AES encryption (fallback)

## Usage Examples

### Repository Code (No Changes Needed!)

```javascript
// Repositories work with plain data - encryption is transparent
class CredentialRepository {
    async upsertCredential({ identifiers, details }) {
        // details.data.access_token is plain text here
        const credential = await prisma.credential.upsert({
            where: identifiers,
            create: details,
            update: details,
        });

        // credential.data.access_token is plain text here (auto-decrypted)
        return credential;
    }
}
```

### Use Case Code (No Changes Needed!)

```javascript
// Use cases work with plain data - encryption is transparent
class AuthenticateUserUseCase {
    async execute({ userId, accessToken }) {
        // accessToken is plain text
        await this.credentialRepo.upsertCredential({
            identifiers: { userId },
            details: {
                data: {
                    access_token: accessToken, // Plain text
                },
            },
        });

        // Stored as encrypted, but we work with plain text
    }
}
```

### Testing Encryption

Use the health check endpoint to verify encryption:

```bash
# Check if encryption is working
curl http://localhost:3000/health/test-encryption

# Response when encryption enabled:
{
    "status": "enabled",
    "testResult": "Encryption and decryption verified successfully",
    "encryptionWorks": true
}

# Response when encryption disabled:
{
    "status": "disabled",
    "reason": "Encryption bypassed for stage: development"
}
```

## Testing

### Unit Tests

```bash
# Test encryption schema registry
npm test -- database/encryption/encryption-schema-registry.test.js

# Test field encryption service
npm test -- database/encryption/field-encryption-service.test.js

# Test Prisma extension
npm test -- database/encryption/prisma-encryption-extension.test.js

# Test all encryption
npm test -- database/encryption/
```

### Integration Tests

Database type is determined from your app definition in `backend/index.js`:

```javascript
// backend/index.js
database: {
    mongoDB: { enable: true },   // For MongoDB tests
    postgres: { enable: false }
}
```

```bash
# Run encryption tests
npm test -- database/encryption/

# Tests use explicit prismaClient injection:
# const { prisma } = require('../prisma');
# const repository = createHealthCheckRepository({ prismaClient: prisma });
```

## Error Handling & Logging

### Error Handling Strategy

The encryption system uses **fail-fast error handling**:

-   **Encryption failures**: Throw errors immediately (don't save corrupted/unencrypted sensitive data)
-   **Decryption failures**: Throw errors immediately (prevents exposing invalid data)
-   **Configuration errors**: Warn and disable encryption (graceful degradation for development)
-   **Validation errors**: Throw errors on startup (catch issues before production)

**Why fail-fast?**

-   Security-critical operations must not silently fail
-   Better to expose issues during development than risk data breaches
-   Prevents inconsistent database state (partially encrypted data)

### Logging Configuration

Configure log verbosity with `FRIGG_LOG_LEVEL`:

```bash
# Production (minimal logging)
FRIGG_LOG_LEVEL=WARN

# Development (detailed logging)
FRIGG_LOG_LEVEL=DEBUG

# Default
FRIGG_LOG_LEVEL=INFO
```

**Log Levels:**

-   `DEBUG`: Detailed encryption operations (includes schema loading, key checks)
-   `INFO`: High-level status (encryption enabled/disabled, custom schema registration)
-   `WARN`: Configuration issues (missing keys, bypassed encryption)
-   `ERROR`: Operation failures (encryption/decryption errors)

**Production Safety:**

-   Sensitive data automatically sanitized in logs
-   Long base64 strings truncated (prevents key leakage)
-   Stack traces omitted in production (`STAGE=production`)
-   Key IDs never logged

### Performance Optimizations

**Parallel field encryption:**

-   Multiple fields encrypted concurrently using `Promise.all()`
-   Significantly faster for models with many encrypted fields
-   Example: 3 fields encrypted in ~30ms vs ~90ms (3x speedup)

**Deep cloning:**

-   Uses native `structuredClone()` on Node.js 17+ (2-5x faster)
-   Falls back to custom implementation for compatibility
-   No external dependencies required

## Troubleshooting

### Encryption Not Working

**Check environment variables:**

```bash
echo $STAGE              # Should be 'production' (not dev/test/local)
echo $KMS_KEY_ARN        # Should be set (for KMS)
echo $AES_KEY_ID         # Should be set (for AES)
```

**Check console logs:**

```
[Frigg] Field-level encryption enabled using KMS
```

or

```
[Frigg] Field-level encryption disabled
```

### AWS KMS Errors

**Error: "User is not authorized to perform: kms:GenerateDataKey"**

Solution: Add KMS permissions to Lambda execution role:

```json
{
    "Effect": "Allow",
    "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
    "Resource": "arn:aws:kms:*:*:key/*"
}
```

**Error: "KMS key not found"**

Solution: Check `KMS_KEY_ARN` environment variable:

```bash
aws kms describe-key --key-id $KMS_KEY_ARN
```

### Local AES Errors

**Error: "No encryption key found with ID"**

Solution: Set both `AES_KEY_ID` and `AES_KEY`:

```bash
export AES_KEY_ID=local-dev-key
export AES_KEY=$(openssl rand -hex 16)  # Generate 32-char key
```

### Performance Issues

**Symptom: Slow queries with encryption**

-   Check KMS API throttling (CloudWatch metrics)
-   Consider data key caching (future enhancement)
-   Verify proper field selection (don't encrypt unnecessary fields)

### Data Migration

**Migrating from Mongoose encryption:**

1. Export data with old encryption
2. Decrypt using old Mongoose plugin
3. Re-import with new Prisma encryption
4. Verify with `/health/test-encryption`

## Security Best Practices

### DO

✅ Use AWS KMS for production (recommended) or AES encryption (valid alternative)
✅ Rotate KMS keys regularly (AWS handles automatically)
✅ Restrict KMS key access to Lambda execution role only
✅ Use VPC endpoints for KMS (reduce NAT costs)
✅ Monitor KMS API usage (CloudWatch)
✅ Test encryption with health check endpoint

### DON'T

❌ Store AES keys in code or git (use environment variables)
❌ Disable encryption in production
❌ Skip encryption for PII data
❌ Query on encrypted fields (not supported)
❌ Manually decrypt data (use extension)

## Future Enhancements

### Planned

-   [ ] Data key caching (reduce KMS API calls)
-   [ ] Key rotation automation
-   [ ] Encryption metrics (CloudWatch)
-   [ ] Field-level audit logging
-   [ ] Support for queryable encryption (MongoDB CSFLE)

### Under Consideration

-   [ ] Multi-region KMS replication
-   [ ] Client-side field level encryption
-   [ ] Encryption at rest + in transit
-   [ ] Compliance reporting (GDPR, HIPAA)

## Related Documentation

-   [Prisma Client Extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
-   [AWS KMS Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
-   [Frigg Infrastructure](../../../devtools/infrastructure/CLAUDE.md)
-   [Hexagonal Architecture](../../CLAUDE.md#dddhexagonal-architecture-patterns)
