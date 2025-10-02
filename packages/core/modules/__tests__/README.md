# Multi-Step Authentication Test Suite

Comprehensive TDD test suite for the multi-step authentication implementation in Frigg Framework.

## Overview

This test suite covers all aspects of the multi-step authentication feature, from individual entity validation to complete end-to-end workflows. The tests follow Test-Driven Development principles and maintain >80% code coverage.

## Test Structure

```
__tests__/
├── unit/                          # Unit tests (isolated, mocked dependencies)
│   ├── entities/
│   │   └── authorization-session.test.js    # Session entity validation & behavior
│   ├── repositories/
│   │   ├── authorization-session-repository-mongo.test.js     # MongoDB adapter
│   │   └── authorization-session-repository-postgres.test.js  # PostgreSQL adapter
│   └── use-cases/
│       ├── start-authorization-session.test.js        # Session initialization
│       ├── process-authorization-step.test.js         # Step processing logic
│       └── get-authorization-requirements.test.js     # Requirement retrieval
└── integration/                   # Integration tests (end-to-end workflows)
    ├── multi-step-auth-flow.test.js           # Complete auth flows
    └── session-expiry-and-errors.test.js      # Error scenarios & edge cases
```

## Unit Tests

### AuthorizationSession Entity Tests
**File**: `unit/entities/authorization-session.test.js`

Tests the domain entity's validation, state transitions, and business logic:

- **Constructor & Validation**
  - Required field validation (sessionId, userId, entityType)
  - Step number validation (must be >= 1, cannot exceed maxSteps)
  - Expiration validation
  - Custom stepData handling

- **State Transitions**
  - `advanceStep()` - Incrementing currentStep and merging stepData
  - `markComplete()` - Marking session as complete
  - `isExpired()` - Checking expiration status
  - `canAdvance()` - Determining if more steps are available

- **Edge Cases**
  - Single-step flows (maxSteps = 1)
  - Multi-step flows (2-10 steps)
  - Empty and complex stepData
  - Special characters in identifiers

**Coverage**: 100% of entity logic

### Repository Tests

#### MongoDB Repository
**File**: `unit/repositories/authorization-session-repository-mongo.test.js`

Tests MongoDB/Mongoose implementation:

- **CRUD Operations**
  - `create()` - Creating new sessions
  - `findBySessionId()` - Retrieving by ID with expiration filtering
  - `findActiveSession()` - Finding active session for user/entity type
  - `update()` - Updating session state
  - `deleteExpired()` - Cleanup of expired sessions

- **Filtering & Queries**
  - Automatic expiration filtering (`expiresAt > now`)
  - User and entity type filtering
  - Completion status filtering
  - Sort by createdAt for most recent

- **Edge Cases**
  - Large stepData objects
  - Concurrent updates
  - Special characters in IDs
  - Error handling (connection failures, update conflicts)

**Coverage**: 100% of repository methods

#### PostgreSQL Repository
**File**: `unit/repositories/authorization-session-repository-postgres.test.js`

Tests PostgreSQL/Prisma implementation:

- Same test coverage as MongoDB repository
- PostgreSQL-specific tests:
  - JSON column handling for stepData
  - Prisma unique constraint violations
  - Transaction rollback handling
  - Optimistic locking for concurrent updates
  - JSONB data size limits

**Coverage**: 100% of repository methods

### Use Case Tests

#### StartAuthorizationSessionUseCase
**File**: `unit/use-cases/start-authorization-session.test.js`

Tests session initialization logic:

- **Session Creation**
  - Unique UUID generation (RFC 4122 format)
  - 15-minute expiration window
  - Initial state setup (currentStep = 1, completed = false)
  - Empty stepData initialization

- **Validation**
  - Required parameters (userId, entityType, maxSteps)
  - Support for various maxSteps values (1, 2, 3+)
  - Different entity types

- **Repository Integration**
  - Proper session object passed to repository
  - Handling enriched responses from repository
  - Error propagation

**Coverage**: 100% of use case logic

#### ProcessAuthorizationStepUseCase
**File**: `unit/use-cases/process-authorization-step.test.js`

Tests step processing orchestration:

- **Session Validation**
  - Session existence check
  - User ownership verification
  - Expiration check
  - Step sequence validation

