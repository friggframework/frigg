# DocumentDB Refactor Plan: Native MongoDB Driver

## 🎯 Problem Statement

**Prisma's MongoDB driver is incompatible with AWS DocumentDB:**
- Prisma requires MongoDB 4.2+ features (aggregation pipeline updates, `$$REMOVE`)
- DocumentDB only supports MongoDB 4.0 features
- This is an **architectural incompatibility** that cannot be worked around
- Affects ALL Prisma operations (create, update, upsert)

## 🏗️ Proposed Solution: Separate DocumentDB Adapter

Create a **new adapter** using the native MongoDB Node.js driver for DocumentDB deployments.

### Architecture

```
Port: CredentialRepositoryInterface
├── Adapter (MongoDB): CredentialRepositoryMongo → Prisma ✅ (unchanged)
├── Adapter (DocumentDB): CredentialRepositoryDocumentDB → Native driver ✅ (NEW)
└── Adapter (PostgreSQL): CredentialRepositoryPostgres → Prisma ✅ (unchanged)
```

### Factory Pattern

```javascript
function createCredentialRepository() {
    const dbType = detectDatabaseType(); // 'mongodb', 'documentdb', 'postgresql'
    
    switch(dbType) {
        case 'mongodb':
            return new CredentialRepositoryMongo();     // Prisma
        case 'documentdb':
            return new CredentialRepositoryDocumentDB(); // Native driver
        case 'postgresql':
            return new CredentialRepositoryPostgres();  // Prisma
    }
}
```

---

## 📋 Repositories to Refactor (10 total)

### Core Domain Repositories
1. ✅ **CredentialRepository** - OAuth tokens, encrypted data
2. ✅ **UserRepository** - User accounts, passwords
3. ✅ **TokenRepository** - Session tokens
4. ✅ **IntegrationRepository** - Integration instances
5. ✅ **ModuleRepository** - Entity/module data
6. ✅ **IntegrationMappingRepository** - Data mappings
7. ✅ **ProcessRepository** - Long-running processes
8. ✅ **SyncRepository** - Sync state
9. ✅ **WebsocketConnectionRepository** - WS connections
10. ✅ **HealthCheckRepository** - Health check operations

---

## 🔧 Implementation Strategy

### Phase 1: Infrastructure Setup

**1. Create Native MongoDB Client Wrapper**
```javascript
// packages/core/database/mongodb-native-client.js
const { MongoClient } = require('mongodb');

class MongoDBNativeClient {
    constructor() {
        this.client = null;
        this.db = null;
    }
    
    async connect() {
        const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
        this.client = new MongoClient(uri, {
            readPreference: 'primary',
            retryWrites: false,
            tls: true,
            tlsCAFile: process.env.TLS_CA_FILE,
        });
        await this.client.connect();
        this.db = this.client.db();
    }
    
    collection(name) {
        return this.db.collection(name);
    }
}
```

**2. Create Field-Level Encryption Wrapper**
```javascript
// Wrap MongoDB operations with encryption/decryption
class EncryptedCollection {
    constructor(collection, encryptionService, modelName) {
        this.collection = collection;
        this.encryptionService = encryptionService;
        this.modelName = modelName;
    }
    
    async insertOne(doc) {
        const encrypted = await this.encryptionService.encryptFields(
            this.modelName,
            doc
        );
        const result = await this.collection.insertOne(encrypted);
        return result;
    }
    
    async findOne(filter) {
        const doc = await this.collection.findOne(filter);
        if (doc) {
            return await this.encryptionService.decryptFields(
                this.modelName,
                doc
            );
        }
        return doc;
    }
    
    // ... other methods
}
```

### Phase 2: Create DocumentDB Repositories

**Template for each repository:**

