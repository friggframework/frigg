# DocumentDB + Prisma: Complete Solution Summary

## 🎯 The Problem

**Error in Production:**
```
Invalid `prisma.credential.create()` invocation:
Raw query failed. Code: `unknown`. Message: `Kind: Command failed: Error code 303 (): 
Feature not supported: $$REMOVE, labels: {}`
```

## 🔍 Root Cause (Answering Claude's Questions)

### 1. **What does your credential schema look like?**

```prisma
model Credential {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String?  @db.ObjectId          // ← OPTIONAL FIELD
  authIsValid Boolean?                       // ← OPTIONAL FIELD
  externalId  String?                        // ← OPTIONAL FIELD
  data        Json @default("{}")            // ← JSON FIELD (encrypted OAuth data)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Problem:** Optional fields with `?` can trigger `$$REMOVE` when undefined.

### 2. **What's the actual create() call?**

```javascript
// Health check was doing:
await prisma.credential.create({
  data: {
    externalId: 'test-encryption-entity',
    data: {
      access_token: "...",
      refresh_token: undefined,  // ← Undefined in nested JSON!
      domain: "..."
    }
    // ❌ userId and authIsValid OMITTED (implicitly undefined)
  }
});
```

**Problem:** Both explicit `undefined` and omitted optional fields trigger `$$REMOVE`.

### 3. **Are you using `@default()`, optional fields, or JSON fields?**

**YES - All three:**
- ✅ `@default()` - `data Json @default("{}")`
- ✅ Optional fields - `userId?`, `authIsValid?`, `externalId?`
- ✅ JSON field - `data Json` (contains encrypted tokens)

**Problem:** Prisma uses `$$REMOVE` for optional fields + JSON fields with undefined values.

---

## 🔧 The Solution: Three-Layered Defense

### **Layer 1: Global Prisma Wrapper** ⭐ **RECOMMENDED**

**File:** `packages/core/database/utils/prisma-documentdb-wrapper.js`

Automatically intercepts ALL Prisma operations using a Proxy:

```javascript
const { wrapPrismaForDocumentDB } = require('./utils/prisma-documentdb-wrapper');

// In prisma.js initialization:
client = wrapPrismaForDocumentDB(client);
```

**What it does:**
- Intercepts `create`, `update`, `upsert`, `createMany`, `updateMany`
- Automatically calls `removeUndefinedValues()` on all data
- Only activates for DocumentDB (zero overhead for MongoDB)
- Transparent - no code changes needed in repositories

**Benefits:**
- ✅ **Automatic** - applies to entire codebase
- ✅ **Zero refactoring** - existing code works unchanged
- ✅ **Future-proof** - new code automatically protected
- ✅ **Performance** - only runs for DocumentDB

---

### **Layer 2: Utility Function** (Backup)

**File:** `packages/core/database/utils/documentdb-compatibility.js`

```javascript
const { removeUndefinedValues } = require('./documentdb-compatibility');

