# Multi-Step Authorization Testing Documentation

This directory contains comprehensive tests for the Frigg API v2 multi-step authorization implementation.

## Test Structure

```
__tests__/
├── unit/
│   ├── domain/
│   │   └── authorization-session.test.js       # Domain entity tests
│   ├── use-cases/
│   │   ├── start-authorization-session.test.js # Session creation tests
│   │   ├── process-authorization-step.test.js  # Step processing tests
│   │   └── get-authorization-requirements.test.js # Requirements tests
│   └── repositories/
│       ├── authorization-session-repository-mongo.test.js
│       └── authorization-session-repository-postgres.test.js
├── integration/
│   ├── multi-step-auth.test.js                 # Complete auth flow tests
│   ├── credential-management.test.js           # Credential CRUD tests (TODO)
│   └── entity-reauth.test.js                   # Re-authorization tests (TODO)
└── helpers/
    └── auth-test-helpers.js                    # Shared test utilities
```

## Running Tests

### Run All Tests
```bash
cd /Users/sean/Documents/GitHub/frigg/packages/core
npm test
```

### Run Specific Test Suites

```bash
# Run only multi-step auth tests
npm test -- modules/__tests__

# Run only unit tests
npm test -- modules/__tests__/unit

# Run only integration tests
npm test -- modules/__tests__/integration

# Run specific test file
npm test -- modules/__tests__/unit/use-cases/start-authorization-session.test.js

# Run with coverage
npm test -- --coverage modules/__tests__
```

### Watch Mode (for development)
```bash
npm test -- --watch modules/__tests__
```

## Test Coverage Summary

### ✅ Implemented Tests

#### Unit Tests (Domain Layer)
- **AuthorizationSession Entity** - 25+ test cases
  - Constructor validation
  - Step advancement logic  
  - Completion marking
  - Expiration checking
  - Edge cases

#### Unit Tests (Use Cases)
- **StartAuthorizationSessionUseCase** - 20+ test cases
  - Session creation and UUID generation
  - Expiration handling
  - Input validation
  - Multiple concurrent sessions

- **ProcessAuthorizationStepUseCase** - 15+ test cases  
  - Multi-step flow processing
  - Single-step flow processing
  - Step validation and sequencing
  - Session ownership verification
  - Error handling

- **GetAuthorizationRequirementsUseCase** - 10+ test cases
  - Multi-step vs single-step detection
  - Requirements retrieval
  - Input validation

#### Integration Tests
- **Multi-Step Authentication Flow** - 15+ scenarios
  - Nagaris 2-step OTP (email → OTP)
  - HubSpot single-step OAuth
  - Slack 2-step OAuth + selection
  - Session lifecycle management
  - Concurrent sessions
  - Error recovery

### ⬜ TODO Tests

- **ReauthorizeEntity Use Case** (unit)
- **Credential Management** (integration)
- **Entity Re-authentication** (integration)

## Test Helpers

Located in `helpers/auth-test-helpers.js`:

### Mock Module Definitions
- `MockNagarisDefinition` - 2-step OTP flow
- `MockHubSpotDefinition` - Single-step OAuth
- `MockSlackDefinition` - 2-step OAuth + selection

### Test Repositories
- `TestAuthorizationSessionRepository`
- `TestModuleRepository`  
- `TestCredentialRepository`

### Helper Functions
```javascript
createTestSession({ userId, entityType, maxSteps, ... })
createExpiredSession({ userId, ... })
createTestEntity({ moduleName, user, ... })
createTestCredential({ user, ... })
getTestModuleDefinitions()
```

## Example Usage

### Unit Test Pattern
```javascript
const { YourUseCase } = require('../../use-cases/your-use-case');
const { TestAuthorizationSessionRepository } = require('../helpers/auth-test-helpers');

describe('YourUseCase', () => {
    let useCase;
    let repository;

    beforeEach(() => {
        repository = new TestAuthorizationSessionRepository();
        useCase = new YourUseCase({ repository });
    });

    afterEach(() => {
        repository.clear();
    });

    it('should do something', async () => {
        const result = await useCase.execute('param');
        expect(result).toBeDefined();
    });
});
```

### Integration Test Pattern
```javascript
const { StartAuthorizationSessionUseCase } = require('../../use-cases/start-authorization-session');
const { ProcessAuthorizationStepUseCase } = require('../../use-cases/process-authorization-step');
const {
    TestAuthorizationSessionRepository,
    getTestModuleDefinitions,
} = require('../helpers/auth-test-helpers');

describe('Complete Flow Test', () => {
    let authSessionRepository;
    let startAuthSession;
    let processAuthStep;

    beforeEach(() => {
        authSessionRepository = new TestAuthorizationSessionRepository();
        startAuthSession = new StartAuthorizationSessionUseCase({
            authSessionRepository,
        });
        processAuthStep = new ProcessAuthorizationStepUseCase({
            authSessionRepository,
            moduleDefinitions: getTestModuleDefinitions(),
        });
    });

    it('should complete Nagaris OTP flow', async () => {
        const session = await startAuthSession.execute('user-123', 'nagaris', 2);
        
        // Step 1: Email
        const step1 = await processAuthStep.execute(
            session.sessionId,
            'user-123',
            1,
            { email: 'test@example.com' }
        );
        expect(step1.nextStep).toBe(2);
        
        // Step 2: OTP
        const step2 = await processAuthStep.execute(
            session.sessionId,
            'user-123',
            2,
            { email: 'test@example.com', otp: '123456' }
        );
        expect(step2.completed).toBe(true);
    });
});
```

## Key Test Scenarios

### Multi-Step Flows Tested
✅ 2-step OTP (email → OTP)
✅ 2-step OAuth + selection (OAuth → workspace)
✅ Single-step OAuth
✅ Session lifecycle (creation → steps → completion)
✅ Session expiration (15 min)
✅ Session restart from step 1
✅ User ownership enforcement
✅ Step sequence validation
✅ Data preservation between steps
✅ Error recovery and retry

### Edge Cases Covered
✅ Concurrent session creation
✅ Multiple sessions per user
✅ Multiple users simultaneously
✅ Large stepData objects
✅ Special characters in IDs
✅ Very large step counts
✅ Invalid/expired sessions

## Performance Targets

- Unit tests: < 100ms each
- Integration tests: < 1s each
- Total test suite: < 30s

## CI/CD Integration

Tests run automatically on:
- Pre-commit (via git hooks)
- Pull requests (via GitHub Actions)
- Pre-deployment (staging/production)

## Troubleshooting

**"Cannot find module" errors**
→ Run `npm install` in `/Users/sean/Documents/GitHub/frigg/packages/core`

**Timeout errors**
→ Add `jest.setTimeout(10000);` at top of test file

**Mock data issues**
→ Ensure `repository.clear()` in `afterEach` hooks

## Contributing

When adding tests:
1. Write tests BEFORE implementation (TDD)
2. Aim for >80% code coverage
3. Include both unit and integration tests
4. Document new patterns in this README
5. Use existing test helpers when possible

## Related Documentation

- [SPARC Methodology](https://github.com/ruvnet/claude-flow)
- [Frigg DDD Architecture](/Users/sean/Documents/GitHub/frigg/CLAUDE.md)
- [Multi-Step Auth Spec](/Users/sean/Documents/GitHub/frigg/docs/MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md)
