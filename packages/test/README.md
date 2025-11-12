# @friggframework/test

Shared test infrastructure and utilities for the Frigg monorepo.

## Overview

This package provides:
- **TestMongo**: In-memory MongoDB server for integration tests
- **Authenticator**: OAuth2 browser automation for testing authentication flows
- **Jest preset**: Shared Jest configuration with test groups support
- **Global setup/teardown**: Test environment initialization
- **Environment utilities**: Safe environment variable management

## Installation

This package is already installed as a dev dependency in packages that need it:

```bash
npm install --save-dev @friggframework/test
```

## Usage

### Jest Configuration

Use the preset in your package's `jest.config.js`:

```javascript
module.exports = {
    preset: '@friggframework/test',

    // Override settings as needed
    coverageThreshold: {
        global: {
            statements: 80,
            branches: 70,
            functions: 80,
            lines: 80,
        },
    },
};
```

### Test Groups

Tests are organized using `jest-runner-groups`. Annotate your tests with groups:

```javascript
/**
 * @group unit
 * @group domain
 */
describe('MyFeature', () => {
    it('should work', () => {
        expect(true).toBe(true);
    });
});
```

**Available groups:**

**By test type:**
- `@group unit` - Fast, isolated tests with no external dependencies
- `@group integration` - Tests requiring MongoDB, external APIs, or other resources

**By architectural layer:**
- `@group domain` - Domain layer (business logic, entities, value objects)
- `@group application` - Application layer (use cases, integrations, orchestration)
- `@group infrastructure` - Infrastructure layer (database, encryption, logging, external services)

### Running Tests

```bash
# All tests
npm test

# Unit tests only (fast)
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode (unit tests)
npm run test:watch

# With coverage
npm run test:coverage
```

### TestMongo

For integration tests that need MongoDB:

```javascript
const { mongoose } = require('@friggframework/core');

/**
 * @group integration
 * @group infrastructure
 */
describe('Database Tests', () => {
    beforeAll(async () => {
        // MONGO_URI is set automatically by global setup
        await mongoose.connect(process.env.MONGO_URI);
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    beforeEach(async () => {
        // Clean up test data
        await MyModel.deleteMany({});
    });

    it('should save to database', async () => {
        const doc = await MyModel.create({ name: 'test' });
        expect(doc._id).toBeDefined();
    });
});
```

### Environment Variables

```javascript
const { overrideEnvironment, restoreEnvironment } = require('@friggframework/test');

describe('Environment Tests', () => {
    afterEach(() => {
        restoreEnvironment();
    });

    it('should use test environment', () => {
        overrideEnvironment({ NODE_ENV: 'test', API_KEY: 'test-key' });
        expect(process.env.NODE_ENV).toBe('test');
    });
});
```

## MongoDB Memory Server Setup

### Configuration

The package uses `mongodb-memory-server` for in-memory MongoDB. Configuration is in `/.mongod-memory-server.json`:

```json
{
  "version": "7.0.14",
  "downloadDir": "./.mongodb-binaries",
  "arch": "x64",
  "platform": "linux"
}
```

### Troubleshooting MongoDB Download Issues

If you encounter MongoDB download errors:

**Option 1: Specify a compatible version**

Edit `.mongod-memory-server.json`:
```json
{
  "version": "6.0.9",
  "downloadDir": "./node_modules/.cache/mongodb-binaries"
}
```

**Option 2: Use system MongoDB**

Install MongoDB locally and configure:
```json
{
  "systemBinary": "/usr/bin/mongod"
}
```

**Option 3: Skip MongoDB for unit tests**

Run only unit tests (which don't require MongoDB):
```bash
npm run test:unit
```

## Best Practices

### Test Structure (AAA Pattern)

```javascript
describe('Feature', () => {
    describe('specific behavior', () => {
        it('should do X when Y', () => {
            // Arrange - Set up test data
            const input = { key: 'value' };

            // Act - Execute code under test
            const result = doSomething(input);

            // Assert - Verify results
            expect(result).toEqual(expectedOutput);
        });
    });
});
```

### Coverage Expectations

- **Domain layer**: >80% (pure business logic)
- **Application layer**: >60% (orchestration, integration)
- **Infrastructure layer**: >40% (external dependencies)

### Test Speed

- **Unit tests**: <100ms each
- **Integration tests**: <5s each
- Keep tests isolated and parallelizable

## License

MIT
