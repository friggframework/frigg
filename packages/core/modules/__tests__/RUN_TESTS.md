# Quick Start - Running Multi-Step Authorization Tests

## Prerequisites

```bash
cd /Users/sean/Documents/GitHub/frigg/packages/core
npm install
```

## Run All Tests

```bash
# Run complete test suite
npm test modules/__tests__

# Expected output:
# PASS  modules/__tests__/unit/domain/authorization-session.test.js
# PASS  modules/__tests__/unit/use-cases/start-authorization-session.test.js
# PASS  modules/__tests__/unit/use-cases/process-authorization-step.test.js
# PASS  modules/__tests__/unit/use-cases/get-authorization-requirements.test.js
# PASS  modules/__tests__/integration/multi-step-auth.test.js
#
# Test Suites: 5 passed, 5 total
# Tests:       85+ passed, 85+ total
```

## Run Specific Test Suites

### Unit Tests Only
```bash
npm test modules/__tests__/unit
```

### Integration Tests Only
```bash
npm test modules/__tests__/integration
```

### Single File
```bash
# Test session creation
npm test modules/__tests__/unit/use-cases/start-authorization-session.test.js

# Test step processing
npm test modules/__tests__/unit/use-cases/process-authorization-step.test.js

# Test complete flows
npm test modules/__tests__/integration/multi-step-auth.test.js
```

## Development Mode

### Watch Mode
```bash
# Auto-run tests on file changes
npm test -- --watch modules/__tests__
```

### Coverage Report
```bash
# Generate coverage report
npm test -- --coverage modules/__tests__

# View detailed HTML report
open coverage/lcov-report/index.html
```

### Verbose Output
```bash
# See all test names and results
npm test -- --verbose modules/__tests__
```

## Expected Test Results

### Domain Entity Tests (25+ tests)
```
✓ should create a valid session with all required fields
✓ should use default values for optional fields
✓ should throw error when sessionId is missing
✓ should advance to next step
✓ should merge new step data with existing data
✓ should mark session as completed
✓ should return false for non-expired session
✓ should handle single-step sessions
... and 17 more
```

### Use Case Tests (45+ tests)
```
StartAuthorizationSessionUseCase (20+ tests)
  ✓ should create a new authorization session
  ✓ should generate unique session IDs
  ✓ should set expiration to 15 minutes
  ... and 17 more

ProcessAuthorizationStepUseCase (15+ tests)
  ✓ should process step 1 and return next step
  ✓ should advance session step after processing
  ✓ should complete flow on final step
  ... and 12 more

GetAuthorizationRequirementsUseCase (10+ tests)
  ✓ should return requirements for step 1
  ✓ should detect multi-step modules
  ... and 8 more
```

### Integration Tests (15+ tests)
```
Multi-Step Authorization Flow - Integration
  Nagaris 2-Step OTP Flow
    ✓ should complete full OTP authentication flow
    ✓ should preserve data between steps
    ✓ should reject invalid OTP
  
  HubSpot Single-Step OAuth Flow
    ✓ should complete single-step OAuth flow
  
  Slack 2-Step OAuth + Selection Flow
    ✓ should complete OAuth followed by workspace selection
  
  Session Management
    ✓ should allow restarting from step 1
    ✓ should expire sessions after timeout
    ✓ should enforce user ownership
    ✓ should prevent skipping steps
  
  ... and 6 more
```

## Troubleshooting

### "Cannot find module" Errors

Make sure dependencies are installed:
```bash
cd /Users/sean/Documents/GitHub/frigg/packages/core
npm install
```

### Test Timeouts

Some integration tests may need more time:
```bash
# Increase timeout (default is 5s)
npm test -- --testTimeout=10000 modules/__tests__
```

### Clear Jest Cache

If tests behave unexpectedly:
```bash
npm test -- --clearCache
npm test modules/__tests__
```

### Debug Specific Test

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest modules/__tests__/unit/use-cases/start-authorization-session.test.js
```

## Test File Locations

```
modules/__tests__/
├── helpers/
│   └── auth-test-helpers.js              ← Shared test utilities
├── unit/
│   ├── domain/
│   │   └── authorization-session.test.js  ← Domain entity tests
│   └── use-cases/
│       ├── start-authorization-session.test.js
│       ├── process-authorization-step.test.js
│       └── get-authorization-requirements.test.js
├── integration/
│   └── multi-step-auth.test.js           ← End-to-end flow tests
├── README.md                              ← Full documentation
├── IMPLEMENTATION_SUMMARY.md              ← Summary of what was built
└── RUN_TESTS.md                          ← This file
```

## Next Steps

After running tests successfully:

1. **Review test coverage**:
   ```bash
   npm test -- --coverage modules/__tests__
   ```

2. **Add missing tests** (see TODO in IMPLEMENTATION_SUMMARY.md):
   - ReauthorizeEntity use case
   - Credential management integration
   - Entity re-authentication integration

3. **Run in CI/CD**:
   - Add to GitHub Actions workflow
   - Add to pre-commit hooks
   - Add to deployment pipeline

## Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm test modules/__tests__` | Run all tests |
| `npm test modules/__tests__/unit` | Unit tests only |
| `npm test modules/__tests__/integration` | Integration tests only |
| `npm test -- --watch modules/__tests__` | Watch mode |
| `npm test -- --coverage modules/__tests__` | Coverage report |
| `npm test -- --verbose modules/__tests__` | Verbose output |
| `npm test -- --clearCache` | Clear Jest cache |

## Additional Resources

- [Full Test Documentation](./README.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Test Helpers Guide](./helpers/auth-test-helpers.js)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

---

**Happy Testing!** 🧪
