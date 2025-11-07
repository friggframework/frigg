# Frontify DocumentDB Migration Guide

## Issue: Custom Repository Undefined Error

```
Error loading integration instance: TypeError: Cannot read properties of undefined (reading 'findOne')
at IntegrationRepository.loadIntegrationRecordByAsanaUser (/var/task/src/repositories/IntegrationRepository.js:26:51)
```

### Root Cause

Frontify's custom `IntegrationRepository.js` is trying to use Mongoose models directly:

```javascript
// ❌ OLD (Mongoose - doesn't work with DocumentDB native driver)
const IntegrationModel = require('@friggframework/core').IntegrationModel;

class IntegrationRepository {
    loadIntegrationRecordByAsanaUser(asanaUserId) {
        // IntegrationModel is undefined because we switched to native driver
        return IntegrationModel.findOne({ 'config.asanaUserId': asanaUserId });
    }
}
```

### Solution 1: Use Frigg Core Repositories (Recommended)

Replace custom repository with Frigg's factory-based repositories:

```javascript
// ✅ NEW (Use Frigg's repository system)
const { createIntegrationRepository } = require('@friggframework/core/integrations/repositories/integration-repository-factory');

class AsanaIntegration {
    constructor() {
        // Auto-detects DocumentDB and returns correct adapter
        this.integrationRepository = createIntegrationRepository();
    }

    async hydrateIntegrationByAsanaUser(asanaUserId) {
        // Use Frigg's repository methods
        const integration = await this.integrationRepository.findIntegration({
            'config.asanaUserId': asanaUserId
        });
        return integration;
    }
}
```

### Solution 2: Update Custom Repository to Use Native Client

If you need custom methods, extend Frigg's base repository:

```javascript
// src/repositories/IntegrationRepository.js
const { BaseRepositoryDocumentDB } = require('@friggframework/core/database/repositories/base-repository-documentdb');
const { ObjectId } = require('mongodb');

class IntegrationRepository extends BaseRepositoryDocumentDB {
    constructor() {
        super('Integration', 'Integration'); // collection name, model name
    }

    async loadIntegrationRecordByAsanaUser(asanaUserId) {
        // Use lazy-loaded collection (works with DocumentDB native driver)
        return await this.collection.findOne({ 
            'config.asanaUserId': asanaUserId 
        });
    }

    async findByWorkspaceId(workspaceId) {
        return await this.collection.find({ 
            'config.workspaceId': workspaceId 
        }).toArray();
    }
}

module.exports = { IntegrationRepository };
```

### Available Frigg Core Methods

All Frigg repositories are automatically DocumentDB-compatible:

```javascript
const { 
    createIntegrationRepository,
    createCredentialRepository,
    createUserRepository,
    createModuleRepository,
} = require('@friggframework/core');

const integrationRepo = createIntegrationRepository();
const credentialRepo = createCredentialRepository();
const userRepo = createUserRepository();
const moduleRepo = createModuleRepository();

// All standard CRUD methods work:
await integrationRepo.findIntegrationById(id);
await integrationRepo.findIntegration(criteria);
await integrationRepo.createIntegration(data);
await integrationRepo.updateIntegration(id, data);
await integrationRepo.deleteIntegration(id);
```

### Migration Checklist

- [ ] Replace Mongoose model imports with repository factories
- [ ] Update custom repository classes to extend `BaseRepositoryDocumentDB`
- [ ] Change `.findOne()` to use `this.collection.findOne()`
- [ ] Change `.find()` to use `this.collection.find().toArray()`
- [ ] Update all direct model calls to use repository pattern
- [ ] Test all integration endpoints

### Why This Happened

Frigg switched from Prisma (which uses `$$REMOVE` operator) to native MongoDB driver for DocumentDB compatibility. DocumentDB doesn't support `$$REMOVE`, causing production errors. The native driver requires a different access pattern (repositories instead of direct model imports).

### Benefits

✅ **DocumentDB Compatible** - No `$$REMOVE` errors  
✅ **Field-Level Encryption** - Works automatically  
✅ **Lazy Loading** - Collections only accessed after connection  
✅ **DDD Architecture** - Proper separation of concerns  
✅ **Future-Proof** - Works with MongoDB, DocumentDB, and future databases

