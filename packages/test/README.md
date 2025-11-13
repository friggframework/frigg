# @friggframework/test

Shared testing infrastructure for the Frigg Framework following DDD and Hexagonal Architecture patterns.

## Overview

This package provides:
- **Shared Jest configuration** via preset
- **Test utilities** for common testing operations
- **Mock factories** for creating standardized mocks
- **Prisma test helpers** for testing database operations
- **MongoDB Memory Server** setup for integration tests
- **Test organization patterns** following architectural layers

## Installation

```bash
npm install --save-dev @friggframework/test
```

## Quick Start

### 1. Configure Jest

In your package's `jest.config.js`:

```javascript
module.exports = {
    preset: '@friggframework/test',

    // Optional: override settings
    coverageThreshold: {
        global: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
        },
    },
};
```

### 2. Add Test Scripts

In your package's `package.json`:

```json
{
    "scripts": {
        "test": "jest",
        "test:unit": "jest --group=unit",
        "test:integration": "TEST_TYPE=integration jest --group=integration",
        "test:watch": "jest --watch --group=unit",
        "test:coverage": "jest --coverage"
    }
}
```

### 3. Write Tests

```javascript
const { MockFactory, createMockPrismaClient } = require('@friggframework/test');

/**
 * @group unit
 * @group application
 */
describe('CheckDatabaseHealthUseCase', () => {
    let useCase;
    let mockRepository;

    beforeEach(() => {
        mockRepository = MockFactory.createRepository({
            getDatabaseConnectionState: jest.fn(),
            pingDatabase: jest.fn(),
        });

        useCase = new CheckDatabaseHealthUseCase({
            healthCheckRepository: mockRepository
        });
    });

    it('should return healthy status when database is connected', async () => {
        mockRepository.getDatabaseConnectionState.mockResolvedValue({
            isConnected: true,
            stateName: 'connected',
        });
        mockRepository.pingDatabase.mockResolvedValue(5);

        const result = await useCase.execute();

        expect(result.status).toBe('healthy');
        expect(result.state).toBe('connected');
        expect(result.responseTime).toBe(5);
    });
});
```

## Test Organization

### Test Groups

All tests must be annotated with `@group` tags for organization:

#### Test Type Groups
- `@group unit` - Isolated tests with mocked dependencies
- `@group integration` - End-to-end tests with real dependencies

#### Architecture Layer Groups
- `@group domain` - Pure business logic (entities, errors, value objects)
- `@group application` - Use cases and orchestration logic
- `@group infrastructure` - External systems (repositories, adapters, APIs)

### Example Annotations

```javascript
/**
 * @group unit
 * @group domain
 */
describe('ValidationError', () => {
    // Tests for domain error class
});

/**
 * @group unit
 * @group application
 */
describe('CreateUserUseCase', () => {
    // Tests for application use case
});

/**
 * @group unit
 * @group infrastructure
 */
describe('UserRepository', () => {
    // Tests for infrastructure repository
});

/**
 * @group integration
 * @group infrastructure
 */
describe('Database Encryption Integration', () => {
    // End-to-end encryption tests
});
```

### Running Tests by Group

```bash
# Run all unit tests
npm run test:unit

# Run all integration tests
npm run test:integration

# Run application layer tests only
npm test -- --group=application

# Run infrastructure layer tests only
npm test -- --group=infrastructure

# Combine groups
npm test -- --group=unit --group=application
```

## Shared Test Utilities

### MockFactory

Centralized factory for creating standardized mocks:

```javascript
const { MockFactory } = require('@friggframework/test');

// Create a mock logger
const logger = MockFactory.createLogger();

// Create a mock Cryptor
const cryptor = MockFactory.createCryptor({ shouldSucceed: true });

// Create mock Express middleware environment
const { req, res, next } = MockFactory.createMiddlewareEnvironment({
    req: { method: 'GET', url: '/api/test' }
});

// Create a complete mock environment
const env = MockFactory.createMockEnvironment({
    logger: true,
    cryptor: true,
    prismaClient: true,
});
```

### Prisma Test Utilities

Helpers for testing Prisma-based repositories:

```javascript
const {
    createMockPrismaClient,
    createMockMongoDBClient,
    createMockPostgreSQLClient,
    setupPrismaTest,
    createRepositoryTestEnvironment,
} = require('@friggframework/test');

// Create a basic mock Prisma client
const mockClient = createMockPrismaClient({
    user: {
        findUnique: jest.fn().mockResolvedValue({ id: '123', name: 'Test' }),
    },
});

// Create a MongoDB-specific client
const mongoClient = createMockMongoDBClient();

// Setup complete test environment
const { client, resetMocks } = setupPrismaTest({
    clientOverrides: {
        $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
    },
});

// Create repository test environment with automatic setup/teardown
const { setup, teardown } = createRepositoryTestEnvironment({
    RepositoryClass: HealthCheckRepository,
});

describe('HealthCheckRepository', () => {
    let env, mockClient, repository;

    beforeEach(() => {
        ({ env, mockClient, repository } = setup());
    });

    afterEach(() => {
        teardown(env);
    });

    it('should check database health', async () => {
        // Test implementation
    });
});
```

