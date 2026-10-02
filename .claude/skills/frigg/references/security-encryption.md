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

Fails closed: a deployed stage (running in AWS, not under `frigg start`/serverless-offline or Jest) with no key refuses to start with `EncryptionConfigurationError`, whatever the stage name. Only local runs on dev/test/local stages skip encryption. The rule lives in `database/encryption/encryption-config.js`.

## Environment Configuration

```bash
# AWS KMS (recommended): set automatically on every stage, dev included, when
# the app definition has encryption: { fieldLevelEncryptionMethod: 'kms' }
KMS_KEY_ARN=arn:aws:kms:...

# AES encryption (any environment); both required when deployed
AES_KEY_ID=my-key-id
AES_KEY=your-32-char-key

# Explicit plaintext opt-out for a deployed stage with no key. Warns on every
# cold start. Also set by fieldLevelEncryptionMethod: 'none'. Never a default.
FRIGG_ENCRYPTION_DISABLED=true

# Local runs only (frigg start, tests): these stages skip encryption
STAGE=dev   # or test, local
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
