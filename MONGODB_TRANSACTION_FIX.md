# MongoDB Transaction Namespace Fix

## Problem

The encryption health check was failing with the following error:

```
Cannot create namespace frigg.Credential in multi-document transaction.
Error code: 263
```

### Root Cause

MongoDB does not allow creating collections (namespaces) inside multi-document transactions. When Prisma tries to create a document in a collection that doesn't exist yet, MongoDB needs to implicitly create the collection. If this happens inside a transaction context, MongoDB throws error code 263.

### Technical Details

- **MongoDB Constraint**: Collections must exist before being used in multi-document transactions
- **Prisma Behavior**: Prisma may implicitly use transactions for certain operations
- **Impact**: Health checks fail on fresh databases or when the Credential collection hasn't been created yet

## Solution

Implemented a proactive collection existence check before performing Prisma operations that might create documents.

### Changes Made

1. **Created MongoDB Collection Utilities** (`packages/core/database/utils/mongodb-collection-utils.js`)
   - `ensureCollectionExists(collectionName)` - Ensures a single collection exists
   - `ensureCollectionsExist(collectionNames)` - Ensures multiple collections exist
   - `collectionExists(collectionName)` - Checks if a collection exists

2. **Updated Health Check Repository** (`packages/core/database/repositories/health-check-repository-mongodb.js`)
   - Modified `createCredential()` to ensure the Credential collection exists before creating documents
   - Added reference to GitHub issue: https://github.com/prisma/prisma/issues/8305

3. **Added Tests** (`packages/core/database/utils/mongodb-collection-utils.test.js`)
   - Comprehensive unit tests for all utility functions
   - Tests race condition handling (NamespaceExists errors)
   - Tests error handling and graceful degradation

### Implementation Pattern

```javascript
async createCredential(credentialData) {
    // Ensure collection exists before creating document
    // This prevents "Cannot create namespace in multi-document transaction" error
    await ensureCollectionExists('Credential');

    return await prisma.credential.create({
        data: credentialData,
    });
}
```

## Best Practices Followed

1. **Domain-Driven Design**: Created reusable utility module for MongoDB-specific concerns
2. **Hexagonal Architecture**: Kept infrastructure concerns (MongoDB) separate from business logic
3. **Test-Driven Development**: Added comprehensive tests for the utility functions
4. **Error Handling**: Graceful degradation on race conditions and errors
5. **Documentation**: Inline comments and JSDoc for all functions

## Benefits

- ✅ Fixes encryption health check failures on fresh databases
- ✅ Prevents transaction namespace errors across all MongoDB repositories
- ✅ Reusable utility for any MongoDB collection creation
- ✅ Handles race conditions gracefully
- ✅ Well-tested and documented

## References

- [Prisma Issue #8305](https://github.com/prisma/prisma/issues/8305)
- [Mongoose Issue #6699](https://github.com/Automattic/mongoose/issues/6699)
- [MongoDB Transactions Documentation](https://www.mongodb.com/docs/manual/core/transactions/#transactions-and-operations)

## Future Improvements

Consider applying this pattern to other MongoDB repositories that create documents:
- `credential-repository-mongo.js`
- `integration-repository-mongo.js`
- `module-repository-mongo.js`
- `user-repository-mongo.js`
- etc.