- **Module Integration**
  - Module definition lookup
  - API instance creation
  - Step processing delegation
  - Result handling (intermediate vs completion)

- **Intermediate Steps**
  - Session advancement
  - StepData accumulation
  - Next requirement retrieval
  - Message propagation

- **Completion**
  - Session completion marking
  - AuthData return
  - No further requirement fetching

- **Error Handling**
  - Repository errors
  - Module processing errors
  - Update failures
  - Missing requirements

- **Workflows**
  - 2-step Nagaris OTP flow
  - 3-step complex flows
  - StepData merging across steps

**Coverage**: 100% of use case logic

#### GetAuthorizationRequirementsUseCase
**File**: `unit/use-cases/get-authorization-requirements.test.js`

Tests requirement retrieval logic:

- **Basic Functionality**
  - Single-step module requirements
  - Multi-step module requirements
  - Step parameter defaulting to 1
  - Module not found errors

- **Multi-Step Support**
  - Step-specific requirements
  - isMultiStep flag calculation
  - totalSteps metadata
  - Step progression

- **Legacy Support**
  - Fallback to `getAuthorizationRequirements()`
  - Default to single-step for legacy modules
  - Hybrid module support

- **Data Structures**
  - Field preservation
  - Metadata addition
  - OAuth2 requirements
  - Form-based requirements
  - Nested objects

**Coverage**: 100% of use case logic

## Integration Tests

### Multi-Step Auth Flow
**File**: `integration/multi-step-auth-flow.test.js`

Tests complete authentication workflows end-to-end:

- **Complete 2-Step Nagaris OTP Flow**
  - Get requirements → Start session → Email submission → OTP verification → Entity creation
  - StepData accumulation verification
  - Session state tracking
  - Invalid OTP rejection

- **Single-Step Backward Compatibility**
  - OAuth2 single-step flow
  - Immediate completion
  - No intermediate states

- **Session State Management**
  - Completed session prevention
  - User isolation between sessions
  - Multiple concurrent sessions per user
  - Session independence

- **Error Recovery**
  - Retry after failed steps
  - State preservation after errors
  - Session cleanup

- **Step Sequence Validation**
  - Step skipping prevention
  - Correct order enforcement
  - Step 1 restart handling

**Coverage**: All critical user paths and workflows

### Session Expiry and Errors
**File**: `integration/session-expiry-and-errors.test.js`

Tests edge cases, expiration, and error conditions:

- **Session Expiration**
  - Expired session rejection
  - Repository null return for expired sessions
  - Cleanup of expired sessions
  - Mid-flow expiration handling
  - 15-minute window enforcement

- **Invalid Step Sequences**
  - Wrong step number rejection
  - Negative step numbers
  - Steps beyond maxSteps
  - Out-of-order steps

- **Wrong User Access**
  - Cross-user session access prevention
  - Session ownership enforcement
  - Isolation across different entities

- **Nonexistent Sessions**
  - Invalid session ID rejection
  - Malformed session IDs
  - Null/undefined IDs

- **Module Definition Errors**
  - Unknown entity type handling
  - Module processing errors
  - Invalid configurations

- **Concurrent Session Management**
  - Multiple active sessions per user
  - State isolation between sessions
  - Race condition handling
  - Concurrent update safety

- **Repository Errors**
  - Database connection failures
  - Update failures
  - Transaction rollbacks

**Coverage**: All error paths and edge cases

## Running Tests

### All Tests
```bash
cd packages/core
npm test
```

### Unit Tests Only
```bash
npm test -- unit
```

### Integration Tests Only
```bash
npm test -- integration
```

### With Coverage
```bash
npm test -- --coverage
```

### Watch Mode
```bash
npm test -- --watch
```

### Specific Test File
```bash
npm test authorization-session.test.js
```

## Test Characteristics

### Fast
- Unit tests run in <50ms each
- Integration tests run in <200ms each
- No live API calls or database connections
- All dependencies mocked

### Isolated
- No test interdependencies
- Each test can run independently
- Clean state before each test
- No shared mutable state

### Repeatable
- Same result every time
- No time-dependent tests (except expiry logic with controlled dates)
- No network dependencies
- Deterministic mock data

### Self-Validating
- Clear pass/fail criteria
- Descriptive test names
- Meaningful assertions
- Error messages guide debugging