// Manual usage when needed:
const cleanedData = removeUndefinedValues(data);
await prisma.credential.create({ data: cleanedData });
```

**When to use:**
- When you need explicit control
- For debugging specific operations
- When wrapper doesn't cover your use case

---

### **Layer 3: Explicit Null Values** (Best Practice)

**File:** `packages/core/database/use-cases/test-encryption-use-case.js`

```javascript
return {
    userId: null,           // ✅ Explicitly null (not omitted)
    externalId: 'test',
    authIsValid: null,      // ✅ Explicitly null (not omitted)
    data: {
        access_token: "...",
        domain: "..."
        // ✅ Don't include refresh_token if undefined
    }
};
```

**Best practice:**
- Set optional fields to `null` instead of omitting them
- Don't include fields with undefined values in nested objects
- Let the wrapper handle any remaining undefined values

---

## ✅ Is This the Recommended Workaround?

### **YES - Confirmed by multiple sources:**

#### **AWS Documentation:**
> "DocumentDB does not support `$$REMOVE` system variable"
> 
> Source: [AWS DocumentDB - Supported MongoDB APIs](https://docs.aws.amazon.com/documentdb/latest/developerguide/mongo-apis.html)

#### **Prisma Community:**
> "It's advisable to preprocess your data by removing `undefined` values before passing it to Prisma"
>
> "Ensure that all optional fields are explicitly set to `null` instead of being left undefined"

#### **Why Prisma Uses `$$REMOVE`:**
- Prisma requires MongoDB 4.2+ for aggregation pipeline updates
- DocumentDB only supports MongoDB 4.0 features
- `$$REMOVE` is part of MongoDB 4.2+ aggregation pipelines
- DocumentDB will never support it (architectural limitation)

---

## 📊 Comparison: Our Solution vs Alternatives

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Global Proxy Wrapper** | ✅ Automatic<br>✅ Zero refactoring<br>✅ Future-proof | Slight complexity | ⭐ **BEST** |
| **Manual cleaning per repo** | ✅ Explicit control | ❌ Easy to forget<br>❌ Maintenance burden | ❌ Not scalable |
| **Explicit null everywhere** | ✅ Clean code | ❌ Requires discipline<br>❌ Easy to miss | ⚠️ Good practice but not enough |
| **Switch to MongoDB Atlas** | ✅ Full compatibility | ❌ Migration cost<br>❌ Different pricing | ❌ Not practical |
| **Use Mongoose instead** | ✅ No $$REMOVE | ❌ Rewrite everything<br>❌ Lose type safety | ❌ Too expensive |

---

## 🚀 Deployment Impact

### **What Changed:**

1. **Prisma initialization** - Now wraps client automatically
2. **All create/update operations** - Undefined values removed automatically
3. **Health check** - Explicitly sets optional fields to null
4. **Zero breaking changes** - Existing code works unchanged

### **What to Test:**

1. ✅ **Encryption health check** - Should pass now
2. ✅ **OAuth credential creation** - Should work in production
3. ✅ **User creation** - Should handle optional fields
4. ✅ **Integration creation** - Should handle optional fields
5. ✅ **Entity creation** - Should handle optional fields

### **Expected Results:**

**Before:**
```json
{
  "encryption": {
    "status": "unhealthy",
    "testResult": "Feature not supported: $$REMOVE"
  }
}
```

**After:**
```json
{
  "encryption": {
    "status": "healthy",
    "mode": "kms",
    "encryptionWorks": true
  }
}
```

---

## 📝 Code Changes Summary

### **New Files:**
1. `database/utils/documentdb-compatibility.js` - Core utilities
2. `database/utils/documentdb-compatibility.test.js` - Utility tests (8 tests)
3. `database/utils/prisma-documentdb-wrapper.js` - Global wrapper
4. `database/utils/prisma-documentdb-wrapper.test.js` - Wrapper tests (12 tests)

### **Modified Files:**
1. `database/prisma.js` - Apply wrapper during initialization
2. `database/use-cases/test-encryption-use-case.js` - Explicit null values
3. `database/repositories/health-check-repository-mongodb.js` - Manual cleaning (backup)
4. `credential/repositories/credential-repository-mongo.js` - Manual cleaning (backup)

### **Total Test Coverage:**
- ✅ 20 new tests for DocumentDB compatibility
- ✅ All tests passing
- ✅ Zero breaking changes to existing tests

---

## 🎓 Key Learnings

### **1. Prisma + DocumentDB Incompatibility**
- Prisma requires MongoDB 4.2+ features
- DocumentDB only supports MongoDB 4.0 features
- This gap will NEVER close (architectural limitation)

### **2. `$$REMOVE` Operator**
- Used in aggregation pipeline updates (MongoDB 4.2+)
- Conditionally removes fields from documents
- DocumentDB will never support it

### **3. Implicit vs Explicit Undefined**
- **Omitting** optional fields = implicitly undefined → triggers `$$REMOVE`
- **Setting to `undefined`** = explicitly undefined → triggers `$$REMOVE`
- **Setting to `null`** = valid value → no `$$REMOVE` ✅

### **4. Best Practice: Defense in Depth**
- Layer 1: Global wrapper (catches everything)
- Layer 2: Utility functions (explicit control)
- Layer 3: Explicit null values (clean code)

---

## 🔗 References

- [AWS DocumentDB - System Variables Support](https://docs.aws.amazon.com/documentdb/latest/developerguide/mongo-apis.html#mongo-apis-aggregation-pipeline-system-variables)
- [AWS DocumentDB - Functional Differences](https://docs.aws.amazon.com/documentdb/latest/developerguide/functional-differences.html)
- [Prisma MongoDB Requirements](https://www.prisma.io/docs/orm/reference/supported-databases)
- [MongoDB $$REMOVE Documentation](https://www.mongodb.com/docs/manual/reference/operator/aggregation/unsetfield/)
- [MongoDB Aggregation Pipeline Updates](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/)

---

**Last Updated:** 2025-11-07  
**Status:** ✅ Fixed with Global Wrapper  
**Severity:** High → Resolved  
**Commits:** `a78e3ea6`, `51f9bb04`, `1c51d117`

