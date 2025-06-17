# VPC/KMS/SSM Testing Strategy

This document outlines the comprehensive testing strategy for the VPC, KMS, and SSM support features in the Frigg framework.

## Overview

The testing suite covers:
- **AWS Discovery utilities** with mocked AWS SDK calls
- **Build-time discovery** with various app definition scenarios
- **Serverless template generation** with VPC/KMS/SSM configurations
- **Frigg serverless plugin** hooks and discovery integration
- **End-to-end integration tests** for complete workflows
- **Error handling and fallback scenarios**

## Test Structure

```
packages/devtools/infrastructure/
├── __tests__/
│   ├── fixtures/
│   │   └── mock-aws-resources.js      # Mock AWS data and app definitions
│   └── helpers/
│       └── test-utils.js              # Test utility functions
├── aws-discovery.test.js              # Unit tests for AWSDiscovery class
├── build-time-discovery.test.js       # Unit tests for BuildTimeDiscovery class
├── serverless-template.test.js        # Unit tests for serverless template generation
├── integration.test.js                # End-to-end integration tests
└── README-TESTING.md                  # This file

packages/serverless-plugin/
└── index.test.js                      # Unit tests for Frigg serverless plugin
```

## Test Categories

### 1. Unit Tests

#### AWS Discovery (`aws-discovery.test.js`)
Tests the `AWSDiscovery` class methods:
- ✅ `getAccountId()` - STS caller identity retrieval
- ✅ `findDefaultVpc()` - Default VPC discovery with fallbacks
- ✅ `findPrivateSubnets()` - Private subnet identification
- ✅ `isSubnetPrivate()` - Route table analysis for subnet type
- ✅ `findDefaultSecurityGroup()` - Security group discovery (Frigg-specific then default)
- ✅ `findDefaultKmsKey()` - Customer-managed KMS key discovery
- ✅ `findPrivateRouteTable()` - Route table discovery for VPC endpoints
- ✅ `discoverResources()` - Complete resource discovery workflow

**Key Features Tested:**
- Mock AWS SDK v3 clients (EC2, KMS, STS)
- Error handling and fallback scenarios
- Single vs multiple subnet scenarios
- Customer vs AWS managed KMS keys

#### Build-Time Discovery (`build-time-discovery.test.js`)
Tests the `BuildTimeDiscovery` class:
- ✅ Resource discovery and configuration file generation
- ✅ Template variable replacement
- ✅ Serverless configuration processing
- ✅ Pre-build hook execution with app definitions
- ✅ Environment variable management
- ✅ Region-specific configuration

**Key Features Tested:**
- App definition parsing (VPC, KMS, SSM feature flags)
- Environment variable injection
- File I/O operations with mocked `fs`
- Error handling during discovery

#### Serverless Template (`serverless-template.test.js`)
Tests the `composeServerlessDefinition()` function:
- ✅ Basic serverless configuration generation
- ✅ VPC configuration (security groups, subnets, VPC endpoints)
- ✅ KMS configuration (IAM permissions, environment variables, plugins)
- ✅ SSM configuration (Lambda layers, IAM permissions)
- ✅ Integration-specific resources (functions, queues, workers)
- ✅ Combined feature configurations
- ✅ Edge cases and error scenarios

**Key Features Tested:**
- Conditional configuration based on app definition flags
- Environment variable referencing (`${env:AWS_DISCOVERY_*}`)
- Plugin management and ordering
- Default resource creation

#### Frigg Serverless Plugin (`packages/serverless-plugin/index.test.js`)
Tests the `FriggServerlessPlugin` class:
- ✅ Plugin initialization and hook registration
- ✅ AWS discovery triggering based on service configuration
- ✅ App definition creation from serverless service
- ✅ Environment variable injection during build
- ✅ Error handling with fallback values
- ✅ Offline mode queue creation (existing functionality)

**Key Features Tested:**
- Serverless framework hook integration
- Service configuration analysis
- BuildTimeDiscovery integration
- LocalStack queue creation for offline development

### 2. Integration Tests

#### End-to-End Workflow (`integration.test.js`)
Tests complete workflows:
- ✅ Full VPC + KMS + SSM configuration generation
- ✅ Individual feature testing (VPC-only, KMS-only, SSM-only)
- ✅ Plugin integration with discovery workflow
- ✅ Template variable resolution
- ✅ Error scenario handling
- ✅ Multi-region support

**Key Features Tested:**
- Complete discovery → configuration → deployment workflow
- Environment variable flow from discovery to serverless
- Plugin coordination with build-time discovery
- Realistic AWS resource scenarios

### 3. Test Fixtures and Utilities

#### Mock AWS Resources (`__tests__/fixtures/mock-aws-resources.js`)
Provides consistent test data:
- Mock VPC, subnets, security groups, route tables
- Mock KMS keys and metadata
- Mock STS caller identity
- Pre-defined app definitions for different scenarios
- Mock serverless service configurations
- Mock AWS SDK responses

