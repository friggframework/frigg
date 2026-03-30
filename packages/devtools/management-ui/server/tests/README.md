# Management UI Server Tests

## DDD/Hexagonal Architecture Test Suite

This test suite validates the Domain-Driven Design and Hexagonal Architecture implementation of the Frigg Management UI server.

## Running Tests

```bash
# Run all server tests with ES module support
export NODE_OPTIONS='--experimental-vm-modules'
npx jest

# Run specific test suites
npx jest tests/unit/domain              # Domain Layer tests
npx jest tests/unit/application         # Application Layer tests
npx jest tests/unit/infrastructure     # Infrastructure Layer tests
npx jest tests/unit/presentation       # Presentation Layer tests
npx jest tests/integration             # Integration tests

# Run with coverage
npx jest --coverage
```

## Test Architecture

### Domain Layer Tests (`tests/unit/domain/`)

Tests for **pure domain logic** - value objects, entities, and domain services.

#### Value Objects
- **ProjectId.test.js** ✅ (14/14 passing)
  - Deterministic ID generation from paths (SHA-256 first 8 chars)
  - Validation of ID format (8-char hex)
  - Edge cases (unicode, special chars, long paths)

#### Domain Services
- **GitService.test.js** ✅ (6/6 passing)
  - Git status formatting
  - Branch listing
  - Error handling

### Application Layer Tests (`tests/unit/application/`)

Tests for **business logic orchestration** using use cases.

#### Use Cases
- **InspectProjectUseCase.test.js** 🔧
  - Project inspection workflow
  - Integration counting
  - Business rule validation
  - Dependency injection verification

### Infrastructure Layer Tests (`tests/unit/infrastructure/`)

Tests for **data access and external system integration**.

#### Repositories
- **FileSystemProjectRepository.test.js** 🔧
  - File system operations
  - Project discovery
  - ID resolution
  - Error handling

### Presentation Layer Tests (`tests/unit/presentation/`)

Tests for **HTTP adapters** - routes and controllers.

#### Routes
- **projectRoutes.test.js** 🔧
  - RESTful endpoint validation
  - ProjectId validation at route level
  - HTTP status code mapping
  - Request/response transformation

### Integration Tests (`tests/integration/`)

Tests for **end-to-end DDD flows** through all layers.

#### Full Stack Flows
- **ddd-flow.test.js** 🔧
  - Route → Controller → Use Case → Repository flow
  - Domain validation propagation
  - Error handling across layers
  - Dependency injection verification

## Test Results Summary

### Passing Tests ✅
- **ProjectId Value Object**: 14/14 tests passing
- **GitService Domain Service**: 6/6 tests passing
- **StartProjectUseCase**: Previous tests passing
- **ProjectController**: Previous tests passing

### Test Coverage

```
Domain Layer:      20 tests (100% passing)
Application Layer: 10 tests (needs implementation fixes)
Infrastructure:    12 tests (needs API alignment)
Presentation:      20 tests (needs route implementation)
Integration:       10 tests (needs full stack wiring)
```

## DDD Principles Validated

### ✅ Dependency Direction
- Presentation → Application → Domain
- Infrastructure → Domain (implements interfaces)
- Never Domain → Infrastructure/Presentation

### ✅ Separation of Concerns
- **Routes**: HTTP only (status codes, headers, JSON)
- **Controllers**: Orchestration, calling use cases
- **Use Cases**: Business logic, calling repositories
- **Repositories**: Data access only (CRUD)

### ✅ Value Objects
- Immutable (ProjectId)
- Deterministic behavior
- Self-validating

### ✅ Dependency Injection
- Use cases receive repositories via constructor
- Controllers receive use cases via constructor
- No direct repository access from routes/controllers

## Known Issues & Next Steps

### 1. Repository Test Alignment
The FileSystemProjectRepository tests assume a different API than the actual implementation:
- Tests assume no constructor params
- Actual requires `{ projectPath }` in constructor
- Need to align tests with actual repository interface

### 2. Integration Test Wiring
Integration tests need:
- Proper container setup
- Mock file system configuration
- Environment variable management

### 3. Route Test Coverage
Need to complete tests for:
- All git operation endpoints
- IDE session management
- Frigg execution endpoints
- Error middleware

## Test Best Practices

### Unit Tests
1. **Mock all dependencies** - Use Jest mocks for file system, repositories, etc.
2. **Test one thing** - Each test validates one behavior
3. **Use descriptive names** - Test names explain what's being validated

### Integration Tests
1. **Test happy paths** - Verify full workflows work end-to-end
2. **Test error propagation** - Ensure errors bubble up correctly
3. **Verify data integrity** - Data transforms correctly through layers

### Example Test Structure

```javascript
describe('UseCase - Application Layer', () => {
  let useCase
  let mockRepository

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn()
    }
    useCase = new UseCase({ repository: mockRepository })
  })

  it('should orchestrate business logic correctly', async () => {
    mockRepository.findById.mockResolvedValue({ id: '123' })

    const result = await useCase.execute('123')

    expect(result).toBeDefined()
    expect(mockRepository.findById).toHaveBeenCalledWith('123')
  })
})
```

## Contributing

When adding new features:
1. Write tests following the DDD layer structure
2. Ensure dependency direction is correct
3. Mock external dependencies
4. Verify integration tests pass

## Resources

- [Jest Documentation](https://jestjs.io/)
- [DDD in Practice](https://docs.frigg.com/architecture/ddd)
- [Hexagonal Architecture](https://docs.frigg.com/architecture/hexagonal)
