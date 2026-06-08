# Security & Encryption Reference

Field-level encryption protects sensitive data at the application layer (database-agnostic), transparent to use cases and repositories.

## Architecture Layers

- **Prisma Extension** (`prisma-encryption-extension.js`) — transparent encryption at the Prisma level
- **Field Encryption Service** (`field-encryption-service.js`) — orchestrates field-level encryption
- **Cryptor** (`encrypt/Cryptor.js`) — adapter for AWS KMS and AES (envelope encryption)
- **Encryption Schema Registry** (`encryption-schema-registry.js`) — defines which fields are encrypted

## How It Works

1. Use cases and repositories work with **plain data** (transparent)
2. The Prisma Extension intercepts database operations
3. Field Encryption Service encrypts/decrypts the specified fields
4. Cryptor performs the actual encryption via AWS KMS or AES (envelope pattern: a per-operation Data Encryption Key wrapped by a master key; format `keyId:encryptedText:encryptedKey`)
5. The database stores encrypted data

Auto-bypassed in dev/test/local stages.

## Environment Configuration

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

## Encrypted Fields

Defined in `encryption-schema-registry.js`:

- **Credential**: `data.access_token`, `data.refresh_token`, `data.domain`, `data.id_token`
- **IntegrationMapping**: `mapping` (complete object)
- **User**: `hashword`
- **Token**: `token`

To add an encrypted field, extend the registry:

```javascript
// packages/core/database/encryption/encryption-schema-registry.js
const ENCRYPTED_FIELDS = {
  Credential: [
    "data.access_token",
    "data.refresh_token",
    "data.custom_secret", // new field
  ],
};
```

## Verifying Encryption

```bash
curl http://localhost:3000/health/detailed
# check the "encryption" section: {"status":"enabled","method":"kms"}
```
