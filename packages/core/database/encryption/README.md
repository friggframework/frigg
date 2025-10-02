# Frigg Field-Level Encryption

Database-agnostic field-level encryption for Frigg using Prisma Client Extensions and AWS KMS/AES.

## Overview

This module provides **transparent field-level encryption** for sensitive data in Frigg integrations. It works identically for MongoDB and PostgreSQL, using Prisma Client Extensions to automatically encrypt data on write and decrypt on read.

### Key Features

- ✅ **Database-agnostic**: Works with MongoDB, PostgreSQL, and future databases
- ✅ **Transparent**: Repositories and use cases work with plain data
- ✅ **Hexagonal architecture**: Clean separation of concerns
- ✅ **AWS KMS support**: Enterprise-grade encryption with AWS Key Management Service
- ✅ **Local AES fallback**: Development mode using local encryption keys
- ✅ **Environment-based**: Automatic bypass in dev/test/local environments
- ✅ **Envelope encryption**: Secure key management pattern

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

### App Definition

In `backend/index.js`:

```javascript
const appDefinition = {
    encryption: {
        fieldLevelEncryptionMethod: 'kms',  // or 'aes'
        createResourceIfNoneFound: true,    // Auto-create KMS key if missing
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
- Set by AWS discovery: `AWS_DISCOVERY_KMS_KEY_ARN`
- Copied to `KMS_KEY_ARN` during deployment

#### Development (Local AES)

```bash
# Local AES encryption (development/testing only)
AES_KEY_ID=local-dev-key
AES_KEY=your-32-character-secret-key-here
STAGE=development  # or dev, test, local
```

**⚠️ Important**: Encryption is automatically **disabled** when `STAGE` is set to `dev`, `test`, or `local`, regardless of key configuration.

### Bypass Encryption

To explicitly disable encryption:

```bash
# Disable encryption (development only)
STAGE=development  # or dev, test, local
```

Or simply don't configure any encryption keys.

## Encrypted Fields

Fields are defined in `encryption-schema-registry.js`:

```javascript
const ENCRYPTION_SCHEMA = {
    Credential: {
        fields: [
            'data.access_token',     // OAuth access token
            'data.refresh_token',    // OAuth refresh token
            'data.domain',           // Service domain
            'data.id_token',         // OpenID Connect ID token
        ],
    },
    IntegrationMapping: {
        fields: ['mapping'],         // Complete mapping object
    },
    User: {
        fields: ['hashword'],        // Password hash
    },
    Token: {
        fields: ['token'],           // Authentication token
    },
};
```

### Extending Encryption Schema

#### Recommended: Custom Schema via appDefinition (Integration Developers)

Integration developers can extend encryption without modifying core framework files:

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
                fields: ['secretData', 'data.apiKey']
            },

            // Extend core models with additional fields
            Credential: {
                fields: ['data.customToken'] // Merged with core fields
            }
        }
    },
    integrations: [MyIntegration],
    // ... rest of config
};
```

**Features:**
- ✅ No framework file modifications needed
- ✅ Encryption for custom Prisma models
- ✅ Extends core models with additional fields
- ✅ Automatic validation on startup
- ✅ Protects against overriding core encrypted fields

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
- Invalid field paths → Error on startup with clear message
- Attempting to override core fields → Error on startup
- Empty/null schema → Silently ignored

**Debug:**
```bash
# Enable debug logging to see custom schema loading
FRIGG_DEBUG=1 npm run frigg:start
```

#### Advanced: Modifying Core Schema (Framework Developers)

Framework developers maintaining core models can modify `encryption-schema-registry.js`:

1. Open `encryption-schema-registry.js`
2. Add field to `CORE_ENCRYPTION_SCHEMA`:

```javascript
const CORE_ENCRYPTION_SCHEMA = {
    Credential: {
        fields: [
            'data.access_token',
            'data.refresh_token',
            'data.new_core_field',  // New core field
        ],
    },
};
```

3. Deploy - encryption applied automatically to all integrations

**When to use:**
- Adding encryption for new framework-level sensitive fields
- Adding new core models (User, Token, etc.)
- Security baseline changes affecting all integrations

**When NOT to use:**
- Integration-specific sensitive data (use custom schema instead)
- Temporary/experimental encryption (use custom schema instead)

## How It Works

### Write Operation (Create/Update)

```javascript
// Application code (use case or repository)
await prisma.credential.create({
    data: {
        data: { access_token: 'secret123' }
    }
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
    where: { id: credentialId }
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
- Reduces KMS API calls (one DEK per field, cached)
- Master key never leaves KMS
- Enables key rotation without re-encrypting all data
- Better performance at scale

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
                    access_token: accessToken // Plain text
                }
            }
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

```bash
# Test with MongoDB
DB_TYPE=mongodb npm test -- database/encryption/

# Test with PostgreSQL
DB_TYPE=postgresql npm test -- database/encryption/
```

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
    "Action": [
        "kms:GenerateDataKey",
        "kms:Decrypt"
    ],
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

- Check KMS API throttling (CloudWatch metrics)
- Consider data key caching (future enhancement)
- Verify proper field selection (don't encrypt unnecessary fields)

### Data Migration

**Migrating from Mongoose encryption:**

1. Export data with old encryption
2. Decrypt using old Mongoose plugin
3. Re-import with new Prisma encryption
4. Verify with `/health/test-encryption`

## Security Best Practices

### DO

✅ Use AWS KMS in production
✅ Rotate KMS keys regularly (AWS handles automatically)
✅ Restrict KMS key access to Lambda execution role only
✅ Use VPC endpoints for KMS (reduce NAT costs)
✅ Monitor KMS API usage (CloudWatch)
✅ Test encryption with health check endpoint

### DON'T

❌ Use AES keys in production (development only)
❌ Store AES keys in code or git (use environment variables)
❌ Disable encryption in production
❌ Skip encryption for PII data
❌ Query on encrypted fields (not supported)
❌ Manually decrypt data (use extension)

## Future Enhancements

### Planned

- [ ] Data key caching (reduce KMS API calls)
- [ ] Key rotation automation
- [ ] Encryption metrics (CloudWatch)
- [ ] Field-level audit logging
- [ ] Support for queryable encryption (MongoDB CSFLE)

### Under Consideration

- [ ] Multi-region KMS replication
- [ ] Client-side field level encryption
- [ ] Encryption at rest + in transit
- [ ] Compliance reporting (GDPR, HIPAA)

## Related Documentation

- [Prisma Client Extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- [AWS KMS Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
- [Frigg Infrastructure](../../../devtools/infrastructure/CLAUDE.md)
- [Hexagonal Architecture](../../CLAUDE.md#dddhexagonal-architecture-patterns)
