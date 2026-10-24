# DocumentDB Encryption Service Implementation Guide

**Status**: 🔴 **CRITICAL** - Security Vulnerability
**Priority**: P0 - Immediate Action Required
**Created**: 2025-01-13
**Last Updated**: 2025-01-13

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Architecture & Design](#architecture--design)
4. [Technical Specification](#technical-specification)
5. [Implementation Plan](#implementation-plan)
6. [Code Examples](#code-examples)
7. [Testing Strategy](#testing-strategy)
8. [Migration Guide](#migration-guide)
9. [Security Considerations](#security-considerations)
10. [Maintenance & Future Work](#maintenance--future-work)
11. [References](#references)

---

## Executive Summary

### The Problem

DocumentDB repositories use `$runCommandRaw()` for MongoDB protocol compatibility, which **bypasses Prisma Client Extensions**, including the encryption extension. This results in a **critical security vulnerability** where:

-   ✅ **MongoDB/PostgreSQL**: Automatic encryption via Prisma Extension
-   ❌ **DocumentDB**: OAuth credentials stored in **plain text**

### The Solution

Create `DocumentDBEncryptionService` - a centralized encryption service specifically designed for DocumentDB repositories that:

-   Provides document-level encryption/decryption
-   Handles nested field paths (e.g., `data.access_token`)
-   Uses the same Cryptor and schema registry as Prisma Extension
-   Maintains consistency with existing encryption architecture

### Impact

-   **Security**: OAuth credentials encrypted at rest in DocumentDB
-   **Architecture**: DRY principle - single source of encryption logic
-   **Consistency**: All DocumentDB repos use same encryption pattern
-   **Compliance**: Meets production encryption requirements

---

## Problem Statement

### Current Architecture (MongoDB/PostgreSQL)

```
Application Code (Use Cases)
    ↓ works with plain data
Repositories
    ↓ uses Prisma queries
Prisma Client + Extension (AUTOMATIC ENCRYPTION)
    ↓ intercepts all queries
FieldEncryptionService
    ↓ encrypts/decrypts per field
Cryptor (KMS or AES)
    ↓
Database (encrypted storage)
```

**How it works**:

```javascript
// MongoDB Repository - Automatic encryption
await prisma.credential.create({
    data: {
        access_token: 'plain_secret', // ← Plain text in
    },
});
// → Prisma Extension intercepts
// → FieldEncryptionService.encryptField() called
// → Stored as "keyId:iv:cipher:encKey" in database

const cred = await prisma.credential.findFirst({ where: { id } });
// ← Database returns "keyId:iv:cipher:encKey"
// ← Prisma Extension intercepts
// ← FieldEncryptionService.decryptField() called
// ← Application receives { access_token: "plain_secret" }
```

### DocumentDB Architecture (Current - BROKEN)

```
Application Code (Use Cases)
    ↓ works with plain data
DocumentDB Repositories
    ↓ uses $runCommandRaw
Prisma Client (NO EXTENSION INTERCEPTION)
    ↓ raw command bypasses all extensions
Database (PLAIN TEXT STORAGE) ⚠️ SECURITY VULNERABILITY
```

**Why it's broken**:

```javascript
// DocumentDB Repository - NO encryption
const oauthData = {
    access_token: 'ya29.actual_google_token', // Plain text!
    refresh_token: '1//0secret_refresh_token', // Plain text!
};

await prisma.$runCommandRaw({
    insert: 'Credential',
    documents: [{ data: oauthData }],
});
// ❌ Prisma Extension NEVER sees this command
// ❌ FieldEncryptionService NEVER invoked
// ❌ Stored in database as PLAIN TEXT
```

### Root Cause

From Prisma documentation:

> "$runCommandRaw is a low-level database access method. Prisma Client extensions do not apply to raw database access."

**Why DocumentDB needs raw commands**:

-   DocumentDB has MongoDB compatibility limitations
-   Certain Prisma features don't work (transactions, some aggregations)
-   Raw commands provide direct MongoDB protocol access

### Current Repository Status

| Repository                          | Encryption Status                                      | Security Risk                                |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| **UserRepositoryDocumentDB**        | ✅ Has manual encryption for `hashword`                | Low - passwords protected                    |
| **ModuleRepositoryDocumentDB**      | ⚠️ Has manual decryption for reads only                | Medium - assumes credentials encrypted       |
| **CredentialRepositoryDocumentDB**  | ❌ **NO encryption on writes, NO decryption on reads** | 🔴 **CRITICAL - OAuth tokens in plain text** |
| **IntegrationRepositoryDocumentDB** | ✅ No encrypted fields, OK                             | None                                         |

---

## Architecture & Design

### Comparison: FieldEncryptionService vs DocumentDBEncryptionService

| Aspect               | FieldEncryptionService                         | DocumentDBEncryptionService              |
| -------------------- | ---------------------------------------------- | ---------------------------------------- |
| **Purpose**          | Encrypt individual fields for Prisma Extension | Encrypt entire documents for raw queries |
| **Invocation**       | Automatic (Prisma intercepts queries)          | Manual (repository calls explicitly)     |
| **Scope**            | Single field at a time                         | Entire document with multiple fields     |
| **Nested Fields**    | Handled by Prisma Extension traversal          | Must manually traverse field paths       |
| **Integration**      | Via Prisma Client Extension                    | Direct import in repositories            |
| **Query Types**      | `create()`, `update()`, `findFirst()`, etc.    | `$runCommandRaw()`, via documentdb-utils |
| **Database Support** | MongoDB, PostgreSQL (via Prisma)               | DocumentDB (raw MongoDB protocol)        |
| **Schema Registry**  | Used by Prisma Extension                       | Directly queries registry                |
| **Error Handling**   | Prisma transaction rollback                    | Must handle in repository                |
| **Testing**          | Integration tests with Prisma                  | Unit tests + repository tests            |

### Proposed Architecture (DocumentDB - FIXED)

```
Application Code (Use Cases)
    ↓ works with plain data
DocumentDB Repositories
    ↓ MANUALLY calls encryptFields()/decryptFields()
DocumentDBEncryptionService
    ↓ traverses field paths based on schema registry
    ↓ encrypts/decrypts each field
Cryptor (KMS or AES)
    ↓
Database (ENCRYPTED STORAGE) ✅ SECURE
```

### Architecture Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Application Layer (Use Cases)                                   │
│  - Works with plain text data                                  │
│  - Never sees encrypted values                                 │
└──────────────────┬──────────────────────────────────────────────┘
                   │
      ┌────────────┴──────────────┐
      │                           │
      ▼ MongoDB/PostgreSQL        ▼ DocumentDB
┌─────────────────────┐     ┌──────────────────────────┐
│ Repository          │     │ Repository               │
│  (plain text)       │     │  (plain text)            │
└──────┬──────────────┘     └───┬──────────────────────┘
       │                        │ Manually calls
       │ Uses Prisma queries    │ encryptFields()/
       ▼                        │ decryptFields()
┌─────────────────────┐        ▼
│ Prisma Client       │   ┌──────────────────────────────┐
│  + Extension        │   │ DocumentDBEncryptionService  │
│  (automatic)        │   │  - Traverses field paths     │
└──────┬──────────────┘   │  - Calls Cryptor per field   │
       │ Intercepts        └───┬──────────────────────────┘
       │ queries                │
       ▼                        │
┌─────────────────────┐        │
│ FieldEncryptionSvc  │◄───────┘ Both use Cryptor
│  - Per-field logic  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Cryptor (AWS KMS or AES)            │
│  - Envelope encryption              │
│  - Returns: "keyId:iv:cipher:encKey"│
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Database (MongoDB/PostgreSQL/       │
│           DocumentDB)               │
│  - Stores encrypted strings         │
└─────────────────────────────────────┘
```

### Design Principles

1. **Consistency**: Same encryption format and Cryptor as Prisma Extension
2. **Reusability**: Single service used by all DocumentDB repositories
3. **Schema-Driven**: Uses `encryption-schema-registry.js` (same as Prisma)
4. **Environment-Aware**: Respects STAGE-based bypass (dev/test/local)
5. **Error-Tolerant**: Graceful handling of decryption failures
6. **Testable**: Can be unit tested independently of repositories

---

## Technical Specification

### Class Design

```javascript
/**
 * Encryption service specifically for DocumentDB repositories
 * that use $runCommandRaw and bypass Prisma Extensions.
 *
 * Provides document-level encryption/decryption,
 * handling nested fields according to the encryption schema registry.
 */
class DocumentDBEncryptionService {
    constructor()
    _initializeCryptor()
    async encryptFields(modelName, document)
    async decryptFields(modelName, document)
    async _encryptFieldPath(document, fieldPath, modelName)
    async _decryptFieldPath(document, fieldPath, modelName)
    _isEncryptedValue(value)
}
```

### Method Specifications

#### `constructor()`

**Purpose**: Initialize the service and configure Cryptor

**Behavior**:

-   Calls `_initializeCryptor()` immediately
-   Sets up `this.cryptor` and `this.enabled` properties

**No parameters**

---

#### `_initializeCryptor()`

**Purpose**: Initialize Cryptor with environment-based configuration

**Logic**:

```javascript
1. Get STAGE from environment (default: 'development')
2. If STAGE in ['dev', 'test', 'local']:
   - Set this.cryptor = null
   - Set this.enabled = false
   - Return (bypass encryption)
3. Check for KMS_KEY_ARN environment variable
4. Check for AES_KEY_ID environment variable
5. If neither present:
   - Warn "No encryption keys configured"
   - Set this.cryptor = null
   - Set this.enabled = false
   - Return
6. Create Cryptor({ shouldUseAws: hasKMS })
7. Set this.enabled = true
```

**Environment Variables Used**:

-   `STAGE` or `NODE_ENV`: Determines bypass behavior
-   `KMS_KEY_ARN`: AWS KMS key ARN (enables KMS encryption)
-   `AES_KEY_ID`: AES key identifier (enables AES encryption)
-   `AES_KEY`: AES encryption key (required if AES_KEY_ID present)

**Matches**: Logic from `packages/core/database/prisma.js` lines 76-96

---

#### `async encryptFields(modelName, document)`

**Purpose**: Encrypt fields in a document before storing to DocumentDB

**Parameters**:

-   `modelName` (string): Model name from schema registry (e.g., 'User', 'Credential')
-   `document` (Object): Document to encrypt

**Returns**: `Promise<Object>` - Document with encrypted fields

**Algorithm**:

```javascript
1. If !this.enabled or !this.cryptor:
   - Return document unchanged (bypass)
2. If !document or typeof document !== 'object':
   - Return document unchanged (invalid input)
3. Get encrypted fields config from registry:
   - encryptedFieldsConfig = getEncryptedFields(modelName)
4. If no config or no fields defined:
   - Return document unchanged (no encryption needed)
5. Create shallow copy: result = { ...document }
6. For each fieldPath in encryptedFieldsConfig.fields:
   - await this._encryptFieldPath(result, fieldPath, modelName)
7. Return result
```

**Error Handling**:

-   Invalid inputs: Return unchanged
-   Encryption errors: Propagate to caller (repository must handle)

**Example**:

```javascript
const plainDoc = {
    userId: '123',
    data: {
        access_token: 'plain_secret',
        refresh_token: 'plain_refresh',
    },
};

const encrypted = await service.encryptFields('Credential', plainDoc);
// encrypted.data.access_token = "aes-key-1:iv:cipher:enckey"
// encrypted.data.refresh_token = "aes-key-1:iv:cipher:enckey"
```

---

#### `async decryptFields(modelName, document)`

**Purpose**: Decrypt fields in a document after reading from DocumentDB

**Parameters**:

-   `modelName` (string): Model name from schema registry
-   `document` (Object): Document to decrypt

**Returns**: `Promise<Object>` - Document with decrypted fields

**Algorithm**:

```javascript
1. If !this.enabled or !this.cryptor:
   - Return document unchanged (bypass)
2. If !document or typeof document !== 'object':
   - Return document unchanged (invalid input)
3. Get encrypted fields config from registry:
   - encryptedFieldsConfig = getEncryptedFields(modelName)
4. If no config or no fields defined:
   - Return document unchanged (no decryption needed)
5. Create shallow copy: result = { ...document }
6. For each fieldPath in encryptedFieldsConfig.fields:
   - await this._decryptFieldPath(result, fieldPath, modelName)
7. Return result
```

**Error Handling**:

-   Decryption failures: Set field to null (don't expose encrypted data)
-   Log error with context

**Example**:

```javascript
const encryptedDoc = {
    userId: '123',
    data: {
        access_token: 'aes-key-1:iv:cipher:enckey',
        refresh_token: 'aes-key-1:iv:cipher:enckey',
    },
};

const decrypted = await service.decryptFields('Credential', encryptedDoc);
// decrypted.data.access_token = "plain_secret"
// decrypted.data.refresh_token = "plain_refresh"
```

---

#### `async _encryptFieldPath(document, fieldPath, modelName)`

**Purpose**: Encrypt a specific field path in a document (handles nested fields)

**Parameters**:

-   `document` (Object): Document to modify (mutated in place)
-   `fieldPath` (string): Field path from schema registry (e.g., 'data.access_token')
-   `modelName` (string): For error logging context

**Algorithm**:

```javascript
1. Split fieldPath by '.': parts = fieldPath.split('.')
2. Navigate to parent object:
   - current = document
   - For i from 0 to parts.length - 2:
     - If !current[parts[i]]: return (path doesn't exist)
     - current = current[parts[i]]
3. Get field name: fieldName = parts[parts.length - 1]
4. Get value: value = current[fieldName]
5. Skip if already encrypted or empty:
   - If !value or this._isEncryptedValue(value): return
6. Convert to string if needed:
   - stringValue = (typeof value === 'string') ? value : JSON.stringify(value)
7. Encrypt using Cryptor:
   - current[fieldName] = await this.cryptor.encrypt(stringValue)
8. Catch errors:
   - Log: "Failed to encrypt {modelName}.{fieldPath}: {error}"
   - Throw error (repository must handle)
```

**Example Field Paths**:

-   `hashword` → Encrypts `document.hashword`
-   `data.access_token` → Encrypts `document.data.access_token`
-   `data.refresh_token` → Encrypts `document.data.refresh_token`

---

#### `async _decryptFieldPath(document, fieldPath, modelName)`

**Purpose**: Decrypt a specific field path in a document

**Parameters**:

-   `document` (Object): Document to modify (mutated in place)
-   `fieldPath` (string): Field path from schema registry
-   `modelName` (string): For error logging context

**Algorithm**:

```javascript
1. Split fieldPath by '.': parts = fieldPath.split('.')
2. Navigate to parent object:
   - current = document
   - For i from 0 to parts.length - 2:
     - If !current[parts[i]]: return (path doesn't exist)
     - current = current[parts[i]]
3. Get field name: fieldName = parts[parts.length - 1]
4. Get encrypted value: encryptedValue = current[fieldName]
5. Skip if not encrypted format:
   - If !encryptedValue or !this._isEncryptedValue(encryptedValue): return
6. Decrypt using Cryptor:
   - decryptedString = await this.cryptor.decrypt(encryptedValue)
7. Try to parse as JSON:
   - Try: current[fieldName] = JSON.parse(decryptedString)
   - Catch: current[fieldName] = decryptedString (not JSON, return as string)
8. Catch decryption errors:
   - Log: "Failed to decrypt {modelName}.{fieldPath}: {error}"
   - Set current[fieldName] = null (don't expose potentially corrupted data)
```

**Error Tolerance**:

-   If decryption fails, set field to `null` instead of throwing
-   Prevents exposing encrypted strings to application
-   Logs error for debugging

---

#### `_isEncryptedValue(value)`

**Purpose**: Check if a value is in encrypted format

**Parameters**:

-   `value` (any): Value to check

**Returns**: `boolean` - True if value is encrypted

**Logic**:

```javascript
1. If typeof value !== 'string': return false
2. Split by ':': parts = value.split(':')
3. Return parts.length >= 4
```

**Encrypted Format**: `"keyId:iv:cipher:encKey"` (envelope encryption)

**Examples**:

```javascript
_isEncryptedValue('plain_text'); // false
_isEncryptedValue('aes-key-1:iv123:cipher456:enckey789'); // true
_isEncryptedValue(null); // false
_isEncryptedValue({}); // false
```

---

### Dependencies

```javascript
const { Cryptor } = require('../encrypt/Cryptor');
const {
    getEncryptedFields,
} = require('./encryption/encryption-schema-registry');
```

**Cryptor**: Handles actual encryption/decryption (KMS or AES)
**getEncryptedFields**: Returns encrypted field paths for a model

---

### Encrypted Fields (from Schema Registry)

```javascript
// From packages/core/database/encryption/encryption-schema-registry.js

const ENCRYPTED_FIELDS = {
    User: ['hashword'],
    Credential: [
        'data.access_token',
        'data.refresh_token',
        'data.id_token',
        'data.domain',
    ],
    IntegrationMapping: ['mapping'],
    Token: ['token'],
};
```

**DocumentDBEncryptionService** will automatically encrypt/decrypt these fields when `encryptFields()`/`decryptFields()` is called with the corresponding model name.

---

## Implementation Plan

### Phase 1: Create DocumentDBEncryptionService (New File)

**Files to Create**:

1. `packages/core/database/documentdb-encryption-service.js`
2. `packages/core/database/__tests__/documentdb-encryption-service.test.js`

**Implementation Checklist**:

#### 1.1 Service Class (`documentdb-encryption-service.js`)

-   [ ] Create file with standard file header comment
-   [ ] Import dependencies: `Cryptor`, `getEncryptedFields`
-   [ ] Create `DocumentDBEncryptionService` class
-   [ ] Implement `constructor()` - calls `_initializeCryptor()`
-   [ ] Implement `_initializeCryptor()` - matches `prisma.js` logic
    -   [ ] Check STAGE environment variable
    -   [ ] Implement bypass for dev/test/local
    -   [ ] Check for KMS_KEY_ARN
    -   [ ] Check for AES_KEY_ID
    -   [ ] Create Cryptor with shouldUseAws flag
    -   [ ] Set this.enabled flag
-   [ ] Implement `encryptFields(modelName, document)`
    -   [ ] Early returns for disabled/invalid input
    -   [ ] Get encrypted fields from registry
    -   [ ] Loop through field paths
    -   [ ] Call `_encryptFieldPath()` for each
-   [ ] Implement `decryptFields(modelName, document)`
    -   [ ] Early returns for disabled/invalid input
    -   [ ] Get encrypted fields from registry
    -   [ ] Loop through field paths
    -   [ ] Call `_decryptFieldPath()` for each
-   [ ] Implement `_encryptFieldPath(document, fieldPath, modelName)`
    -   [ ] Parse field path (split by '.')
    -   [ ] Navigate to parent object
    -   [ ] Check if already encrypted
    -   [ ] Convert to string if needed
    -   [ ] Call `this.cryptor.encrypt()`
    -   [ ] Error handling with context
-   [ ] Implement `_decryptFieldPath(document, fieldPath, modelName)`
    -   [ ] Parse field path
    -   [ ] Navigate to parent object
    -   [ ] Check if encrypted format
    -   [ ] Call `this.cryptor.decrypt()`
    -   [ ] Try to parse as JSON
    -   [ ] Error handling (set to null on failure)
-   [ ] Implement `_isEncryptedValue(value)`
    -   [ ] Type check (must be string)
    -   [ ] Split by ':'
    -   [ ] Check for 4+ parts
-   [ ] Add JSDoc comments for all public methods
-   [ ] Export: `module.exports = { DocumentDBEncryptionService };`

#### 1.2 Service Tests (`__tests__/documentdb-encryption-service.test.js`)

-   [ ] Create test file with describe block
-   [ ] Mock dependencies: `Cryptor`, `getEncryptedFields`
-   [ ] **Test Group: Initialization**
    -   [ ] Test bypass in dev stage
    -   [ ] Test bypass in test stage
    -   [ ] Test bypass in local stage
    -   [ ] Test enabled with KMS_KEY_ARN in production
    -   [ ] Test enabled with AES_KEY_ID in production
    -   [ ] Test disabled with no keys in production
    -   [ ] Test KMS takes precedence over AES
-   [ ] **Test Group: encryptFields()**
    -   [ ] Test returns unchanged when disabled (dev stage)
    -   [ ] Test returns unchanged for null document
    -   [ ] Test returns unchanged for non-object document
    -   [ ] Test returns unchanged when no encrypted fields in registry
    -   [ ] Test encrypts User.hashword
    -   [ ] Test encrypts Credential.data.access_token
    -   [ ] Test encrypts Credential.data.refresh_token
    -   [ ] Test encrypts multiple nested fields
    -   [ ] Test skips already encrypted values
    -   [ ] Test skips null values
    -   [ ] Test skips non-existent paths
    -   [ ] Test encrypts objects (JSON.stringify)
    -   [ ] Test error handling (propagates error)
-   [ ] **Test Group: decryptFields()**
    -   [ ] Test returns unchanged when disabled
    -   [ ] Test returns unchanged for null document
    -   [ ] Test returns unchanged for non-object document
    -   [ ] Test returns unchanged when no encrypted fields in registry
    -   [ ] Test decrypts User.hashword
    -   [ ] Test decrypts Credential.data.access_token
    -   [ ] Test decrypts multiple nested fields
    -   [ ] Test skips plain text values
    -   [ ] Test skips null values
    -   [ ] Test skips non-existent paths
    -   [ ] Test parses JSON objects after decryption
    -   [ ] Test handles non-JSON strings
    -   [ ] Test error handling (sets field to null)
-   [ ] **Test Group: \_isEncryptedValue()**
    -   [ ] Test returns false for plain text
    -   [ ] Test returns false for null
    -   [ ] Test returns false for numbers
    -   [ ] Test returns false for objects
    -   [ ] Test returns false for short strings (< 4 parts)
    -   [ ] Test returns true for encrypted format (4+ parts with colons)
-   [ ] **Test Coverage Target**: >90% line coverage

**Estimated Time**: 2-3 hours

---

### Phase 1.5: Fix Critical Issues from Code Review

**Status**: ⚠️ CRITICAL - Must complete before Phase 2

**Context**: After Phase 1 implementation and code review, three critical issues were identified that must be fixed before integrating the service into repositories. These issues address data corruption, silent failures, and testability concerns.

**Code Review Summary**: Overall assessment 6/10 → 8/10 after fixes

---

#### Critical Issue #1: JSON.parse Corrupts Date Objects

**Problem**:

```javascript
// Current implementation (lines 101, 147)
const result = JSON.parse(JSON.stringify(document));
```

**Why it's critical**:

-   `JSON.stringify()` converts Date objects to ISO strings
-   `JSON.parse()` does NOT convert them back to Date objects
-   OAuth tokens often have `expires_at` as Date objects
-   This causes **silent data corruption** in production

**Example of corruption**:

```javascript
const credential = {
    data: { access_token: 'secret' },
    expires_at: new Date('2025-12-31'), // Date object
};

const encrypted = await service.encryptFields('Credential', credential);
// encrypted.expires_at is now "2025-12-31T00:00:00.000Z" (STRING, not Date)
// This breaks any code expecting Date.getTime(), Date.toISOString(), etc.
```

**Fix**:

```javascript
// Use structuredClone (Node.js 17+)
const result = structuredClone(document);
```

**Benefits of structuredClone**:

-   ✅ Preserves Date objects
-   ✅ Preserves RegExp objects
-   ✅ Preserves Buffer objects
-   ✅ Handles circular references
-   ✅ Native Node.js function (no dependencies)

**Files to Update**:

-   `documentdb-encryption-service.js` lines 101, 147

**Checklist**:

-   [ ] Replace `JSON.parse(JSON.stringify(document))` in `encryptFields()` (line 101)
-   [ ] Replace `JSON.parse(JSON.stringify(document))` in `decryptFields()` (line 147)
-   [ ] Add test case: `it('preserves Date objects in documents')`
-   [ ] Verify Node.js version supports structuredClone (>=17)

**Estimated Time**: 5 minutes

---

#### Critical Issue #2: Decryption Failures Set to Null

**Problem**:

```javascript
// Current implementation (_decryptFieldPath, line 258)
catch (error) {
    console.error('[DocumentDBEncryptionService] Failed to decrypt...', errorContext);
    current[fieldName] = null;  // ❌ Silent data loss
}
```

**Why it's critical**:

-   **Silent credential loss** - Application continues with null tokens
-   **Hard to debug** - Error logged but not propagated
-   **Security risk** - Could mask key rotation issues or corrupted data
-   **Cascade failures** - Null propagates until crash elsewhere

**Real-world scenario**:

```javascript
// Encrypted credential in database (key rotated or corrupted)
const credential = await findCredential(userId);
// Decryption silently fails, field set to null

// Application continues
const api = new AsanaAPI({ token: credential.access_token });
// ❌ Later crashes with "Cannot use null as token" far from root cause
```

**Why this is wrong**:

-   Violates fail-fast principle (errors should be discovered immediately)
-   Inconsistent with `encryptFields()` which throws errors
-   Repository can't distinguish null data from decryption failure

**Fix**:

```javascript
// Throw error immediately (fail fast)
catch (error) {
    console.error('[DocumentDBEncryptionService] Failed to decrypt...', errorContext);
    throw new Error(`Decryption failed for ${modelName}.${fieldPath}: ${error.message}`);
}
```

**Files to Update**:

-   `documentdb-encryption-service.js` line 258
-   `documentdb-encryption-service.test.js` update test "sets field to null on decryption error"

**Checklist**:

-   [ ] Remove `current[fieldName] = null;` from `_decryptFieldPath()` (line 258)
-   [ ] Add `throw new Error(...)` with context
-   [ ] Update test: change from `expect(result.hashword).toBeNull()` to `expect(...).rejects.toThrow()`
-   [ ] Update test name: "throws error on decryption failure" (not "sets field to null")
-   [ ] Verify all 56+ tests still pass

**Estimated Time**: 10 minutes

---

#### Critical Issue #3: No Cryptor Dependency Injection

**Problem**:

```javascript
// Current implementation (constructor, lines 24-26)
constructor() {
    this._initializeCryptor();  // ❌ Creates Cryptor internally
}

_initializeCryptor() {
    this.cryptor = new Cryptor({ shouldUseAws });  // ❌ Hard-coded
}
```

**Why it's critical**:

-   **Repository tests break** - Can't mock encryption in Phase 2-4
-   **Requires real keys** - Tests need AWS credentials or AES keys
-   **Slower tests** - Real encryption is slower than mocks
-   **Can't test error scenarios** - Can't simulate Cryptor failures

**Impact on Phase 2 (UserRepositoryDocumentDB tests)**:

```javascript
describe('UserRepositoryDocumentDB', () => {
    it('encrypts hashword before saving', async () => {
        // ❌ PROBLEM: Can't mock DocumentDBEncryptionService's Cryptor
        const service = new DocumentDBEncryptionService();
        // Tries to create real Cryptor - tests fail without keys

        const repo = new UserRepositoryDocumentDB({
            encryptionService: service,
        });
        await repo.createUser({ hashword: 'password' });
        // ❌ Real KMS/AES encryption happens in tests
    });
});
```

**Fix**:

```javascript
class DocumentDBEncryptionService {
    constructor({ cryptor = null } = {}) {
        if (cryptor) {
            // Dependency injection - use provided Cryptor (for testing)
            this.cryptor = cryptor;
            this.enabled = true;
        } else {
            // Default behavior - create Cryptor from environment
            this._initializeCryptor();
        }
    }
}
```

**Usage**:

```javascript
// In tests (with mock)
const mockCryptor = {
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('decrypted'),
};
const service = new DocumentDBEncryptionService({ cryptor: mockCryptor });

// In production (uses environment config)
const service = new DocumentDBEncryptionService();
```

**Files to Update**:

-   `documentdb-encryption-service.js` constructor
-   `documentdb-encryption-service.test.js` add dependency injection test

**Checklist**:

-   [ ] Change constructor signature: `constructor({ cryptor = null } = {})`
-   [ ] Add conditional logic: if cryptor provided, use it; else call `_initializeCryptor()`
-   [ ] Set `this.enabled = true` when cryptor injected
-   [ ] Add test: `it('accepts injected Cryptor for testing')`
-   [ ] Verify injection test passes
-   [ ] Verify all existing tests still pass

**Estimated Time**: 15 minutes

---

#### Phase 1.5 Summary

**Total Changes**:

-   3 files modified
-   5 lines of code changed (service implementation)
-   3 new/updated test cases
-   0 breaking changes (backward compatible)

**Total Time**: ~30 minutes

**Success Criteria**:

-   ✅ All 56+ tests pass
-   ✅ Date objects preserved in documents
-   ✅ Decryption failures throw errors
-   ✅ Cryptor can be injected for testing
-   ✅ 100% code coverage maintained
-   ✅ Code review assessment improves from 6/10 to 8/10

**Validation**:

```javascript
// Test 1: Date preservation
const doc = { data: { token: 'secret' }, createdAt: new Date() };
const encrypted = await service.encryptFields('Model', doc);
expect(encrypted.createdAt).toBeInstanceOf(Date); // ✅ Must pass

// Test 2: Decryption error throws
const corrupted = { data: { token: 'corrupted_encrypted_value' } };
await expect(service.decryptFields('Model', corrupted)).rejects.toThrow(
    'Decryption failed'
); // ✅ Must pass

// Test 3: Dependency injection
const mockCryptor = { encrypt: jest.fn(), decrypt: jest.fn() };
const service = new DocumentDBEncryptionService({ cryptor: mockCryptor });
expect(service.cryptor).toBe(mockCryptor); // ✅ Must pass
```

**Next Step**: After Phase 1.5 completion, proceed to Phase 2 (Refactor UserRepositoryDocumentDB)

---

### Phase 2: Refactor UserRepositoryDocumentDB

**File**: `packages/core/user/repositories/user-repository-documentdb.js`

**Changes Checklist**:

-   [ ] Import DocumentDBEncryptionService at top of file
-   [ ] **Remove existing encryption methods** (lines 24-148):
    -   [ ] Remove `_initializeCryptor()` method
    -   [ ] Remove `_encryptField()` method
    -   [ ] Remove `_decryptField()` method
    -   [ ] Remove `_isEncryptedValue()` method
    -   [ ] Remove `_encryptHashword()` method
    -   [ ] Remove `_decryptHashword()` method
-   [ ] **Update constructor**:
    -   [ ] Add: `this.encryptionService = new DocumentDBEncryptionService();`
    -   [ ] Remove: `this._initializeCryptor();`
-   [ ] **Update `createIndividualUser()` method** (around line 183):
    -   [ ] After building document, before insertOne():
        ```javascript
        const encryptedDocument = await this.encryptionService.encryptFields(
            'User',
            document
        );
        const insertedId = await insertOne(
            this.prisma,
            'User',
            encryptedDocument
        );
        ```
    -   [ ] After findOne(), before \_mapUser():
        ```javascript
        const decryptedUser = await this.encryptionService.decryptFields(
            'User',
            created
        );
        return this._mapUser(decryptedUser);
        ```
-   [ ] **Update `createOrganizationUser()` method**:
    -   [ ] No changes needed (no encrypted fields for organization users)
-   [ ] **Update `findIndividualUserById()` method** (around line 165):
    -   [ ] After findOne():
        ```javascript
        const decryptedUser = await this.encryptionService.decryptFields(
            'User',
            doc
        );
        return this._mapUser(decryptedUser);
        ```
-   [ ] **Update `findIndividualUserByUsername()` method**:
    -   [ ] Same pattern: decrypt after findOne()
-   [ ] **Update `findIndividualUserByEmail()` method**:
    -   [ ] Same pattern: decrypt after findOne()
-   [ ] **Update `findIndividualUserByAppUserId()` method**:
    -   [ ] Same pattern: decrypt after findOne()
-   [ ] **Update `findIndividualUserById()` method**:
    -   [ ] Same pattern: decrypt after findOne()
-   [ ] **Update `updateIndividualUser()` method** (around line 303):
    -   [ ] After preparing update payload, encrypt before updateOne():
        ```javascript
        const encryptedPayload = await this.encryptionService.encryptFields(
            'User',
            payload
        );
        await updateOne(
            this.prisma,
            'User',
            { _id: objectId, type: 'INDIVIDUAL' },
            { $set: encryptedPayload }
        );
        ```
    -   [ ] After findOne(), decrypt before \_mapUser():
        ```javascript
        const decryptedUser = await this.encryptionService.decryptFields(
            'User',
            updated
        );
        return this._mapUser(decryptedUser);
        ```
-   [ ] **Update `updateOrganizationUser()` method**:
    -   [ ] No changes needed (no encrypted fields)
-   [ ] Verify no references to old encryption methods remain
-   [ ] Run linter to check for issues
-   [ ] Test locally

**Estimated Time**: 1 hour

---

### Phase 3: Refactor ModuleRepositoryDocumentDB

**File**: `packages/core/modules/repositories/module-repository-documentdb.js`

**Changes Checklist**:

-   [ ] Import DocumentDBEncryptionService at top of file
-   [ ] **Remove existing encryption methods** (lines 22-117):
    -   [ ] Remove `_initializeCryptor()` method
    -   [ ] Remove `_encryptField()` method
    -   [ ] Remove `_decryptField()` method
    -   [ ] Remove `_isEncryptedValue()` method
    -   [ ] Remove `_decryptCredentialData()` method
-   [ ] **Update constructor**:
    -   [ ] Add: `this.encryptionService = new DocumentDBEncryptionService();`
    -   [ ] Remove: `this._initializeCryptor();`
-   [ ] **Update `_fetchCredential()` method** (around line 241):
    -   [ ] After findOne(), before returning:
        ```javascript
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            rawCredential
        );
        return {
            id: fromObjectId(decryptedCredential._id),
            userId: fromObjectId(decryptedCredential.userId),
            externalId: decryptedCredential.externalId ?? null,
            authIsValid: decryptedCredential.authIsValid ?? null,
            createdAt: decryptedCredential.createdAt,
            updatedAt: decryptedCredential.updatedAt,
            data: decryptedCredential.data,
        };
        ```
-   [ ] **Update `_fetchCredentialsBulk()` method** (around line 280):
    -   [ ] Inside the map function for each credential:
        ```javascript
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            rawCredential
        );
        return this._convertCredentialIds({
            id: fromObjectId(decryptedCredential._id),
            // ... rest of mapping
            data: decryptedCredential.data,
        });
        ```
-   [ ] Verify no references to old encryption methods remain
-   [ ] Run linter to check for issues
-   [ ] Test locally

**Note**: ModuleRepository doesn't create/update credentials, only reads them. It relies on CredentialRepository for writes.

**Estimated Time**: 1 hour

---

### Phase 4: Fix CredentialRepositoryDocumentDB (CRITICAL)

**File**: `packages/core/credential/repositories/credential-repository-documentdb.js`

**Critical Priority**: This is the security vulnerability fix

**Changes Checklist**:

-   [ ] Import DocumentDBEncryptionService at top of file
-   [ ] **Update constructor**:
    -   [ ] Add: `this.encryptionService = new DocumentDBEncryptionService();`
-   [ ] **Fix `upsertCredential()` method** (around line 50):

    -   [ ] **Current problematic code**:

        ```javascript
        const { user, userId, authIsValid, externalId, ...oauthData } =
            details || {};
        // oauthData contains PLAIN TEXT: access_token, refresh_token, etc.

        const document = {
            data: oauthData, // ❌ STORED AS PLAIN TEXT
        };
        await insertOne(this.prisma, 'Credential', document);
        ```

    -   [ ] **Replace with ENCRYPTED version**:

        ```javascript
        const { user, userId, authIsValid, externalId, ...oauthData } =
            details || {};

        // Build plain text document
        const plainDocument = {
            userId: toObjectId(userId || user),
            externalId: externalId ?? null,
            authIsValid: authIsValid ?? true,
            data: oauthData, // Still plain text at this point
            createdAt: now,
            updatedAt: now,
        };

        // ✅ ENCRYPT before storing
        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            plainDocument
        );

        const insertedId = await insertOne(
            this.prisma,
            'Credential',
            encryptedDocument
        );

        // Read back and decrypt
        const created = await findOne(this.prisma, 'Credential', {
            _id: insertedId,
        });
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            created
        );

        return this._mapCredential(decryptedCredential);
        ```

    -   [ ] **For UPDATE case** (when credential exists):

        ```javascript
        // Merge existing data with new data
        const existingData = existing.data || {};
        const mergedData = { ...existingData, ...oauthData };

        // Build update document
        const updateDocument = {
            data: mergedData,
            authIsValid: authIsValid ?? existing.authIsValid,
            updatedAt: now,
        };

        // ✅ ENCRYPT before storing
        const encryptedUpdate = await this.encryptionService.encryptFields(
            'Credential',
            { data: updateDocument.data } // Only encrypt the data field
        );

        await updateOne(
            this.prisma,
            'Credential',
            { _id: existing._id },
            {
                $set: {
                    data: encryptedUpdate.data,
                    authIsValid: updateDocument.authIsValid,
                    updatedAt: updateDocument.updatedAt,
                },
            }
        );

        // Read back and decrypt
        const updated = await findOne(this.prisma, 'Credential', {
            _id: existing._id,
        });
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            updated
        );

        return this._mapCredential(decryptedCredential);
        ```

-   [ ] **Fix `_mapCredential()` method** (around line 192):
    -   [ ] **Current problematic code**:
        ```javascript
        _mapCredential(doc) {
            const data = doc?.data || {};
            return {
                id: fromObjectId(doc._id),
                userId: fromObjectId(doc.userId),
                externalId: doc.externalId ?? null,
                authIsValid: doc.authIsValid ?? null,
                ...data  // ❌ Could be encrypted strings
            };
        }
        ```
    -   [ ] **Note**: If we decrypt in `upsertCredential()` before calling `_mapCredential()`, this method doesn't need changes. But for safety:
        ```javascript
        _mapCredential(doc) {
            // Assume doc is already decrypted by caller
            // (upsertCredential, findCredential should decrypt before calling this)
            const data = doc?.data || {};
            return {
                id: fromObjectId(doc._id),
                userId: fromObjectId(doc.userId),
                externalId: doc.externalId ?? null,
                authIsValid: doc.authIsValid ?? null,
                ...data  // Already decrypted
            };
        }
        ```
-   [ ] **Fix `findCredential()` method** (if exists):

    -   [ ] After findOne(), decrypt:

        ```javascript
        const doc = await findOne(this.prisma, 'Credential', filter);
        if (!doc) return null;

        const decryptedDoc = await this.encryptionService.decryptFields(
            'Credential',
            doc
        );
        return this._mapCredential(decryptedDoc);
        ```

-   [ ] **Fix `findManyCredentials()` method** (if exists):

    -   [ ] After findMany(), decrypt each:

        ```javascript
        const docs = await findMany(this.prisma, 'Credential', filter);

        const decryptedDocs = await Promise.all(
            docs.map((doc) =>
                this.encryptionService.decryptFields('Credential', doc)
            )
        );

        return decryptedDocs.map((doc) => this._mapCredential(doc));
        ```

-   [ ] Add JSDoc comments explaining encryption
-   [ ] Verify all credential read/write operations are covered
-   [ ] Run linter
-   [ ] Test locally with real OAuth flow

**Security Verification**:

-   [ ] Create test credential with `access_token: "test_secret"`
-   [ ] Query database directly (bypass repository)
-   [ ] Verify stored value is encrypted format: `"keyId:iv:cipher:encKey"`
-   [ ] Verify repository returns decrypted value: `"test_secret"`

**Estimated Time**: 1.5 hours

---

### Phase 5: Add Comprehensive Tests

#### 5.1 User Repository Encryption Tests

**File**: `packages/core/user/repositories/__tests__/user-repository-documentdb-encryption.test.js`

**Test Coverage Checklist**:

-   [ ] Create test file with describe block
-   [ ] Mock DocumentDBEncryptionService
-   [ ] **Test Group: Encryption on Write**
    -   [ ] Test `createIndividualUser()` encrypts hashword before insert
    -   [ ] Test `updateIndividualUser()` encrypts hashword before update
    -   [ ] Verify encrypted format in database (use direct query)
    -   [ ] Verify plain text never stored
-   [ ] **Test Group: Decryption on Read**
    -   [ ] Test `findIndividualUserById()` returns decrypted hashword
    -   [ ] Test `findIndividualUserByUsername()` returns decrypted hashword
    -   [ ] Test `findIndividualUserByEmail()` returns decrypted hashword
    -   [ ] Verify application receives plain text
-   [ ] **Test Group: Stage-Based Bypass**
    -   [ ] Test encryption bypassed in dev stage
    -   [ ] Test encryption bypassed in test stage
    -   [ ] Test encryption bypassed in local stage
    -   [ ] Test encryption enabled in production stage
-   [ ] **Test Group: Edge Cases**
    -   [ ] Test null hashword handling
    -   [ ] Test undefined hashword handling
    -   [ ] Test empty string hashword
    -   [ ] Test already encrypted hashword (idempotent)
-   [ ] **Test Group: Error Handling**
    -   [ ] Test encryption service throws error
    -   [ ] Test decryption service throws error
    -   [ ] Verify error propagation to use case
-   [ ] Run tests: `npm test user-repository-documentdb-encryption.test.js`

**Estimated Time**: 1.5 hours

---

#### 5.2 Module Repository Encryption Tests

**File**: `packages/core/modules/repositories/__tests__/module-repository-documentdb-encryption.test.js`

**Test Coverage Checklist**:

-   [ ] Create test file with describe block
-   [ ] Mock DocumentDBEncryptionService
-   [ ] Mock credential data in database (pre-encrypted)
-   [ ] **Test Group: Credential Decryption**
    -   [ ] Test `_fetchCredential()` decrypts credential data
    -   [ ] Test `_fetchCredentialsBulk()` decrypts multiple credentials
    -   [ ] Verify nested field decryption (data.access_token)
    -   [ ] Verify multiple field decryption (access_token, refresh_token, id_token)
-   [ ] **Test Group: Integration with Entities**
    -   [ ] Test `findEntityById()` returns entity with decrypted credential
    -   [ ] Test `findEntitiesByUserId()` returns entities with decrypted credentials
    -   [ ] Test `findEntitiesByUserIdAndModuleName()` decrypts credentials
-   [ ] **Test Group: Error Handling**
    -   [ ] Test corrupted encrypted data (decryption fails)
    -   [ ] Test missing credential (null credential)
    -   [ ] Verify graceful degradation
-   [ ] **Test Group: Performance**
    -   [ ] Test bulk decryption of 10 credentials
    -   [ ] Verify parallel decryption (not sequential)
-   [ ] Run tests: `npm test module-repository-documentdb-encryption.test.js`

**Estimated Time**: 1.5 hours

---

#### 5.3 Credential Repository Encryption Tests (NEW - CRITICAL)

**File**: `packages/core/credential/repositories/__tests__/credential-repository-documentdb-encryption.test.js`

**Test Coverage Checklist**:

-   [ ] Create test file with describe block
-   [ ] Mock DocumentDBEncryptionService
-   [ ] Setup DocumentDB test database
-   [ ] **Test Group: Encryption on Upsert (INSERT)**

    -   [ ] Test encrypts access_token before insert
    -   [ ] Test encrypts refresh_token before insert
    -   [ ] Test encrypts id_token before insert
    -   [ ] Test encrypts domain before insert
    -   [ ] **Verify encrypted format in database**:

        ```javascript
        // Direct database query (bypass repository)
        const rawDoc = await prisma.$runCommandRaw({
            find: 'Credential',
            filter: { userId: toObjectId(userId) },
        });
        const storedToken = rawDoc.cursor.firstBatch[0].data.access_token;

        // Must match encrypted format
        expect(storedToken).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/);
        expect(storedToken).not.toBe('plain_secret');
        ```

-   [ ] **Test Group: Encryption on Upsert (UPDATE)**
    -   [ ] Test existing credential update encrypts new tokens
    -   [ ] Test merges existing encrypted data with new encrypted data
    -   [ ] Test updates preserve other credential fields
-   [ ] **Test Group: Decryption on Read**

    -   [ ] Test `upsertCredential()` returns decrypted credential
    -   [ ] Test `findCredential()` returns decrypted credential (if exists)
    -   [ ] Test `_mapCredential()` receives decrypted data
    -   [ ] **Verify plain text returned to application**:

        ```javascript
        const credential = await repository.upsertCredential({
            userId,
            externalId,
            access_token: 'plain_secret',
            refresh_token: 'plain_refresh',
        });

        expect(credential.access_token).toBe('plain_secret');
        expect(credential.refresh_token).toBe('plain_refresh');
        ```

-   [ ] **Test Group: Integration Flow**
    -   [ ] Test full flow: insert → read → verify
    -   [ ] Test full flow: insert → update → read → verify
    -   [ ] Test multiple credentials per user
    -   [ ] Test credential retrieval by externalId
-   [ ] **Test Group: Security Validation**
    -   [ ] Test KMS encryption in production stage
    -   [ ] Test AES encryption when KMS unavailable
    -   [ ] Test bypass in dev/test/local stages
    -   [ ] Test plain text never exposed in logs
-   [ ] **Test Group: Error Handling**
    -   [ ] Test encryption service throws error on insert
    -   [ ] Test decryption service throws error on read
    -   [ ] Test partial credential data (missing fields)
    -   [ ] Test null values for optional fields
-   [ ] **Test Group: Edge Cases**
    -   [ ] Test empty oauth data
    -   [ ] Test very large token values (>1KB)
    -   [ ] Test special characters in tokens
    -   [ ] Test unicode in tokens
-   [ ] Run tests: `npm test credential-repository-documentdb-encryption.test.js`

**Security Test Example**:

```javascript
describe('Security - Encryption Verification', () => {
    it('stores access_token in encrypted format in database', async () => {
        const userId = new ObjectId();
        const externalId = 'test-external-123';
        const plainToken = 'ya29.actual_google_token_here';

        // Create credential via repository
        await credentialRepo.upsertCredential({
            userId: fromObjectId(userId),
            externalId,
            access_token: plainToken,
        });

        // Query database directly (bypass repository and encryption)
        const rawResult = await prisma.$runCommandRaw({
            find: 'Credential',
            filter: { userId, externalId },
        });

        const storedCredential = rawResult.cursor.firstBatch[0];
        const storedToken = storedCredential.data.access_token;

        // CRITICAL: Verify encrypted format
        expect(storedToken).not.toBe(plainToken); // Must not be plain text
        expect(storedToken).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/); // Must be "keyId:iv:cipher:encKey"

        // Verify repository returns decrypted value
        const retrieved = await credentialRepo.findCredential({
            userId,
            externalId,
        });
        expect(retrieved.access_token).toBe(plainToken); // Must be decrypted
    });
});
```

**Estimated Time**: 2 hours

---

### Phase 6: Apply to Both Locations

**Dual Location Rule**: All changes must be applied to BOTH:

1. **Development**: `/Users/danielklotz/projects/lefthook/frontify--frigg/tmp/frigg/packages/core/`
2. **Runtime**: `/Users/danielklotz/projects/lefthook/frontify--frigg/backend/node_modules/@friggframework/core/`

**Files to Update in Both Locations**:

-   [ ] `database/documentdb-encryption-service.js` (NEW)
-   [ ] `database/__tests__/documentdb-encryption-service.test.js` (NEW)
-   [ ] `user/repositories/user-repository-documentdb.js`
-   [ ] `user/repositories/__tests__/user-repository-documentdb-encryption.test.js` (NEW)
-   [ ] `modules/repositories/module-repository-documentdb.js`
-   [ ] `modules/repositories/__tests__/module-repository-documentdb-encryption.test.js` (NEW)
-   [ ] `credential/repositories/credential-repository-documentdb.js`
-   [ ] `credential/repositories/__tests__/credential-repository-documentdb-encryption.test.js` (NEW)

**Verification Steps**:

For each file:

-   [ ] Copy from `/tmp/frigg/` to `/backend/node_modules/@friggframework/`
-   [ ] Verify file checksums match
-   [ ] Run `diff` to confirm identical content
-   [ ] Check file permissions

**Script to Automate** (optional):

```bash
#!/bin/bash
# sync-documentdb-encryption.sh

SOURCE="/Users/danielklotz/projects/lefthook/frontify--frigg/tmp/frigg/packages/core"
DEST="/Users/danielklotz/projects/lefthook/frontify--frigg/backend/node_modules/@friggframework/core"

FILES=(
    "database/documentdb-encryption-service.js"
    "database/__tests__/documentdb-encryption-service.test.js"
    "user/repositories/user-repository-documentdb.js"
    "user/repositories/__tests__/user-repository-documentdb-encryption.test.js"
    "modules/repositories/module-repository-documentdb.js"
    "modules/repositories/__tests__/module-repository-documentdb-encryption.test.js"
    "credential/repositories/credential-repository-documentdb.js"
    "credential/repositories/__tests__/credential-repository-documentdb-encryption.test.js"
)

for file in "${FILES[@]}"; do
    cp "$SOURCE/$file" "$DEST/$file"
    echo "✅ Synced: $file"
done

echo "🎉 All files synced successfully"
```

**Estimated Time**: 30 minutes

---

### Phase 7: Validation & Testing

#### 7.1 Run Test Suites

**Test Execution Checklist**:

-   [ ] **Run DocumentDB encryption service tests**:

    ```bash
    cd /Users/danielklotz/projects/lefthook/frontify--frigg/tmp/frigg
    npm test packages/core/database/__tests__/documentdb-encryption-service.test.js
    ```

    -   [ ] Verify all tests pass
    -   [ ] Check coverage >90%

-   [ ] **Run User repository encryption tests**:

    ```bash
    npm test packages/core/user/repositories/__tests__/user-repository-documentdb-encryption.test.js
    ```

    -   [ ] Verify all tests pass

-   [ ] **Run Module repository encryption tests**:

    ```bash
    npm test packages/core/modules/repositories/__tests__/module-repository-documentdb-encryption.test.js
    ```

    -   [ ] Verify all tests pass

-   [ ] **Run Credential repository encryption tests** (CRITICAL):

    ```bash
    npm test packages/core/credential/repositories/__tests__/credential-repository-documentdb-encryption.test.js
    ```

    -   [ ] Verify all tests pass
    -   [ ] Verify security test passes (encrypted format verification)

-   [ ] **Run all repository tests**:

    ```bash
    npm test -- --testPathPattern=documentdb
    ```

    -   [ ] Verify no regressions

-   [ ] **Run full test suite**:
    ```bash
    npm test
    ```
    -   [ ] Verify all tests pass
    -   [ ] Check for no unexpected failures

---

#### 7.2 Manual Verification

**Local Environment Setup**:

-   [ ] Start MongoDB (DocumentDB simulation):

    ```bash
    cd /Users/danielklotz/projects/lefthook/frontify--frigg/backend
    npm run docker:start
    ```

-   [ ] Verify MongoDB is running:

    ```bash
    docker ps | grep mongo
    ```

-   [ ] Set environment variables for encryption:

    ```bash
    export STAGE=production
    export AES_KEY_ID=local-test-key
    export AES_KEY=01234567890123456789012345678901  # 32 chars
    ```

-   [ ] Start backend:
    ```bash
    cd /Users/danielklotz/projects/lefthook/frontify--frigg/backend
    npm run frigg:start
    ```

**Manual Test: Credential Creation**

-   [ ] Create user and get token:

    ```bash
    curl -X POST http://localhost:3000/user/create \
      -H "Content-Type: application/json" \
      -d '{"username":"test@test.com","password":"test"}' \
      -o /tmp/token.json

    TOKEN=$(jq -r '.token' /tmp/token.json)
    echo "Token: $TOKEN"
    ```

-   [ ] Create OAuth credential (if endpoint exists, else use Asana OAuth flow):
    ```bash
    # Trigger OAuth flow through application
    # Then verify credential was created encrypted
    ```

**Manual Test: Database Verification**

-   [ ] Connect to MongoDB:

    ```bash
    docker exec -it $(docker ps -q -f name=mongo) mongosh
    ```

-   [ ] Query credential:

    ```javascript
    use frigg
    db.Credential.findOne()
    ```

-   [ ] **CRITICAL VERIFICATION**:

    ```javascript
    // Check data.access_token format
    const cred = db.Credential.findOne({ externalId: 'google-user-123' });
    print('access_token:', cred.data.access_token);

    // Expected format: "keyId:iv:cipher:encKey"
    // Example: "aes-key-1:1234567890abcdef:a1b2c3d4e5f6...:9876543210fedcba"

    // MUST NOT be plain text like "ya29.a0AfH6SMCX..."
    ```

-   [ ] Verify encrypted format:
    ```javascript
    // Should have 4+ colon-separated parts
    const parts = cred.data.access_token.split(':');
    print('Parts count:', parts.length); // Should be >= 4
    ```

**Manual Test: API Usage**

-   [ ] Use credential through API:

    ```bash
    # Make API request that uses the credential
    # Example: Fetch Asana user info
    curl -X GET http://localhost:3000/api/asana/me \
      -H "Authorization: Bearer $TOKEN"
    ```

-   [ ] Verify API call succeeds (credential was decrypted correctly)

**Manual Test: Stage Bypass**

-   [ ] Stop backend

-   [ ] Change to dev stage:

    ```bash
    export STAGE=dev
    unset AES_KEY_ID
    unset AES_KEY
    ```

-   [ ] Start backend

-   [ ] Create credential

-   [ ] Verify credential stored as plain text (bypass worked):
    ```javascript
    // In mongosh:
    const devCred = db.Credential.findOne({ userId: ObjectId('...') });
    print('access_token:', devCred.data.access_token);
    // Should be plain text (not encrypted) in dev stage
    ```

---

#### 7.3 Integration Testing

**OAuth Flow Testing**:

-   [ ] **Asana OAuth Flow**:

    -   [ ] Start OAuth flow via Asana integration
    -   [ ] Complete OAuth authorization
    -   [ ] Verify credential created in database
    -   [ ] Check credential is encrypted in database
    -   [ ] Verify Asana API calls work (credential decrypted)

-   [ ] **Frontify OAuth Flow**:
    -   [ ] Start OAuth flow via Frontify integration
    -   [ ] Complete OAuth authorization
    -   [ ] Verify credential created in database
    -   [ ] Check credential is encrypted in database
    -   [ ] Verify Frontify API calls work

**Credential Refresh Testing**:

-   [ ] Trigger token refresh (if implemented)
-   [ ] Verify new tokens are encrypted
-   [ ] Verify old tokens are overwritten (not duplicated)
-   [ ] Verify refresh token itself is encrypted

**Multi-User Testing**:

-   [ ] Create credentials for 3 different users
-   [ ] Verify each credential is independently encrypted
-   [ ] Verify users can only access their own credentials
-   [ ] Check for no credential leakage between users

---

#### 7.4 Performance Testing

**Encryption Performance**:

-   [ ] Measure encryption time for single credential:

    ```javascript
    const start = Date.now();
    const encrypted = await service.encryptFields('Credential', credential);
    const encryptTime = Date.now() - start;
    console.log(`Encryption time: ${encryptTime}ms`);
    // Should be < 50ms for KMS, < 10ms for AES
    ```

-   [ ] Measure decryption time for single credential

**Bulk Operations**:

-   [ ] Test bulk credential retrieval (10 credentials):

    ```javascript
    const start = Date.now();
    const entities = await moduleRepo.findEntitiesByUserId(userId);
    const bulkTime = Date.now() - start;
    console.log(`Bulk retrieval time: ${bulkTime}ms`);
    // Should be reasonable (< 500ms for 10 credentials)
    ```

-   [ ] Verify parallel decryption is used (not sequential)

---

#### 7.5 Security Validation

**Encryption Format Verification**:

-   [ ] Create credential with known value
-   [ ] Query database directly
-   [ ] Verify format matches: `keyId:iv:cipher:encKey`
-   [ ] Verify at least 4 colon-separated parts
-   [ ] Verify base64-like characters in each part

**Decryption Verification**:

-   [ ] Create credential with known value
-   [ ] Retrieve via repository
-   [ ] Verify decrypted value matches original
-   [ ] Verify no corruption or truncation

**Negative Tests**:

-   [ ] Manually corrupt encrypted value in database
-   [ ] Attempt to retrieve credential
-   [ ] Verify graceful handling (field set to null, logged error)
-   [ ] Verify application doesn't crash

**Key Rotation Simulation** (if time permits):

-   [ ] Create credential with key1
-   [ ] Rotate to key2 (change AES_KEY_ID)
-   [ ] Verify old credentials still decrypt (backward compatible)
-   [ ] Verify new credentials use key2

**Estimated Time**: 1.5 hours

---

### Phase 8: Documentation Updates

#### 8.1 Update Main Encryption README

**File**: `packages/core/database/encryption/README.md`

**Sections to Add**:

-   [ ] **Add "DocumentDB Encryption" section** (after "How It Works"):

    ```markdown
    ## DocumentDB Encryption

    ### Why DocumentDB Needs Manual Encryption

    DocumentDB repositories use `$runCommandRaw()` for MongoDB protocol compatibility,
    which bypasses Prisma Client Extensions. This means the automatic encryption
    extension does not apply.

    ### DocumentDBEncryptionService

    For DocumentDB repositories, use `DocumentDBEncryptionService` to manually
    encrypt/decrypt documents before/after database operations.

    #### Usage Example

    \`\`\`javascript
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
    \`\`\`

    #### Configuration

    Uses the same environment variables and Cryptor as the Prisma Extension:

    -   `STAGE`: Bypasses encryption for dev/test/local
    -   `KMS_KEY_ARN`: AWS KMS encryption (production)
    -   `AES_KEY_ID` + `AES_KEY`: AES encryption (fallback)

    #### Implementation Details

    See: [documentdb-encryption-service.md](./documentdb-encryption-service.md)
    ```

-   [ ] **Update "Adding Encrypted Fields" section**:

    ```markdown
    After adding fields to `encryption-schema-registry.js`:

    1. **For MongoDB/PostgreSQL**: No code changes needed (automatic)
    2. **For DocumentDB**: Encryption is automatic via DocumentDBEncryptionService
       (service reads from same registry)
    ```

---

#### 8.2 Repository JSDoc Comments

**UserRepositoryDocumentDB**:

-   [ ] Add class-level JSDoc:
    ```javascript
    /**
     * User repository for DocumentDB.
     * Uses DocumentDBEncryptionService for field-level encryption.
     *
     * Encrypted fields: User.hashword
     *
     * @see DocumentDBEncryptionService
     * @see encryption-schema-registry.js
     */
    class UserRepositoryDocumentDB extends UserRepositoryInterface {
    ```

**ModuleRepositoryDocumentDB**:

-   [ ] Add class-level JSDoc:
    ```javascript
    /**
     * Module/Entity repository for DocumentDB.
     * Uses DocumentDBEncryptionService for credential decryption.
     *
     * Encrypted fields: Credential.data.*
     *
     * Note: This repository only reads credentials. CredentialRepository
     * handles credential creation/updates with encryption.
     *
     * @see DocumentDBEncryptionService
     * @see CredentialRepositoryDocumentDB
     */
    class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    ```

**CredentialRepositoryDocumentDB**:

-   [ ] Add class-level JSDoc:
    ```javascript
    /**
     * Credential repository for DocumentDB.
     * Uses DocumentDBEncryptionService for field-level encryption.
     *
     * Encrypted fields:
     * - Credential.data.access_token
     * - Credential.data.refresh_token
     * - Credential.data.id_token
     * - Credential.data.domain
     *
     * SECURITY CRITICAL: All OAuth credentials must be encrypted at rest.
     *
     * @see DocumentDBEncryptionService
     * @see encryption-schema-registry.js
     */
    class CredentialRepositoryDocumentDB extends CredentialRepositoryInterface {
    ```

**Estimated Time**: 30 minutes

---

## Total Implementation Time Estimate

| Phase     | Description                                | Time          |
| --------- | ------------------------------------------ | ------------- |
| Phase 1   | Create DocumentDBEncryptionService + tests | 2-3 hours     |
| Phase 2   | Refactor UserRepositoryDocumentDB          | 1 hour        |
| Phase 3   | Refactor ModuleRepositoryDocumentDB        | 1 hour        |
| Phase 4   | Fix CredentialRepositoryDocumentDB         | 1.5 hours     |
| Phase 5   | Add comprehensive tests (3 repos)          | 5 hours       |
| Phase 6   | Apply to both locations                    | 30 minutes    |
| Phase 7   | Validation and integration testing         | 1.5 hours     |
| Phase 8   | Documentation updates                      | 30 minutes    |
| **Total** |                                            | **~13 hours** |

---

## Code Examples

### Example 1: Before & After - CredentialRepositoryDocumentDB

**BEFORE (Vulnerable - Plain Text Storage)**:

```javascript
class CredentialRepositoryDocumentDB {
    constructor() {
        this.prisma = prisma;
        // ❌ No encryption service
    }

    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        const { user, userId, authIsValid, externalId, ...oauthData } =
            details || {};

        // ❌ oauthData contains PLAIN TEXT tokens
        const document = {
            userId: toObjectId(userId || user),
            externalId,
            data: oauthData, // ❌ { access_token: "plain_secret", ... }
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // ❌ STORED AS PLAIN TEXT
        const insertedId = await insertOne(this.prisma, 'Credential', document);

        const created = await findOne(this.prisma, 'Credential', {
            _id: insertedId,
        });
        // ❌ Returns encrypted string (if previously encrypted) or plain text
        return this._mapCredential(created);
    }
}
```

**AFTER (Secure - Encrypted Storage)**:

```javascript
const {
    DocumentDBEncryptionService,
} = require('../database/documentdb-encryption-service');

class CredentialRepositoryDocumentDB {
    constructor() {
        this.prisma = prisma;
        // ✅ Initialize encryption service
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        const { user, userId, authIsValid, externalId, ...oauthData } =
            details || {};

        // Build plain text document
        const plainDocument = {
            userId: toObjectId(userId || user),
            externalId,
            data: oauthData, // Still plain text: { access_token: "plain_secret", ... }
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // ✅ ENCRYPT before storing
        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            plainDocument
        );
        // encryptedDocument.data = { access_token: "keyId:iv:cipher:encKey", ... }

        // ✅ STORED AS ENCRYPTED
        const insertedId = await insertOne(
            this.prisma,
            'Credential',
            encryptedDocument
        );

        const created = await findOne(this.prisma, 'Credential', {
            _id: insertedId,
        });

        // ✅ DECRYPT before returning
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            created
        );
        // decryptedCredential.data = { access_token: "plain_secret", ... }

        return this._mapCredential(decryptedCredential);
    }
}
```

---

### Example 2: DocumentDBEncryptionService Usage Patterns

**Pattern 1: Single Field Encryption (User.hashword)**:

```javascript
class UserRepositoryDocumentDB {
    async createIndividualUser(params) {
        const document = {
            type: 'INDIVIDUAL',
            username: params.username,
            hashword: await bcrypt.hash(params.hashword, 10), // Bcrypt hash
            createdAt: new Date(),
        };

        // Encrypt bcrypt hash before storage
        const encrypted = await this.encryptionService.encryptFields(
            'User',
            document
        );
        // encrypted.hashword = "keyId:iv:cipher:encKey"

        const id = await insertOne(this.prisma, 'User', encrypted);
        const created = await findOne(this.prisma, 'User', { _id: id });

        // Decrypt before returning
        const decrypted = await this.encryptionService.decryptFields(
            'User',
            created
        );
        // decrypted.hashword = "$2b$10$..." (bcrypt hash)

        return this._mapUser(decrypted);
    }
}
```

**Pattern 2: Nested Fields Encryption (Credential.data.\*)**:

```javascript
class CredentialRepositoryDocumentDB {
    async upsertCredential(details) {
        const document = {
            data: {
                access_token: 'ya29.actual_token',
                refresh_token: '1//0refresh',
                id_token: 'eyJhbGci...',
                expires_at: 1234567890, // Not encrypted (not in registry)
                scope: 'openid profile', // Not encrypted
            },
        };

        // Encrypts only fields defined in encryption-schema-registry.js
        const encrypted = await this.encryptionService.encryptFields(
            'Credential',
            document
        );
        // encrypted.data = {
        //     access_token: "keyId:iv:cipher:encKey",   ← ENCRYPTED
        //     refresh_token: "keyId:iv:cipher:encKey",  ← ENCRYPTED
        //     id_token: "keyId:iv:cipher:encKey",       ← ENCRYPTED
        //     expires_at: 1234567890,                   ← PLAIN (not in registry)
        //     scope: "openid profile"                   ← PLAIN (not in registry)
        // }
    }
}
```

**Pattern 3: Bulk Decryption (Multiple Credentials)**:

```javascript
class ModuleRepositoryDocumentDB {
    async _fetchCredentialsBulk(credentialIds) {
        const objectIds = credentialIds
            .map((id) => toObjectId(id))
            .filter(Boolean);

        // Fetch all credentials (encrypted)
        const rawCredentials = await findMany(this.prisma, 'Credential', {
            _id: { $in: objectIds },
        });

        // Decrypt in parallel
        const decryptionPromises = rawCredentials.map(async (rawCredential) => {
            const decrypted = await this.encryptionService.decryptFields(
                'Credential',
                rawCredential
            );
            return this._mapCredential(decrypted);
        });

        return await Promise.all(decryptionPromises);
    }
}
```

---

### Example 3: Complete Flow - OAuth Credential Creation

```javascript
// 1. User completes OAuth flow, application receives tokens
const oauthTokens = {
    access_token: 'ya29.a0AfH6SMCXyz...',
    refresh_token: '1//0gFz6TRvwUm...',
    id_token: 'eyJhbGciOiJSUzI1...',
    expires_in: 3600,
    token_type: 'Bearer',
};

// 2. Use case calls repository
const credential = await credentialRepository.upsertCredential({
    identifiers: { userId: 'user123', externalId: 'google-user-456' },
    details: oauthTokens,
});

// 3. Inside repository: Build plain document
const plainDocument = {
    userId: toObjectId('user123'),
    externalId: 'google-user-456',
    data: {
        access_token: 'ya29.a0AfH6SMCXyz...',
        refresh_token: '1//0gFz6TRvwUm...',
        id_token: 'eyJhbGciOiJSUzI1...',
        expires_in: 3600,
        token_type: 'Bearer',
    },
};

// 4. DocumentDBEncryptionService encrypts sensitive fields
const encryptedDocument = await this.encryptionService.encryptFields(
    'Credential',
    plainDocument
);
// Result:
// {
//     userId: ObjectId("..."),
//     externalId: "google-user-456",
//     data: {
//         access_token: "aes-key-1:a1b2c3:d4e5f6:g7h8i9",       ← ENCRYPTED
//         refresh_token: "aes-key-1:j1k2l3:m4n5o6:p7q8r9",      ← ENCRYPTED
//         id_token: "aes-key-1:s1t2u3:v4w5x6:y7z8a9",           ← ENCRYPTED
//         expires_in: 3600,                                       ← PLAIN (not in registry)
//         token_type: "Bearer"                                    ← PLAIN (not in registry)
//     }
// }

// 5. Store in DocumentDB
await insertOne(this.prisma, 'Credential', encryptedDocument);

// 6. Read back from DocumentDB
const rawDocument = await findOne(this.prisma, 'Credential', {
    userId: objectId,
});
// Returns encrypted data as stored

// 7. DocumentDBEncryptionService decrypts sensitive fields
const decryptedDocument = await this.encryptionService.decryptFields(
    'Credential',
    rawDocument
);
// Result:
// {
//     data: {
//         access_token: "ya29.a0AfH6SMCXyz...",      ← DECRYPTED
//         refresh_token: "1//0gFz6TRvwUm...",         ← DECRYPTED
//         id_token: "eyJhbGciOiJSUzI1...",            ← DECRYPTED
//         expires_in: 3600,
//         token_type: "Bearer"
//     }
// }

// 8. Use case receives plain text credential
return credential; // { access_token: "ya29...", refresh_token: "1//0...", ... }

// 9. Application makes API call
await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: `Bearer ${credential.access_token}` },
});
// ✅ Works! Token is usable
```

---

## Testing Strategy

### Unit Tests: DocumentDBEncryptionService

**Coverage Goals**:

-   100% line coverage
-   All branches covered
-   All error paths tested

**Key Test Cases**:

```javascript
describe('DocumentDBEncryptionService', () => {
    describe('Initialization', () => {
        it('bypasses encryption in dev stage', () => {
            process.env.STAGE = 'dev';
            const service = new DocumentDBEncryptionService();
            expect(service.enabled).toBe(false);
            expect(service.cryptor).toBeNull();
        });

        it('enables KMS encryption in production with KMS_KEY_ARN', () => {
            process.env.STAGE = 'production';
            process.env.KMS_KEY_ARN =
                'arn:aws:kms:us-east-1:123456789012:key/abc123';
            const service = new DocumentDBEncryptionService();
            expect(service.enabled).toBe(true);
            expect(service.cryptor.shouldUseAws).toBe(true);
        });

        it('enables AES encryption in production with AES_KEY_ID', () => {
            process.env.STAGE = 'production';
            process.env.AES_KEY_ID = 'local-key';
            process.env.AES_KEY = '01234567890123456789012345678901';
            const service = new DocumentDBEncryptionService();
            expect(service.enabled).toBe(true);
            expect(service.cryptor.shouldUseAws).toBe(false);
        });
    });

    describe('encryptFields()', () => {
        it('encrypts User.hashword', async () => {
            const document = {
                username: 'test@example.com',
                hashword: '$2b$10$plain_bcrypt_hash',
            };

            const encrypted = await service.encryptFields('User', document);

            expect(encrypted.username).toBe('test@example.com'); // Not encrypted
            expect(encrypted.hashword).not.toBe('$2b$10$plain_bcrypt_hash'); // Encrypted
            expect(encrypted.hashword).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/); // Format check
        });

        it('encrypts Credential.data.access_token', async () => {
            const document = {
                userId: '123',
                data: {
                    access_token: 'ya29.token_here',
                    scope: 'openid profile', // Not in registry
                },
            };

            const encrypted = await service.encryptFields(
                'Credential',
                document
            );

            expect(encrypted.data.access_token).not.toBe('ya29.token_here');
            expect(encrypted.data.access_token).toMatch(
                /^[^:]+:[^:]+:[^:]+:[^:]+$/
            );
            expect(encrypted.data.scope).toBe('openid profile'); // Not encrypted
        });

        it('skips already encrypted values', async () => {
            const alreadyEncrypted = 'keyId:iv123:cipher456:enckey789';
            const document = { hashword: alreadyEncrypted };

            const result = await service.encryptFields('User', document);

            expect(result.hashword).toBe(alreadyEncrypted); // Unchanged
        });

        it('returns unchanged for unknown model', async () => {
            const document = { field: 'value' };
            const result = await service.encryptFields(
                'UnknownModel',
                document
            );
            expect(result).toEqual(document);
        });
    });

    describe('decryptFields()', () => {
        it('decrypts User.hashword', async () => {
            const encryptedDoc = {
                username: 'test@example.com',
                hashword: 'keyId:iv:cipher:enckey', // Mock encrypted
            };

            // Mock Cryptor to return known value
            mockCryptor.decrypt.mockResolvedValue('$2b$10$plain_bcrypt_hash');

            const decrypted = await service.decryptFields('User', encryptedDoc);

            expect(decrypted.hashword).toBe('$2b$10$plain_bcrypt_hash');
            expect(mockCryptor.decrypt).toHaveBeenCalledWith(
                'keyId:iv:cipher:enckey'
            );
        });

        it('handles decryption failures gracefully', async () => {
            const encryptedDoc = { hashword: 'corrupted:data:here:error' };
            mockCryptor.decrypt.mockRejectedValue(
                new Error('Decryption failed')
            );

            const result = await service.decryptFields('User', encryptedDoc);

            expect(result.hashword).toBeNull(); // Set to null on error
        });

        it('parses JSON objects after decryption', async () => {
            const encryptedDoc = { data: { config: 'keyId:iv:cipher:enckey' } };
            const jsonObject = { nested: 'value', array: [1, 2, 3] };
            mockCryptor.decrypt.mockResolvedValue(JSON.stringify(jsonObject));

            const result = await service.decryptFields(
                'CustomModel',
                encryptedDoc
            );

            expect(result.data.config).toEqual(jsonObject); // Parsed as object
        });
    });
});
```

---

### Integration Tests: Repository Level

**CredentialRepositoryDocumentDB Security Tests**:

```javascript
describe('CredentialRepositoryDocumentDB - Security', () => {
    let repository;
    let prisma;

    beforeAll(async () => {
        // Setup DocumentDB test database
        process.env.STAGE = 'production';
        process.env.AES_KEY_ID = 'test-key';
        process.env.AES_KEY = '01234567890123456789012345678901';

        prisma = await connectPrisma();
        repository = new CredentialRepositoryDocumentDB({ prisma });
    });

    afterAll(async () => {
        await disconnectPrisma();
    });

    describe('CRITICAL: OAuth Token Encryption', () => {
        it('stores access_token encrypted in database', async () => {
            const userId = new ObjectId();
            const externalId = 'google-user-123';
            const plainToken = 'ya29.actual_google_token_here';

            // Create credential via repository
            await repository.upsertCredential({
                identifiers: { userId: fromObjectId(userId), externalId },
                details: { access_token: plainToken, token_type: 'Bearer' },
            });

            // Query database directly (bypass repository)
            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId, externalId },
            });

            const storedCredential = rawResult.cursor.firstBatch[0];
            const storedToken = storedCredential.data.access_token;

            // CRITICAL ASSERTIONS
            expect(storedToken).not.toBe(plainToken); // NOT plain text
            expect(storedToken).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/); // Encrypted format
            expect(storedToken.split(':').length).toBeGreaterThanOrEqual(4); // 4+ parts

            // Verify repository returns decrypted
            const retrieved = await repository.findCredential({
                userId: fromObjectId(userId),
                externalId,
            });
            expect(retrieved.access_token).toBe(plainToken); // Decrypted
        });

        it('encrypts refresh_token', async () => {
            const userId = new ObjectId();
            const plainRefresh = '1//0secret_refresh_token';

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(userId),
                    externalId: 'test-456',
                },
                details: { refresh_token: plainRefresh },
            });

            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId },
            });

            const stored = rawResult.cursor.firstBatch[0].data.refresh_token;
            expect(stored).not.toBe(plainRefresh);
            expect(stored).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/);
        });

        it('encrypts id_token', async () => {
            const userId = new ObjectId();
            const plainIdToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(userId),
                    externalId: 'test-789',
                },
                details: { id_token: plainIdToken },
            });

            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId },
            });

            const stored = rawResult.cursor.firstBatch[0].data.id_token;
            expect(stored).not.toBe(plainIdToken);
            expect(stored).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/);
        });

        it('does NOT encrypt non-sensitive fields', async () => {
            const userId = new ObjectId();

            await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(userId),
                    externalId: 'test-000',
                },
                details: {
                    access_token: 'token123',
                    expires_in: 3600, // Not in encrypted fields registry
                    token_type: 'Bearer', // Not in registry
                    scope: 'openid profile', // Not in registry
                },
            });

            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId },
            });

            const stored = rawResult.cursor.firstBatch[0].data;

            // These should NOT be encrypted
            expect(stored.expires_in).toBe(3600);
            expect(stored.token_type).toBe('Bearer');
            expect(stored.scope).toBe('openid profile');

            // But access_token should be encrypted
            expect(stored.access_token).toMatch(/^[^:]+:[^:]+:[^:]+:[^:]+$/);
        });
    });

    describe('Full Integration Flow', () => {
        it('encrypts on insert, decrypts on read', async () => {
            const userId = new ObjectId();
            const plainData = {
                access_token: 'test_access_123',
                refresh_token: 'test_refresh_456',
                expires_in: 7200,
            };

            // Insert
            const created = await repository.upsertCredential({
                identifiers: {
                    userId: fromObjectId(userId),
                    externalId: 'flow-test',
                },
                details: plainData,
            });

            // Verify returned data is plain text
            expect(created.access_token).toBe('test_access_123');
            expect(created.refresh_token).toBe('test_refresh_456');

            // Read via repository
            const retrieved = await repository.findCredential({
                userId: fromObjectId(userId),
                externalId: 'flow-test',
            });

            // Verify decrypted correctly
            expect(retrieved.access_token).toBe('test_access_123');
            expect(retrieved.refresh_token).toBe('test_refresh_456');

            // Verify database has encrypted values
            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId },
            });
            const stored = rawResult.cursor.firstBatch[0].data;
            expect(stored.access_token).not.toBe('test_access_123');
            expect(stored.refresh_token).not.toBe('test_refresh_456');
        });
    });

    describe('Stage-Based Bypass', () => {
        it('bypasses encryption in dev stage', async () => {
            // Re-initialize with dev stage
            process.env.STAGE = 'dev';
            const devRepo = new CredentialRepositoryDocumentDB({ prisma });

            const userId = new ObjectId();
            const plainToken = 'dev_token_plain';

            await devRepo.upsertCredential({
                identifiers: {
                    userId: fromObjectId(userId),
                    externalId: 'dev-test',
                },
                details: { access_token: plainToken },
            });

            // In dev, should be stored as plain text
            const rawResult = await prisma.$runCommandRaw({
                find: 'Credential',
                filter: { userId },
            });
            const stored = rawResult.cursor.firstBatch[0].data.access_token;
            expect(stored).toBe(plainToken); // Plain text in dev!

            // Reset to production
            process.env.STAGE = 'production';
        });
    });
});
```

---

### Manual Test Script

```bash
#!/bin/bash
# manual-encryption-test.sh
# Tests DocumentDB encryption manually

set -e

echo "🔐 DocumentDB Encryption Manual Test"
echo "===================================="

# Setup
export STAGE=production
export AES_KEY_ID=test-manual-key
export AES_KEY=01234567890123456789012345678901

echo "✅ Environment configured (production, AES encryption)"

# Start MongoDB
echo "📦 Starting MongoDB..."
docker-compose up -d mongo
sleep 5

# Start backend
echo "🚀 Starting backend..."
cd backend
npm run frigg:start &
BACKEND_PID=$!
sleep 10

# Create user
echo "👤 Creating test user..."
TOKEN=$(curl -s -X POST http://localhost:3000/user/create \
    -H "Content-Type: application/json" \
    -d '{"username":"test@encryption.com","password":"testpass"}' \
    | jq -r '.token')

echo "✅ User created, token: ${TOKEN:0:20}..."

# Trigger OAuth flow (simulated)
echo "🔑 Simulating OAuth credential creation..."
# Note: This would normally be done through OAuth flow
# For testing, we can directly call credential creation endpoint if it exists

# Verify encryption in database
echo "🔍 Verifying encryption in database..."
docker exec -it $(docker ps -q -f name=mongo) mongosh --eval "
use frigg;
var cred = db.Credential.findOne();
if (cred) {
    print('Found credential:');
    print('  ID: ' + cred._id);
    print('  access_token format: ' + cred.data.access_token);

    var parts = cred.data.access_token.split(':');
    if (parts.length >= 4) {
        print('  ✅ ENCRYPTED (4+ parts)');
    } else {
        print('  ❌ NOT ENCRYPTED (plain text)');
        quit(1);
    }
} else {
    print('⚠️  No credentials found');
}
"

echo "✅ Manual test complete"

# Cleanup
kill $BACKEND_PID
docker-compose down
```

---

## Migration Guide

### For Existing Deployments with Plain Text Credentials

**⚠️ WARNING**: If DocumentDB repositories are already deployed and storing plain text credentials, follow this migration plan.

---

### Step 1: Assess the Damage

**Query Database for Plain Text Credentials**:

```javascript
// Run in mongosh on DocumentDB

use frigg;

// Check total credentials
var totalCreds = db.Credential.countDocuments();
print('Total credentials:', totalCreds);

// Sample credentials to check format
var sampleCreds = db.Credential.find().limit(10).toArray();

sampleCreds.forEach(function(cred) {
    var token = cred.data?.access_token;
    if (!token) {
        print('Credential', cred._id, ': No access_token');
        return;
    }

    var parts = token.split(':');
    if (parts.length >= 4) {
        print('Credential', cred._id, ': ENCRYPTED ✅');
    } else {
        print('Credential', cred._id, ': PLAIN TEXT ❌', token.substring(0, 20) + '...');
    }
});
```

**Estimate Impact**:

-   Number of affected credentials
-   Number of affected users
-   Third-party services (Asana, Frontify, etc.)

---

### Step 2: Immediate Security Response

**Priority Actions**:

1. **Deploy Fix Immediately**:

    ```bash
    # Deploy encryption fix to stop new plain text storage
    cd backend
    npm install @friggframework/core@latest  # With encryption fix
    npm run deploy -- --stage production
    ```

2. **Rotate All Affected Tokens**:

    - Force OAuth re-authentication for all users
    - Revoke old tokens on third-party services
    - Generate new encrypted tokens

3. **Audit Access**:
    - Review database access logs
    - Identify who had access to plain text credentials
    - Check for unauthorized API usage

---

### Step 3: Data Migration

**Migration Script** (`migrate-encrypt-credentials.js`):

```javascript
const {
    prisma,
    connectPrisma,
    disconnectPrisma,
} = require('@friggframework/core/database/prisma');
const {
    DocumentDBEncryptionService,
} = require('@friggframework/core/database/documentdb-encryption-service');
const {
    toObjectId,
    fromObjectId,
} = require('@friggframework/core/database/documentdb-utils');

/**
 * Migrate plain text credentials to encrypted format.
 *
 * This script:
 * 1. Identifies plain text credentials
 * 2. Encrypts them using DocumentDBEncryptionService
 * 3. Updates database with encrypted values
 * 4. Verifies encryption
 */
async function migrateCredentials() {
    console.log('🔐 Starting credential encryption migration...');

    // Initialize
    await connectPrisma();
    const encryptionService = new DocumentDBEncryptionService();

    if (!encryptionService.enabled) {
        console.error(
            '❌ Encryption not enabled! Check environment variables.'
        );
        process.exit(1);
    }

    // Fetch all credentials
    const result = await prisma.$runCommandRaw({
        find: 'Credential',
        filter: {},
    });

    const credentials = result.cursor.firstBatch;
    console.log(`📊 Found ${credentials.length} credentials`);

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const cred of credentials) {
        const credId = fromObjectId(cred._id);

        try {
            // Check if already encrypted
            const token = cred.data?.access_token;
            if (!token) {
                console.log(
                    `⏭️  Skipping credential ${credId} (no access_token)`
                );
                continue;
            }

            const parts = token.split(':');
            if (parts.length >= 4) {
                console.log(`✅ Credential ${credId} already encrypted`);
                alreadyEncryptedCount++;
                continue;
            }

            // Encrypt credential data
            console.log(`🔐 Encrypting credential ${credId}...`);
            const encryptedData = await encryptionService.encryptFields(
                'Credential',
                {
                    data: cred.data,
                }
            );

            // Update database
            await prisma.$runCommandRaw({
                update: 'Credential',
                updates: [
                    {
                        q: { _id: cred._id },
                        u: {
                            $set: {
                                data: encryptedData.data,
                                updatedAt: new Date(),
                            },
                        },
                    },
                ],
            });

            console.log(`✅ Encrypted credential ${credId}`);
            encryptedCount++;
        } catch (error) {
            console.error(
                `❌ Failed to encrypt credential ${credId}:`,
                error.message
            );
            errorCount++;
        }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  Total credentials: ${credentials.length}`);
    console.log(`  Encrypted: ${encryptedCount}`);
    console.log(`  Already encrypted: ${alreadyEncryptedCount}`);
    console.log(`  Errors: ${errorCount}`);

    await disconnectPrisma();
    console.log('✅ Migration complete');
}

// Run migration
migrateCredentials().catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
});
```

**Run Migration**:

```bash
# Set production environment variables
export STAGE=production
export KMS_KEY_ARN=arn:aws:kms:us-east-1:123456789012:key/abc123

# Run migration
node migrate-encrypt-credentials.js

# Verify
node verify-encryption.js  # See verification script below
```

---

### Step 4: Verification

**Verification Script** (`verify-encryption.js`):

```javascript
const {
    prisma,
    connectPrisma,
    disconnectPrisma,
} = require('@friggframework/core/database/prisma');

async function verifyEncryption() {
    console.log('🔍 Verifying credential encryption...');

    await connectPrisma();

    const result = await prisma.$runCommandRaw({
        find: 'Credential',
        filter: {},
    });

    const credentials = result.cursor.firstBatch;
    let passCount = 0;
    let failCount = 0;

    for (const cred of credentials) {
        const token = cred.data?.access_token;
        if (!token) continue;

        const parts = token.split(':');
        if (parts.length >= 4) {
            passCount++;
        } else {
            console.error(`❌ Plain text found in credential ${cred._id}`);
            failCount++;
        }
    }

    await disconnectPrisma();

    console.log('\n📊 Verification Results:');
    console.log(`  Encrypted: ${passCount}`);
    console.log(`  Plain text: ${failCount}`);

    if (failCount > 0) {
        console.error(
            '\n❌ Verification failed! Plain text credentials still exist.'
        );
        process.exit(1);
    } else {
        console.log('\n✅ Verification passed! All credentials encrypted.');
    }
}

verifyEncryption().catch((error) => {
    console.error('💥 Verification failed:', error);
    process.exit(1);
});
```

---

### Step 5: Post-Migration Cleanup

1. **Delete Migration Scripts**:

    ```bash
    rm migrate-encrypt-credentials.js
    rm verify-encryption.js
    ```

2. **Update Documentation**:

    - Document the incident
    - Document lessons learned
    - Update security procedures

3. **Monitor**:
    - Set up alerts for plain text detection
    - Monitor API error rates (in case decryption fails)
    - Watch for OAuth re-authentication requests

---

### Rollback Procedures

**If Migration Fails**:

1. **Stop the migration script**

2. **Restore from backup**:

    ```bash
    # Restore MongoDB backup from before migration
    mongorestore --uri="mongodb://..." --archive=backup-before-migration.archive
    ```

3. **Revert code deployment**:

    ```bash
    # Rollback to previous version
    cd backend
    npm install @friggframework/core@<previous-version>
    npm run deploy -- --stage production
    ```

4. **Investigate and fix issues**

5. **Re-attempt migration with fixes**

---

### Zero-Downtime Migration Strategy

For large deployments:

1. **Phase 1: Deploy encryption fix** (don't migrate yet)

    - New credentials will be encrypted
    - Old credentials remain as-is
    - Application handles both encrypted and plain text

2. **Phase 2: Migrate in batches**

    ```javascript
    // Migrate 100 credentials at a time
    const batchSize = 100;
    for (let skip = 0; skip < totalCredentials; skip += batchSize) {
        await migrateBatch(skip, batchSize);
        await sleep(1000); // 1 second between batches
    }
    ```

3. **Phase 3: Verify**

    - Check random samples
    - Monitor error rates
    - Verify API calls still work

4. **Phase 4: Complete**
    - Remove backward compatibility code
    - Update monitoring alerts

---

## Security Considerations

### Encryption Format

**Envelope Encryption Pattern**:

```
keyId:iv:cipher:encKey
```

**Components**:

-   `keyId`: Identifier for the encryption key (e.g., "aes-key-1", KMS key ID)
-   `iv`: Initialization vector (base64-encoded)
-   `cipher`: Encrypted data (base64-encoded)
-   `encKey`: Encrypted data encryption key (base64-encoded)

**Example**:

```
aes-key-1:MTIzNDU2Nzg5MGFiY2RlZg==:ZW5jcnlwdGVkX2RhdGFfaGVyZQ==:ZGVrX2VuY3J5cHRlZA==
```

---

### Key Management

**Production (KMS - Recommended)**:

```bash
# AWS KMS key is auto-discovered by Frigg infrastructure
# Or set explicitly:
export KMS_KEY_ARN=arn:aws:kms:us-east-1:123456789012:key/abc-123-def-456

# Stage must be production
export STAGE=production
```

**Benefits**:

-   ✅ AWS-managed key rotation
-   ✅ Audit trail via CloudTrail
-   ✅ Fine-grained IAM permissions
-   ✅ Hardware security module (HSM) backed
-   ✅ Compliance-ready (HIPAA, PCI-DSS, etc.)

**Alternative (AES - Any Environment)**:

```bash
# Generate a 32-character key
export AES_KEY_ID=my-app-key-v1
export AES_KEY=$(openssl rand -hex 16)  # 32 hex chars = 16 bytes

# Can be used in production
export STAGE=production
```

**Benefits**:

-   ✅ Works in any environment (no AWS required)
-   ✅ Faster than KMS (no network calls)
-   ✅ No AWS costs

**Drawbacks**:

-   ⚠️ Must securely manage key yourself
-   ⚠️ No automatic key rotation
-   ⚠️ Key stored in environment/config

---

### Stage-Based Bypass

**Purpose**: Skip encryption in local development for easier debugging

**Bypassed Stages**:

-   `dev`
-   `test`
-   `local`

**Production Stages** (encryption enabled):

-   `production`
-   `prod`
-   `staging`
-   `stage`
-   Any other value

**Configuration**:

```bash
# Bypass encryption (dev)
export STAGE=dev
# DocumentDBEncryptionService.enabled = false
# Data stored as plain text

# Enable encryption (production)
export STAGE=production
export KMS_KEY_ARN=...
# DocumentDBEncryptionService.enabled = true
# Data stored encrypted
```

**Security Note**: Never use `STAGE=dev` in production environments!

---

### Encrypted Fields Registry

**Location**: `packages/core/database/encryption/encryption-schema-registry.js`

**Current Encrypted Fields**:

```javascript
const ENCRYPTED_FIELDS = {
    User: ['hashword'],
    Credential: [
        'data.access_token',
        'data.refresh_token',
        'data.id_token',
        'data.domain',
    ],
    IntegrationMapping: ['mapping'],
    Token: ['token'],
};
```

**Adding New Encrypted Fields**:

1. Open `encryption-schema-registry.js`
2. Add field path to appropriate model:
    ```javascript
    Credential: [
        'data.access_token',
        'data.refresh_token',
        'data.id_token',
        'data.domain',
        'data.client_secret', // ← NEW
    ];
    ```
3. Deploy - encryption applied automatically (no code changes needed)

**Field Path Examples**:

-   Top-level: `hashword` → encrypts `document.hashword`
-   Nested: `data.access_token` → encrypts `document.data.access_token`
-   Deep nesting supported: `config.secrets.apiKey`

---

### Compliance & Best Practices

**GDPR Compliance**:

-   ✅ Data encrypted at rest
-   ✅ Encryption keys managed securely
-   ✅ User data can be deleted (right to erasure)

**PCI-DSS Compliance** (if storing payment data):

-   ✅ Encryption of cardholder data
-   ✅ Key management procedures
-   ✅ Audit logging (via CloudTrail with KMS)

**HIPAA Compliance** (if storing health data):

-   ✅ Encryption at rest (required)
-   ✅ Access controls (AWS KMS IAM)
-   ✅ Audit trail (CloudTrail)

**Best Practices**:

1. **Use KMS in production** - Better security, compliance, key rotation
2. **Rotate keys periodically** - Even with KMS, review and rotate annually
3. **Monitor decryption failures** - Alert on >1% failure rate
4. **Test encryption in CI/CD** - Automated tests verify encryption works
5. **Secure key storage** - Never commit keys to version control
6. **Least privilege access** - Limit who can decrypt data

---

### Security Audit Checklist

Before going to production:

-   [ ] Verify `STAGE=production` in environment
-   [ ] Verify encryption keys configured (`KMS_KEY_ARN` or `AES_KEY_ID`)
-   [ ] Run security tests (verify encrypted format in database)
-   [ ] Test credential creation and retrieval end-to-end
-   [ ] Verify OAuth flows work (tokens decrypted correctly)
-   [ ] Check logs for decryption errors
-   [ ] Review IAM permissions (if using KMS)
-   [ ] Test key rotation procedure (if using KMS)
-   [ ] Document encryption architecture for auditors
-   [ ] Set up monitoring alerts (decryption failures, plain text detection)

---

## Maintenance & Future Work

### Adding New DocumentDB Repositories

When creating a new DocumentDB repository that handles encrypted data:

1. **Import DocumentDBEncryptionService**:

    ```javascript
    const {
        DocumentDBEncryptionService,
    } = require('../database/documentdb-encryption-service');
    ```

2. **Initialize in constructor**:

    ```javascript
    constructor() {
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }
    ```

3. **Encrypt before writes**:

    ```javascript
    async create(data) {
        const encrypted = await this.encryptionService.encryptFields('ModelName', data);
        const id = await insertOne(this.prisma, 'CollectionName', encrypted);
        // ...
    }
    ```

4. **Decrypt after reads**:

    ```javascript
    async findById(id) {
        const doc = await findOne(this.prisma, 'CollectionName', { _id: toObjectId(id) });
        const decrypted = await this.encryptionService.decryptFields('ModelName', doc);
        return this._mapModel(decrypted);
    }
    ```

5. **Add encrypted fields to registry** (if new model):

    ```javascript
    // packages/core/database/encryption/encryption-schema-registry.js
    const ENCRYPTED_FIELDS = {
        // ... existing models
        NewModel: ['sensitiveField1', 'nested.field2'],
    };
    ```

6. **Add tests** (see Phase 5 for test patterns)

---

### Adding New Encrypted Fields

To encrypt a new field in an existing model:

1. **Update encryption-schema-registry.js**:

    ```javascript
    const ENCRYPTED_FIELDS = {
        Credential: [
            'data.access_token',
            'data.refresh_token',
            'data.id_token',
            'data.domain',
            'data.client_secret', // ← NEW FIELD
        ],
    };
    ```

2. **No code changes needed** - DocumentDBEncryptionService reads from registry

3. **Deploy** - new field will be encrypted automatically

4. **Migrate existing data** (if field already has plain text values):
    ```javascript
    // Run migration script to encrypt existing plain text values
    // Similar to credential migration script
    ```

---

### Known Limitations

1. **Performance**: Encryption/decryption adds latency

    - KMS: ~50ms per field (network call to AWS)
    - AES: ~5-10ms per field (local crypto)
    - **Mitigation**: Use bulk operations, consider caching decrypted values

2. **DocumentDB-specific**: Only needed for DocumentDB

    - MongoDB/PostgreSQL use automatic Prisma Extension
    - Duplicate logic unavoidable (Prisma raw queries bypass extensions)

3. **Manual encryption required**: Developers must remember to call service

    - **Mitigation**: Code reviews, tests, linting rules

4. **No transactional encryption**: Encryption happens outside transactions

    - **Risk**: If encryption fails mid-operation, could leave inconsistent state
    - **Mitigation**: Encrypt before transaction starts, handle errors

5. **Field-level only**: Doesn't encrypt entire documents or collections
    - **Alternative**: Use database-level encryption (AWS DocumentDB encryption at rest)

---

### Future Improvements

1. **Automatic Repository Decorator**:

    ```javascript
    // Potential future API
    @encryptDocumentDB(['User', 'Credential'])
    class MyRepositoryDocumentDB {
        // Encryption applied automatically by decorator
    }
    ```

2. **Encryption Caching**:

    - Cache decrypted values for frequently accessed credentials
    - Invalidate cache on credential update
    - Reduce KMS API calls

3. **Field Compression**:

    - Compress large fields before encryption
    - Reduce storage and transfer costs
    - Especially useful for `IntegrationMapping.mapping`

4. **Key Versioning**:

    - Support multiple active keys
    - Gradual key rotation without migration
    - Store key version with encrypted data

5. **Encryption Metrics**:

    - Track encryption/decryption performance
    - Monitor failure rates
    - Alert on anomalies

6. **Integration with Prisma Extension**:
    - Potential future Prisma feature: Extension support for raw queries
    - Would eliminate need for DocumentDBEncryptionService
    - Track: https://github.com/prisma/prisma/issues/...

---

### Monitoring & Alerts

**Recommended Metrics**:

1. **Encryption Failures**:

    ```javascript
    // Log when encryption fails
    console.error('Encryption failed', { modelName, fieldPath, error });
    // Alert if >1% of operations fail
    ```

2. **Decryption Failures**:

    ```javascript
    // Log when decryption fails
    console.error('Decryption failed', { modelName, fieldPath, error });
    // Alert immediately (could indicate data corruption)
    ```

3. **Plain Text Detection**:

    ```javascript
    // Periodic scan of database
    // Alert if any plain text credentials found
    ```

4. **Performance Metrics**:
    ```javascript
    // Track encryption/decryption time
    const start = Date.now();
    await service.encryptFields(...);
    const duration = Date.now() - start;
    metrics.histogram('encryption_duration_ms', duration);
    ```

**CloudWatch Dashboards** (for AWS deployments):

-   Encryption operation count
-   Average encryption duration
-   Decryption failure rate
-   KMS API call count (if using KMS)

---

### Support & Troubleshooting

**Common Issues**:

1. **"No encryption keys configured"**

    - **Cause**: Missing `KMS_KEY_ARN` or `AES_KEY_ID` in production
    - **Fix**: Set environment variables, restart application

2. **"Decryption failed"**

    - **Cause**: Wrong key, corrupted data, or key rotation
    - **Fix**: Check key configuration, verify data integrity, check key version

3. **"Cannot read property 'access_token' of undefined"**

    - **Cause**: Credential data is null or decryption returned null
    - **Fix**: Check if credential exists, verify encryption didn't fail on write

4. **"Encryption too slow"**

    - **Cause**: Using KMS with high latency
    - **Fix**: Switch to AES for non-production, optimize KMS calls (batching)

5. **"Credentials not encrypted after deployment"**
    - **Cause**: `STAGE=dev` in production, or missing encryption keys
    - **Fix**: Set `STAGE=production`, configure keys, redeploy

**Getting Help**:

-   Check logs for error details
-   Review encryption-schema-registry.js configuration
-   Verify environment variables
-   Run health check: `curl http://localhost:3000/health/detailed`
-   Check encryption status in health response

---

## References

### Related Files

**Core Encryption**:

-   `packages/core/database/encryption/README.md` - Main encryption documentation
-   `packages/core/database/encryption/encryption-schema-registry.js` - Encrypted fields definition
-   `packages/core/database/encryption/field-encryption-service.js` - Field-level encryption (Prisma Extension)
-   `packages/core/database/encryption/prisma-encryption-extension.js` - Prisma Client Extension
-   `packages/core/encrypt/Cryptor.js` - Encryption adapter (KMS/AES)

**DocumentDB**:

-   `packages/core/database/documentdb-utils.js` - Raw query utilities
-   `packages/core/database/prisma.js` - Prisma client initialization

**Repositories**:

-   `packages/core/user/repositories/user-repository-documentdb.js` - User repository
-   `packages/core/modules/repositories/module-repository-documentdb.js` - Module/Entity repository
-   `packages/core/credential/repositories/credential-repository-documentdb.js` - Credential repository
-   `packages/core/integrations/repositories/integration-repository-documentdb.js` - Integration repository

**Tests**:

-   `packages/core/database/encryption/*.test.js` - Encryption unit tests
-   `packages/core/**/repositories/__tests__/*.test.js` - Repository tests

---

### External Documentation

**Prisma**:

-   [Prisma Client Extensions](https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions)
-   [Raw Database Access](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)
-   [MongoDB Support](https://www.prisma.io/docs/concepts/database-connectors/mongodb)

**AWS DocumentDB**:

-   [AWS DocumentDB Documentation](https://docs.aws.amazon.com/documentdb/)
-   [MongoDB Compatibility](https://docs.aws.amazon.com/documentdb/latest/developerguide/functional-differences.html)

**AWS KMS**:

-   [AWS KMS Developer Guide](https://docs.aws.amazon.com/kms/latest/developerguide/)
-   [Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)

**Encryption Best Practices**:

-   [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
-   [NIST Encryption Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)

---

### Frigg Framework

**Core Documentation**:

-   [Frigg Framework Docs](https://docs.friggframework.org)
-   [GitHub Repository](https://github.com/friggframework/frigg)
-   [Community Slack](https://friggframework.org/#contact)

**Related Issues**:

-   GitHub Issue: DocumentDB encryption support [#TBD]
-   GitHub PR: Implement DocumentDBEncryptionService [#TBD]

---

## Appendix

### Glossary

**Terms**:

-   **DocumentDB**: AWS DocumentDB, a MongoDB-compatible database service
-   **Prisma Extension**: Prisma feature that intercepts and modifies queries
-   **Raw Query**: Low-level database command that bypasses Prisma ORM
-   **Envelope Encryption**: Encryption pattern using data keys encrypted by master keys
-   **KMS**: AWS Key Management Service
-   **AES**: Advanced Encryption Standard (symmetric encryption)
-   **Field-Level Encryption**: Encrypting individual fields within documents

**Acronyms**:

-   **DRY**: Don't Repeat Yourself
-   **IAM**: Identity and Access Management
-   **HSM**: Hardware Security Module
-   **GDPR**: General Data Protection Regulation
-   **PCI-DSS**: Payment Card Industry Data Security Standard
-   **HIPAA**: Health Insurance Portability and Accountability Act

---

### Changelog

| Version | Date       | Author | Changes               |
| ------- | ---------- | ------ | --------------------- |
| 1.0     | 2025-01-13 | System | Initial documentation |

---

## Conclusion

This document provides a complete specification and implementation guide for the DocumentDBEncryptionService. Follow the phases sequentially, run all tests, and verify encryption at each step.

**Remember**: This is a **CRITICAL SECURITY** implementation. OAuth credentials MUST be encrypted at rest. Take the time to implement correctly and test thoroughly.

For questions or support, contact the Frigg team via GitHub issues or community Slack.

---

**Document Status**: ✅ Ready for Implementation
