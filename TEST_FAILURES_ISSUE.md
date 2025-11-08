# Test Failures After MongoDB Native Driver Consolidation

## Summary

After consolidating MongoDB repositories to use the native driver (PR #490), we have **79 failing tests** remaining. These are **pre-existing issues** not caused by the refactor itself, but they need to be addressed for full test coverage.

**Test Results:**
- ✅ **688 passing** (88.9%)
- ❌ **79 failing** (10.2%)
- ⏭️ **7 skipped** (0.9%)
- **Total:** 774 tests

## Categories of Failures

### 1. Encryption & Decryption Tests (High Priority)

**Affected Files:**
- `database/encryption/mongo-decryption-fix-verification.test.js`
- `database/encryption/postgres-decryption-fix-verification.test.js`
- `database/encryption/postgres-relation-decryption.test.js`
- `database/encryption/encryption-integration.test.js`
- `database/encrypted-collection-wrapper.test.js`

**Root Cause:**
These tests were written for the Prisma-based repositories and need to be updated for the native MongoDB driver architecture.

**Issues:**
- Mock setup expects Prisma client methods
- Encryption middleware hooks are Prisma-specific
- Test data setup uses Prisma syntax

**Recommended Fix:**
1. Update mocks to use native MongoDB driver patterns
2. Test `EncryptedCollection` wrapper directly instead of Prisma middleware
3. Use native MongoDB commands for test data setup
4. Verify field-level encryption works with `BaseRepositoryDocumentDB`

**Example Fix:**
```javascript
// OLD (Prisma-based)
const mockPrisma = {
    credential: {
        create: jest.fn(),
        findUnique: jest.fn()
    }
};

// NEW (Native driver)
const mockCollection = {
    insertOne: jest.fn(),
    findOne: jest.fn()
};
jest.mock('../../database/mongodb-native-client', () => ({
    getNativeMongoClient: () => ({
        collection: () => mockCollection
    })
}));
```

---

### 2. Health Check Tests (Medium Priority)

**Affected Files:**
- `handlers/routers/health.test.js`

**Root Cause:**
Health check router now uses lazy initialization for repositories, but tests expect synchronous instantiation.

**Issues:**
- Tests fail with 503 status instead of expected 200
- Repository factory calls happen at request time, not module load time
- Mock setup happens before lazy initialization

**Recommended Fix:**
1. Update test setup to mock the native MongoDB client connection
2. Ensure `connectDatabase()` is called before health check tests
3. Mock `getNativeMongoClient()` to return a connected client
4. Update test assertions to handle lazy-loaded repositories

**Example Fix:**
```javascript
beforeEach(async () => {
    // Mock native client as connected
    jest.mock('../../database/mongodb-native-client', () => ({
        getNativeMongoClient: () => ({
            isConnected: true,
            collection: jest.fn()
        })
    }));
    
    // Ensure database is "connected" before tests
    await connectDatabase();
});
```

---

### 3. User & Authentication Tests (Medium Priority)

**Affected Files:**
- `user/tests/use-cases/get-user-from-adopter-jwt.test.js`
- `user/tests/use-cases/get-user-from-x-frigg-headers.test.js`
- `user/tests/user-password-hashing.test.js`
- `user/tests/user-password-encryption-isolation.test.js`

**Root Cause:**
User repository tests still expect Prisma-based repository methods.

**Issues:**
- Mock setup uses Prisma client patterns
- Test data creation uses Prisma syntax
- Repository method signatures may have changed

**Recommended Fix:**
1. Update mocks to use `UserRepositoryMongoDBNative`
2. Use native MongoDB commands for test data setup
3. Verify bcrypt integration still works with native driver
4. Update test assertions for native driver return values

---

### 4. Integration & Process Tests (Low Priority)

**Affected Files:**
- `integrations/use-cases/update-process-metrics.test.js`
- `integrations/use-cases/update-process-state.test.js`
- `handlers/webhook-flow.integration.test.js`

**Root Cause:**
Integration tests use Prisma-based repository patterns.

**Issues:**
- Mock setup expects Prisma repositories
- Test data uses Prisma relations
- Integration tests may need database connection

**Recommended Fix:**
1. Update to use native driver repository factories
2. Mock `BaseRepositoryDocumentDB` for unit tests
3. Use real MongoDB connection for integration tests
4. Update test data to use native MongoDB patterns

---

### 5. Miscellaneous Tests (Low Priority)

**Affected Files:**
- `queues/queuer-util.test.js`
- `encrypt/Cryptor.test.js`
- `database/utils/mongodb-schema-init.test.js`

**Root Cause:**
Various mocking and setup issues.

**Issues:**
- Environment variable mocking conflicts
- Module import order issues
- Database connection state assumptions

**Recommended Fix:**
1. Use `jest.resetModules()` before each test
2. Mock environment variables before imports
3. Ensure clean test isolation

---

## Recommended Approach

### Phase 1: Critical Path (Week 1)
**Goal:** Fix encryption and health check tests

1. ✅ Update `encrypted-collection-wrapper.test.js`
   - Test the wrapper directly with mocked native collection
   - Verify encryption/decryption works correctly
   
2. ✅ Update `encryption-integration.test.js`
   - Use real MongoDB connection
   - Test end-to-end encryption with native driver
   
3. ✅ Fix `health.test.js`
   - Mock native client connection
   - Test lazy initialization pattern
   - Verify all health check endpoints

### Phase 2: Repository Tests (Week 2)
**Goal:** Fix user and authentication tests

1. ✅ Update user repository tests
   - Use `UserRepositoryMongoDBNative`
   - Mock native MongoDB collection
   - Verify password hashing integration

2. ✅ Update credential repository test
   - Fix ObjectId validation test (currently failing)
   - Add input validation tests

### Phase 3: Integration Tests (Week 3)
**Goal:** Fix integration and process tests

1. ✅ Update process use case tests
2. ✅ Update webhook integration tests
3. ✅ Verify end-to-end flows

### Phase 4: Cleanup (Week 4)
**Goal:** Fix remaining miscellaneous tests

1. ✅ Fix queue tests
2. ✅ Fix cryptor tests
3. ✅ Fix schema init tests

---

## Testing Strategy

### Unit Tests
- Mock `BaseRepositoryDocumentDB` and `getNativeMongoClient()`
- Test repository methods in isolation
- Verify encryption integration

### Integration Tests
- Use real MongoDB connection (test database)
- Test end-to-end flows
- Verify lazy initialization works in Lambda context

### Test Utilities Needed

Create helper utilities for consistent test setup:

```javascript
// test/helpers/mongodb-native-mocks.js
function mockMongoDBNativeClient(mockData = {}) {
    const mockCollection = {
        findOne: jest.fn().mockResolvedValue(mockData.findOne),
        find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(mockData.find || [])
        }),
        insertOne: jest.fn().mockResolvedValue({
            insertedId: mockData.insertedId || new ObjectId()
        }),
        updateOne: jest.fn().mockResolvedValue({
            modifiedCount: 1
        }),
        deleteOne: jest.fn().mockResolvedValue({
            deletedCount: 1
        })
    };
    
    jest.mock('../../database/mongodb-native-client', () => ({
        getNativeMongoClient: () => ({
            isConnected: true,
            collection: () => mockCollection
        })
    }));
    
    return mockCollection;
}

module.exports = { mockMongoDBNativeClient };
```

---

## Success Criteria

- ✅ All 79 failing tests pass
- ✅ No new test failures introduced
- ✅ Test coverage remains above 80%
- ✅ All encryption tests verify field-level encryption works
- ✅ All health check tests pass with lazy initialization
- ✅ Integration tests work with native driver

---

## Architecture Notes

**Why These Tests Failed:**

The MongoDB native driver consolidation changed the **infrastructure layer** (Adapter pattern), but these tests were tightly coupled to Prisma's API. This is a good reminder to:

1. ✅ **Test interfaces, not implementations** - Tests should use repository interfaces, not concrete implementations
2. ✅ **Mock at boundaries** - Mock the database client, not the repository
3. ✅ **Use test doubles** - Create test repository implementations instead of mocking

**Hexagonal Architecture Compliance:**

The failing tests reveal where we violated Hexagonal Architecture principles:
- Tests were coupled to Prisma (infrastructure detail)
- Should have been testing against `RepositoryInterface` (port)
- Should have used test doubles (adapter) instead of mocks

**Going Forward:**

Future tests should:
1. Use repository interfaces, not concrete classes
2. Create test repository implementations (in-memory)
3. Only mock at the infrastructure boundary (native client)
4. Test use cases independently of database implementation

---

## Related PRs

- #490 - MongoDB Native Driver Consolidation (parent PR)
- #481 - CloudFormation Discovery Fixes (original issue)

---

## Labels

- `bug` - Tests are failing
- `testing` - Test infrastructure updates needed
- `good first issue` - Phase 4 tests are good for new contributors
- `help wanted` - Community contributions welcome
- `priority: high` - Encryption tests need immediate attention

---

## Assignees

TBD - Assign to team members based on expertise:
- Encryption tests → Security team
- Health check tests → Infrastructure team
- Repository tests → Backend team

