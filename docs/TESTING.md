# Testing Guide

## Overview

Frigg follows Test-Driven Development (TDD), Domain-Driven Design (DDD), and Hexagonal Architecture principles. This guide explains our testing approach, tools, and best practices.

## Test Philosophy

### TDD (Test-Driven Development)
- Write tests before implementation
- Red → Green → Refactor cycle
- Tests drive the design

### DDD (Domain-Driven Design)
- Tests organized by domain concepts
- Focus on business logic and ubiquitous language
- Separate domain tests from infrastructure tests

### Hexagonal Architecture
- **Domain layer**: Pure business logic, no dependencies
- **Application layer**: Use cases and orchestration
- **Infrastructure layer**: External systems and technical concerns

## Test Organization

### Test Types

**Unit Tests** (`@group unit`)
- Fast (<100ms per test)
- No external dependencies
- Mock/stub all I/O
- Focus on single unit of code
- Run in every commit

**Integration Tests** (`@group integration`)
- Test component interactions
- May use MongoDB, APIs, file system
- Slower (<5s per test)
- Run before merges

### Architectural Layers

**Domain Layer** (`@group domain`)
```
packages/core/assertions/
packages/core/errors/
packages/core/types/
```
- Pure business logic
- No framework dependencies
- Target: >80% coverage

**Application Layer** (`@group application`)
```
packages/core/integrations/
packages/core/module-plugin/
packages/core/syncs/
```
- Orchestrates domain objects
- Implements use cases
- Target: >60% coverage

**Infrastructure Layer** (`@group infrastructure`)
```
packages/core/database/
packages/core/encrypt/
packages/core/logs/
packages/core/lambda/
```
- Technical implementation details
- External system integrations
- Target: >40% coverage

## File Organization

### Recommended Structure

```
packages/core/
├── domain/
│   ├── entities/
│   │   ├── User.js
│   │   └── __tests__/
│   │       └── User.test.js
│   └── value-objects/
│       ├── Email.js
│       └── __tests__/
│           └── Email.test.js
├── application/
│   ├── use-cases/
│   │   ├── CreateUser.js
│   │   └── __tests__/
│   │       └── CreateUser.test.js
└── infrastructure/
    ├── repositories/
    │   ├── UserRepository.js
    │   └── __tests__/
    │       └── UserRepository.test.js
```

### Alternative (Co-located Tests)
```
packages/core/
├── assertions/
│   ├── get.js
│   └── get.test.js
```

Both approaches are acceptable. Use `__tests__/` directories for larger modules, co-located tests for smaller ones.

## Writing Tests

### Test Anatomy (AAA Pattern)

```javascript
/**
 * @group unit
 * @group domain
 */
describe('Email Value Object', () => {
    describe('validation', () => {
        it('should accept valid email addresses', () => {
            // Arrange
            const validEmail = 'user@example.com';

            // Act
            const email = new Email(validEmail);

            // Assert
            expect(email.value).toBe(validEmail);
        });

        it('should reject invalid email addresses', () => {
            // Arrange
            const invalidEmail = 'not-an-email';

            // Act & Assert
            expect(() => new Email(invalidEmail)).toThrow('Invalid email');
        });
    });
});
```

### Test Groups

Always annotate tests with appropriate groups:

```javascript
/**
 * @group unit
 * @group domain
 */
describe('Domain Tests', () => {
    // Pure business logic tests
});

/**
 * @group integration
 * @group application
 */
describe('Use Case Tests', () => {
    // Tests requiring MongoDB or external services
});

/**
 * @group integration
 * @group infrastructure
 */
describe('Repository Tests', () => {
    // Database integration tests
});
```

### Test Naming

Use descriptive names that explain behavior:

✅ Good:
```javascript
it('should create user when email is unique', () => {});
it('should throw error when email already exists', () => {});
it('should hash password before saving', () => {});
```

❌ Bad:
```javascript
it('test user creation', () => {});
it('should work', () => {});
it('test #1', () => {});
```

## Running Tests

### Command Reference