#### Test Utilities (`__tests__/helpers/test-utils.js`)
Provides helper functions:
- Environment variable management
- Mock object creation (serverless, integrations, app definitions)
- Configuration verification functions
- Console output capture
- Async operation utilities

## Running Tests

### Prerequisites

Ensure you have the following installed:
- Node.js 18+ and npm
- Jest testing framework
- All project dependencies

### Running All Tests

```bash
# From the root of the Frigg project
npm test

# Run tests for specific packages
npm test --workspace=@friggframework/devtools
npm test --workspace=@friggframework/serverless-plugin
```

### Running Specific Test Suites

```bash
# AWS Discovery tests
npm test aws-discovery.test.js

# Build-time discovery tests
npm test build-time-discovery.test.js

# Serverless template tests
npm test serverless-template.test.js

# Plugin tests
npm test packages/serverless-plugin/index.test.js

# Integration tests
npm test integration.test.js
```

### Running Tests with Coverage

```bash
# Generate coverage report
npm test -- --coverage

# Coverage for specific files
npm test -- --coverage --collectCoverageFrom="**/infrastructure/**/*.js"
```

### Running Tests in Watch Mode

```bash
# Watch mode for development
npm test -- --watch

# Watch specific test files
npm test -- --watch aws-discovery.test.js
```

## Test Configuration

### Jest Configuration

Tests follow the existing Frigg Jest configuration:
- Timeout: 20,000ms for integration tests
- Test environment: Node.js
- Mock AWS SDK clients to avoid real AWS calls
- Environment variable isolation between tests

### Mock Strategy

**AWS SDK Mocking:**
- Mock AWS SDK v3 clients at the class level
- Use `jest.fn()` for consistent mock behavior
- Provide realistic response data matching AWS API schemas

**File System Mocking:**
- Mock `fs` operations for configuration file handling
- Test both success and error scenarios

**Environment Variable Isolation:**
- Save and restore original environment variables
- Clean up test environment variables after each test

## Testing Best Practices

### 1. Test Isolation
- Each test should be independent and not rely on previous test state
- Use `beforeEach` and `afterEach` to set up and clean up test state
- Mock external dependencies consistently

### 2. Error Scenario Testing
- Test AWS API failures and timeouts
- Test missing AWS resources
- Test invalid configuration scenarios
- Verify fallback mechanisms work correctly

### 3. Realistic Test Data
- Use realistic AWS resource IDs and ARNs
- Test with various AWS regions
- Test edge cases (single subnet, no customer KMS keys, etc.)

### 4. Integration Testing
- Test complete workflows from discovery to deployment
- Verify environment variable flow between components
- Test plugin coordination and timing

## Coverage Goals

### Current Coverage Targets
- **Unit Tests:** 95%+ line coverage for core functionality
- **Integration Tests:** 85%+ coverage for end-to-end workflows
- **Error Scenarios:** 90%+ coverage for error handling paths

### Critical Paths
Ensure 100% coverage for:
- AWS resource discovery logic
- App definition parsing
- Environment variable management
- Plugin hook execution
- Fallback value assignment

## Continuous Integration

### Pre-commit Hooks
- Run linting and type checking
- Execute fast unit tests
- Verify test file naming conventions

### CI Pipeline
- Run complete test suite on all pull requests
- Generate and upload coverage reports
- Test against multiple Node.js versions
- Verify tests in different AWS regions (if applicable)

## Debugging Tests

### Common Issues

**AWS SDK Mock Issues:**
```bash
# Verify mock setup
console.log('Mock called with:', mockEC2Send.mock.calls);
```

**Environment Variable Issues:**
```bash
# Check environment state
console.log('Current env:', process.env);
```

**Async Test Issues:**
```bash
# Ensure proper async handling
await expect(asyncFunction()).resolves.toEqual(expectedValue);
```

### Debug Commands

```bash
# Run single test with verbose output
npm test -- --verbose aws-discovery.test.js

# Run with console output
npm test -- --verbose --silent=false

# Debug specific test
npm test -- --testNamePattern="should discover all AWS resources"
```

## Contributing

When adding new VPC/KMS/SSM functionality:

1. **Add unit tests** for new functions/methods
2. **Update integration tests** to cover new workflows
3. **Add mock data** to fixtures for new AWS resources
4. **Update test utilities** if new helper functions are needed
5. **Document test coverage** for new features
6. **Verify CI pipeline** passes with new tests

### Test Naming Conventions

- Test files: `*.test.js`
- Test descriptions: Use clear, descriptive language
- Group related tests with `describe()` blocks
- Use `it()` for individual test cases

### Mock Data Guidelines

- Keep mock data realistic and consistent
- Use the fixtures file for shared test data
- Document any special mock scenarios
- Update mocks when AWS APIs change

This testing strategy ensures the VPC/KMS/SSM features are robust, reliable, and maintainable while following Frigg's existing testing patterns and conventions.