```javascript
// credential/repositories/credential-repository-documentdb.js
const { getNativeMongoClient } = require('../../database/mongodb-native-client');
const { CredentialRepositoryInterface } = require('./credential-repository-interface');

class CredentialRepositoryDocumentDB extends CredentialRepositoryInterface {
    constructor() {
        super();
        this.client = getNativeMongoClient();
        this.collection = this.client.collection('Credential');
    }
    
    async findById(id) {
        const { ObjectId } = require('mongodb');
        return await this.collection.findOne({ _id: new ObjectId(id) });
    }
    
    async create(data) {
        const result = await this.collection.insertOne({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return await this.findById(result.insertedId.toString());
    }
    
    async update(id, data) {
        const { ObjectId } = require('mongodb');
        await this.collection.updateOne(
            { _id: new ObjectId(id) },
            { 
                $set: { ...data, updatedAt: new Date() }
            }
        );
        return await this.findById(id);
    }
    
    // ... implement all interface methods
}
```

### Phase 3: Update Factories

**Update each factory to detect DocumentDB:**

```javascript
// credential/repositories/credential-repository-factory.js
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');

function createCredentialRepository() {
    const dbType = process.env.DATABASE_TYPE || 'mongodb';
    
    // Auto-detect DocumentDB
    if (isDocumentDB()) {
        const { CredentialRepositoryDocumentDB } = require('./credential-repository-documentdb');
        return new CredentialRepositoryDocumentDB();
    }
    
    // Use Prisma for MongoDB and PostgreSQL
    if (dbType === 'postgresql') {
        const { CredentialRepositoryPostgres } = require('./credential-repository-postgres');
        return new CredentialRepositoryPostgres();
    }
    
    const { CredentialRepositoryMongo } = require('./credential-repository-mongo');
    return new CredentialRepositoryMongo();
}
```

---

## 📊 Effort Estimation

| Phase | Effort | Files | Risk |
|-------|--------|-------|------|
| **Phase 1: Infrastructure** | 2-3 days | 3 new files | Low |
| **Phase 2: Repositories** | 5-7 days | 10 repos × 2 (impl + tests) | Medium |
| **Phase 3: Factories** | 1-2 days | 10 factories | Low |
| **Phase 4: Integration Testing** | 2-3 days | E2E tests | Medium |
| **Phase 5: Migration & Deployment** | 1-2 days | Rollout strategy | High |
| **Total** | **11-17 days** | **~40 files** | **Medium-High** |

---

## ⚖️ **Decision: Refactor vs Workaround**

### **Option A: Full Refactor (Native Driver)**

**Pros:**
- ✅ Proper architectural solution
- ✅ Full DocumentDB compatibility
- ✅ No Prisma limitations
- ✅ Follows Hexagonal Architecture perfectly

**Cons:**
- ❌ 2-3 weeks of work
- ❌ 40+ files to change
- ❌ Risk of introducing bugs
- ❌ Lose Prisma's type safety for DocumentDB
- ❌ Maintain two database adapters (Prisma + Native)

### **Option B: Pragmatic Workaround (Current)**

**Pros:**
- ✅ Works immediately
- ✅ Tests what matters (KMS encryption works)
- ✅ Production encryption unaffected
- ✅ Minimal code changes
- ✅ Health check passes

**Cons:**
- ❌ Doesn't test Prisma + encryption integration on DocumentDB
- ❌ Feels like a hack
- ❌ DocumentDB users can't use full Prisma features

---

## 🎯 **Recommendation**

### **Short-term (Now):** Use Option B
- Deploy the KMS-only test
- Get health check passing
- Production encryption works

### **Long-term (Next Quarter):** Consider Option A
- Plan the native driver refactor
- Do it properly with full test coverage
- Migrate DocumentDB deployments gradually

### **Alternative:** Switch to MongoDB Atlas
- Full Prisma compatibility
- No refactoring needed
- Different pricing model
- Migration effort

---

## 🤔 **Your Call**

Given that you're following DDD/Hexagonal/TDD, the **proper solution is Option A** (native driver adapter).

But it's 2-3 weeks of work. Is the encryption health check test worth that investment?

**What do you want to do?**
1. **Deploy the workaround now** (health check passes, move on)
2. **Start the refactor** (I can begin implementing native driver adapters)
3. **Consider MongoDB Atlas** (avoid the problem entirely)