```bash
# All tests in monorepo
npm test

# All tests with coverage
npm run test:coverage

# Unit tests only (fast, no external dependencies)
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode (unit tests, useful for TDD)
npm run test:watch

# Specific package
cd packages/core && npm test

# CI mode (unit tests only, with coverage, limited workers)
npm run test:ci
```

### From Package Directories

```bash
cd packages/core

# Run all tests in this package
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Test Infrastructure

### MongoDB (Integration Tests)

Integration tests automatically get access to an in-memory MongoDB instance:

```javascript
const { mongoose } = require('@friggframework/core');

/**
 * @group integration
 * @group infrastructure
 */
describe('UserRepository', () => {
    beforeAll(async () => {
        // MONGO_URI is provided by test setup
        await mongoose.connect(process.env.MONGO_URI);
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    beforeEach(async () => {
        // Clean up between tests
        await User.deleteMany({});
    });

    it('should save user to database', async () => {
        const user = await User.create({
            email: 'test@example.com',
            name: 'Test User'
        });

        expect(user._id).toBeDefined();
        expect(user.email).toBe('test@example.com');
    });
});
```

### Mocking

**Unit tests should mock external dependencies:**

```javascript
const sinon = require('sinon');
const { EmailService } = require('./EmailService');

/**
 * @group unit
 * @group application
 */
describe('UserRegistration', () => {
    let emailServiceMock;

    beforeEach(() => {
        emailServiceMock = sinon.createStubInstance(EmailService);
    });

    it('should send welcome email when user registers', async () => {
        // Arrange
        emailServiceMock.send.resolves(true);
        const userService = new UserService(emailServiceMock);

        // Act
        await userService.register({ email: 'new@example.com' });

        // Assert
        expect(emailServiceMock.send.calledOnce).toBe(true);
        expect(emailServiceMock.send.firstCall.args[0]).toMatchObject({
            to: 'new@example.com',
            template: 'welcome'
        });
    });
});
```

### Test Data Factories

Create reusable test data factories:

```javascript
// test/factories/user.factory.js
function createTestUser(overrides = {}) {
    return {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        role: 'user',
        ...overrides
    };
}

module.exports = { createTestUser };
```

Usage:
```javascript
const { createTestUser } = require('../test/factories/user.factory');

it('should validate admin users', () => {
    const admin = createTestUser({ role: 'admin' });
    expect(isAdmin(admin)).toBe(true);
});
```

## Coverage

### Current Thresholds

```javascript
// packages/core/jest.config.js
coverageThreshold: {
    global: {
        statements: 20,  // Gradually increase
        branches: 15,
        functions: 20,
        lines: 20,
    },
}
```

### Target Thresholds (by layer)

- **Domain**: 80%+ (critical business logic)
- **Application**: 60%+ (use cases and orchestration)
- **Infrastructure**: 40%+ (external integrations)

### Running Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML coverage report
open coverage/lcov-report/index.html

# CI coverage (unit tests only)
npm run test:ci
```

### Coverage Best Practices

- Focus on critical paths first
- Don't chase 100% - focus on valuable tests
- Ignore generated code, types, simple exports
- Use coverage to find untested edge cases
- Increase thresholds gradually as coverage improves

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Every pull request
- Every push to `main` or `next`
- Before releases

```yaml
# .github/workflows/frigg-ci.js.yml
- name: Run Unit Tests
  run: npm run test:ci
  timeout-minutes: 5

- name: Run Integration Tests
  run: npm run test:integration
  timeout-minutes: 10
```

### Pre-commit Hooks

Consider adding pre-commit hooks:

```bash
# .husky/pre-commit
npm run test:unit
```

## Troubleshooting

### MongoDB Download Failures

See [packages/test/README.md](../packages/test/README.md#troubleshooting-mongodb-download-issues) for MongoDB configuration options.

Quick fixes:
```bash
# Run unit tests only (no MongoDB needed)
npm run test:unit

# Configure MongoDB version
# Edit .mongod-memory-server.json
{
  "version": "7.0.14"
}
```

### Test Timeouts

If tests are timing out:

1. Check for missing `await` in async tests
2. Ensure proper cleanup in `afterEach`/`afterAll`
3. Increase timeout for slow tests:

```javascript
it('slow operation', async () => {
    // ... test code
}, 30000); // 30 second timeout
```

### Hanging Tests

Common causes:
- Unclosed database connections
- Missing `done()` callback
- Event listeners not cleaned up
- Timers not cleared

```javascript
afterAll(async () => {
    await mongoose.disconnect();  // ✅ Close connections
    clearInterval(myInterval);     // ✅ Clear timers
    removeAllListeners();          // ✅ Clean up listeners
});
```

### Flaky Tests

To identify flaky tests:

```bash
# Run tests multiple times
for i in {1..10}; do npm run test:unit || break; done
```

Common fixes:
- Add proper `beforeEach`/`afterEach` cleanup
- Avoid timing dependencies
- Use deterministic test data
- Don't rely on test execution order

## Best Practices

### Do's ✅

- **Write tests first** (TDD)
- **Keep tests simple** - one concept per test
- **Use descriptive names** - test names are documentation
- **Isolate tests** - each test should run independently
- **Clean up** - always restore state in `afterEach`
- **Test behavior, not implementation** - test what it does, not how
- **Use AAA pattern** - Arrange, Act, Assert
- **Mock external dependencies** in unit tests
- **Group tests logically** - use nested `describe` blocks

### Don'ts ❌

- **Don't test framework code** - focus on your logic
- **Don't mock what you don't own** in integration tests
- **Don't share state** between tests
- **Don't use random data** - makes debugging hard
- **Don't skip cleanup** - causes test pollution
- **Don't test private methods** directly - test through public API
- **Don't over-mock** - integration tests should use real dependencies
- **Don't ignore failing tests** - fix or remove them

## Examples

### Unit Test Example (Domain Layer)

```javascript
/**
 * @group unit
 * @group domain
 */
describe('Email Value Object', () => {
    describe('constructor', () => {
        it('should create email with valid address', () => {
            const email = new Email('user@example.com');
            expect(email.value).toBe('user@example.com');
        });

        it('should normalize email to lowercase', () => {
            const email = new Email('User@Example.COM');
            expect(email.value).toBe('user@example.com');
        });

        it('should throw on invalid email', () => {
            expect(() => new Email('invalid')).toThrow(ValidationError);
        });
    });

    describe('equals', () => {
        it('should return true for identical emails', () => {
            const email1 = new Email('test@example.com');
            const email2 = new Email('test@example.com');
            expect(email1.equals(email2)).toBe(true);
        });
    });
});
```

### Integration Test Example (Application Layer)

```javascript
const { mongoose } = require('@friggframework/core');
const { UserService } = require('./UserService');

/**
 * @group integration
 * @group application
 */
describe('UserService', () => {
    let userService;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        userService = new UserService();
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    beforeEach(async () => {
        await User.deleteMany({});
    });

    describe('register', () => {
        it('should create user and send welcome email', async () => {
            const userData = {
                email: 'new@example.com',
                name: 'New User',
                password: 'password123'
            };

            const user = await userService.register(userData);

            expect(user._id).toBeDefined();
            expect(user.email).toBe('new@example.com');
            expect(user.password).not.toBe('password123'); // Should be hashed
        });

        it('should reject duplicate email', async () => {
            await User.create({ email: 'existing@example.com' });

            await expect(
                userService.register({ email: 'existing@example.com' })
            ).rejects.toThrow('Email already exists');
        });
    });
});
```

## Contributing

When adding new code:

1. **Write tests first** (TDD)
2. **Run tests locally** before committing
3. **Ensure coverage** doesn't decrease
4. **Add appropriate groups** to new tests
5. **Update documentation** if adding test utilities

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Sinon Documentation](https://sinonjs.org/)
- [Testing Best Practices](https://testingjavascript.com/)
- [@friggframework/test README](../packages/test/README.md)

## Questions?

If you have questions about testing:
1. Check this guide and the [@friggframework/test README](../packages/test/README.md)
2. Look at existing tests for examples
3. Ask in team chat or open a discussion