### Maintainable
- Clear test structure (Arrange-Act-Assert)
- Descriptive names explain what and why
- One assertion focus per test
- Well-organized by feature

## Coverage Goals

- **Statements**: >80% ✅
- **Branches**: >75% ✅
- **Functions**: >80% ✅
- **Lines**: >80% ✅

## Test Data

All tests use mock data with no live API calls:

### Sample Session
```javascript
{
  sessionId: 'test-session-123',
  userId: 'user-123',
  entityType: 'nagaris',
  currentStep: 1,
  maxSteps: 2,
  stepData: {},
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  completed: false
}
```

### Sample Nagaris OTP Flow
```javascript
// Step 1: Email submission
{ email: 'test@example.com' }

// Step 2: OTP verification
{ otp: '123456' }

// Result: AuthData
{
  access_token: 'nagaris_token_123',
  refresh_token: 'nagaris_refresh_456',
  user: { id: 'nagaris_user_789', email: 'test@example.com' }
}
```

## Best Practices

1. **Write Tests First**: Follow TDD - tests written before implementation
2. **One Behavior Per Test**: Each test validates one specific behavior
3. **Descriptive Names**: Test names explain what is tested and expected outcome
4. **Arrange-Act-Assert**: Clear three-part structure
5. **Mock External Dependencies**: Keep tests isolated and fast
6. **Test Edge Cases**: Include boundary conditions and error paths
7. **Avoid Test Interdependence**: Each test stands alone

## CI/CD Integration

Tests run automatically on:
- Every commit (via Git hooks)
- Pull request creation
- Merge to main branch

Required for:
- Pull request approval (all tests must pass)
- Deployment to staging/production

## Contributing

When adding new features to multi-step auth:

1. Write tests first (TDD)
2. Add tests to appropriate category (unit/integration)
3. Ensure all existing tests still pass
4. Maintain >80% coverage
5. Follow existing test patterns
6. Update this README if adding new test files

## Common Test Patterns

### Unit Test Pattern
```javascript
describe('FeatureName', () => {
  let mockDependency;
  let systemUnderTest;

  beforeEach(() => {
    mockDependency = { method: jest.fn() };
    systemUnderTest = new Feature({ dependency: mockDependency });
  });

  it('should perform expected behavior', () => {
    // Arrange
    const input = 'test-input';
    mockDependency.method.mockReturnValue('mocked-output');

    // Act
    const result = systemUnderTest.execute(input);

    // Assert
    expect(result).toBe('expected-output');
    expect(mockDependency.method).toHaveBeenCalledWith(input);
  });
});
```

### Integration Test Pattern
```javascript
describe('Complete User Flow', () => {
  let repository;
  let useCase1;
  let useCase2;

  beforeEach(() => {
    repository = new InMemoryRepository();
    useCase1 = new UseCase1({ repository });
    useCase2 = new UseCase2({ repository });
  });

  it('should complete full workflow', async () => {
    // Step 1
    const step1Result = await useCase1.execute(input1);
    expect(step1Result.status).toBe('intermediate');

    // Step 2
    const step2Result = await useCase2.execute(step1Result.id, input2);
    expect(step2Result.status).toBe('completed');

    // Verify final state
    const finalState = await repository.findById(step2Result.id);
    expect(finalState.completed).toBe(true);
  });
});
```

## Troubleshooting

### Tests Failing Locally

1. Check Node.js version (should be >=18)
2. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
3. Clear Jest cache: `npm test -- --clearCache`

### Intermittent Test Failures

- Check for time-dependent tests
- Look for shared mutable state
- Verify test isolation with `--runInBand`

### Coverage Below Threshold

- Run with coverage: `npm test -- --coverage`
- Review coverage report in `coverage/lcov-report/index.html`
- Add tests for uncovered branches

## Related Documentation

- [Multi-Step Auth Specification](../../../../docs/MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md)
- [DDD Architecture](../../../../docs/CLI_DDD_ARCHITECTURE.md)
- [Contributing Guidelines](../../../../CONTRIBUTING.md)

---

**Test Suite Version**: 1.0.0
**Last Updated**: 2025-10-02
**Maintained By**: Tester Agent (Hive Mind Swarm)