### General Test Utilities

```javascript
const {
    setTestEnvironmentVariables,
    restoreEnvironmentVariables,
    cleanupTestEnvironment,
    delay,
    waitForCondition,
    createTestContext,
} = require('@friggframework/test');

// Manage environment variables
describe('Config Tests', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = setTestEnvironmentVariables({
            DATABASE_URL: 'mongodb://test',
            STAGE: 'test',
        });
    });

    afterEach(() => {
        restoreEnvironmentVariables(originalEnv);
    });
});

// Create test context for organizing data and cleanups
describe('Complex Test Suite', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
        context.data.userId = '123';
        context.addCleanup(async () => {
            // Cleanup logic
        });
    });

    afterEach(async () => {
        await context.cleanup();
    });
});
```

## MongoDB Memory Server

### Automatic Setup

The MongoDB Memory Server is automatically managed:
- **Unit tests**: MongoDB is **NOT** started (tests use mocks)
- **Integration tests**: MongoDB **IS** started automatically

### Running Integration Tests

```bash
# Set TEST_TYPE to start MongoDB
TEST_TYPE=integration npm test

# Or use the integration test script
npm run test:integration

# Or use group flag
npm test -- --group=integration
```

### Manual Control

```javascript
// In specific test files that need MongoDB
process.env.REQUIRE_MONGODB = 'true';

// Or check if MongoDB is available
if (global.testMongo) {
    const uri = global.testMongo.getUri();
    // Connect to MongoDB
}
```

## Best Practices

### 1. Test Isolation

✅ **DO**: Mock all external dependencies in unit tests
```javascript
const mockRepository = {
    findUser: jest.fn().mockResolvedValue({ id: '123' }),
};
```

❌ **DON'T**: Access real databases or APIs in unit tests
```javascript
const repository = new UserRepository({ connectionString: 'mongodb://...' });
```

### 2. Test Organization

✅ **DO**: Organize tests by architecture layer
```
__tests__/
├── unit/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
└── integration/
```

❌ **DON'T**: Mix unit and integration tests in the same file

### 3. Mock Reusability

✅ **DO**: Use MockFactory for consistent mocks
```javascript
const logger = MockFactory.createLogger();
```

❌ **DON'T**: Create ad-hoc mocks everywhere
```javascript
const logger = { info: jest.fn(), error: jest.fn() };
```

### 4. Test Naming

✅ **DO**: Use descriptive test names
```javascript
it('should return healthy status when database connection succeeds', () => {});
```

❌ **DON'T**: Use vague test names
```javascript
it('works', () => {});
```

### 5. Async Testing

✅ **DO**: Always use async/await for async operations
```javascript
it('should create user', async () => {
    const result = await useCase.execute();
    expect(result).toBeDefined();
});
```

❌ **DON'T**: Forget to handle promises
```javascript
it('should create user', () => {
    useCase.execute(); // Missing await!
    expect(result).toBeDefined();
});
```

## Configuration Reference

### Jest Preset Defaults

```javascript
{
    testEnvironment: 'node',
    runner: 'groups',
    testTimeout: 20_000,
    collectCoverage: false,
    coverageReporters: ['text', 'lcov', 'html'],
    testMatch: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
}
```

### Overriding Preset

```javascript
// jest.config.js
module.exports = {
    preset: '@friggframework/test',

    // Override specific settings
    testTimeout: 30_000,
    verbose: true,

    // Add additional configuration
    setupFilesAfterEnv: ['./jest.setup.js'],
};
```

## Troubleshooting

### MongoDB Download Issues

If MongoDB Memory Server fails to download:

```bash
# Skip MongoDB for unit tests
npm run test:unit

# Or set environment variable
SKIP_MONGODB=true npm test
```

### Test Timeouts

Increase timeout for specific tests:

```javascript
it('should handle long operation', async () => {
    // Test code
}, 30000); // 30 second timeout
```

Or globally in jest.config.js:

```javascript
module.exports = {
    preset: '@friggframework/test',
    testTimeout: 30_000,
};
```

### Mock Cleanup Issues

Ensure mocks are cleaned between tests:

```javascript
afterEach(() => {
    jest.clearAllMocks();
});
```

## Contributing

When adding new shared test utilities:

1. Add to appropriate file in `mocks/` or `helpers/`
2. Export from `index.js`
3. Add documentation to this README
4. Add tests for the utility itself

## See Also

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [jest-runner-groups](https://github.com/eugene-kamenev/jest-runner-groups)
- [Frigg Framework Documentation](https://docs.friggframework.org)
