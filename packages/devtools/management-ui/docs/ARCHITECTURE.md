# DDD/Hexagonal Architecture Implementation

This document describes the Domain-Driven Design (DDD) and Hexagonal Architecture implementation for the Frigg Management UI frontend.

## Architecture Overview

The frontend has been refactored to follow Clean Architecture principles with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Components    │  │      Pages      │  │     Hooks       │ │
│  │                 │  │                 │  │                 │ │
│  │ - Dashboard     │  │ - Build         │  │ - useFrigg      │ │
│  │ - Cards         │  │ - Live          │  │ - useSocket     │ │
│  │ - Buttons       │  │ - Settings      │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Application Layer                         │
│  ┌─────────────────┐                    ┌─────────────────┐    │
│  │   Use Cases     │                    │    Services     │    │
│  │                 │                    │                 │    │
│  │ - ListIntegr... │◄──────────────────►│ - Integration   │    │
│  │ - InstallIntg.. │                    │ - Project       │    │
│  │ - StartProject  │                    │ - User          │    │
│  │ - StopProject   │                    │ - Environment   │    │
│  └─────────────────┘                    └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Domain Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    Entities     │  │  Value Objects  │  │  Interfaces     │ │
│  │                 │  │                 │  │    (Ports)      │ │
│  │ - Integration   │  │ - Status        │  │ - Repository    │ │
│  │ - Project       │  │ - ServiceStatus │  │ - SocketService │ │
│  │ - User          │  │                 │  │                 │ │
│  │ - Environment   │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Infrastructure Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    Adapters     │  │   API Client    │  │   Repositories  │ │
│  │   (Concrete     │  │                 │  │  (Implements    │ │
│  │ Implementations)│  │ - HTTP Client   │  │   Interfaces)   │ │
│  │                 │  │ - WebSocket     │  │                 │ │
│  │ - IntegrationR..│  │                 │  │ - Integration   │ │
│  │ - ProjectRepo.. │  │                 │  │ - Project       │ │
│  │ - UserRepo..    │  │                 │  │ - User          │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
src/
├── domain/                    # Domain Layer - Core Business Logic
│   ├── entities/             # Business entities with behavior
│   │   ├── Integration.js
│   │   ├── APIModule.js
│   │   ├── Project.js
│   │   ├── User.js
│   │   └── Environment.js
│   ├── value-objects/        # Immutable objects representing concepts
│   │   ├── IntegrationStatus.js
│   │   └── ServiceStatus.js
│   └── interfaces/           # Ports (contracts for external dependencies)
│       ├── IntegrationRepository.js
│       ├── ProjectRepository.js
│       ├── UserRepository.js
│       ├── EnvironmentRepository.js
│       ├── SessionRepository.js
│       └── SocketService.js
├── application/              # Application Layer - Orchestration
│   ├── use-cases/           # Single-purpose business operations
│   │   ├── ListIntegrationsUseCase.js
│   │   ├── InstallIntegrationUseCase.js
│   │   ├── GetProjectStatusUseCase.js
│   │   ├── StartProjectUseCase.js
│   │   ├── StopProjectUseCase.js
│   │   └── SwitchRepositoryUseCase.js
│   └── services/            # Application services (business facades)
│       ├── IntegrationService.js
│       ├── ProjectService.js
│       ├── UserService.js
│       └── EnvironmentService.js
├── infrastructure/          # Infrastructure Layer - External concerns
│   ├── adapters/           # Concrete implementations of domain interfaces
│   │   ├── IntegrationRepositoryAdapter.js
│   │   ├── ProjectRepositoryAdapter.js
│   │   ├── UserRepositoryAdapter.js
│   │   ├── EnvironmentRepositoryAdapter.js
│   │   ├── SessionRepositoryAdapter.js
│   │   └── SocketServiceAdapter.js
│   ├── api/               # API-specific logic
│   └── repositories/      # Data access implementations
├── presentation/           # Presentation Layer - UI Components
│   ├── components/        # React components (moved from /components)
│   ├── pages/            # Page components (moved from /pages)
│   └── hooks/            # React hooks (presentation-specific)
│       └── useFrigg.jsx  # Refactored to use application services
├── container.js          # Dependency Injection Container
├── index.js             # Main exports
└── services/            # Legacy API client (being phased out)
```

## Key Principles Implemented

### 1. **Dependency Inversion**
- High-level modules (domain) don't depend on low-level modules (infrastructure)
- Both depend on abstractions (interfaces/ports)
- Concrete implementations are injected via the container

### 2. **Single Responsibility**
- Each class/module has one reason to change
- Use cases handle single business operations
- Services orchestrate multiple use cases
- Entities contain business logic and rules

### 3. **Separation of Concerns**
- **Domain**: Pure business logic, no framework dependencies
- **Application**: Orchestration, no UI or infrastructure concerns
- **Infrastructure**: External concerns (API, database, etc.)
- **Presentation**: UI logic only, delegates business operations

### 4. **Open/Closed Principle**
- Domain interfaces allow easy extension
- New implementations can be added without changing existing code
- Use cases can be composed differently without modification

## Usage Examples

### Using the Container

```javascript
import container, { getIntegrationService, getProjectService } from './container.js'

// Get services via convenience functions
const integrationService = getIntegrationService()
const projectService = getProjectService()

// Or resolve directly from container
const userService = container.resolve('userService')
```

### Working with Domain Entities

```javascript
import { Integration, IntegrationStatus } from './domain/entities/Integration.js'

// Create an integration with business rules
const integration = new Integration({
  name: 'salesforce',
  displayName: 'Salesforce',
  type: 'oauth2',
  status: 'active'
})

// Business methods
if (integration.isActive()) {
  console.log('Integration is ready to use')
}

// Update with validation
integration.updateStatus(IntegrationStatus.STATUSES.ERROR) // Validates status
```

### Using Application Services

```javascript
import { getIntegrationService } from './container.js'

const integrationService = getIntegrationService()

// Install integration (orchestrates multiple operations)
try {
  const integration = await integrationService.installIntegration('hubspot')
  console.log('Integration installed:', integration.name)
} catch (error) {
  console.error('Installation failed:', error.message)
}
```

### Testing with Mocks

```javascript
import { IntegrationService } from './application/services/IntegrationService.js'

// Mock the repository
const mockRepository = {
  getAll: jest.fn().mockResolvedValue([]),
  install: jest.fn().mockResolvedValue({ name: 'test', status: 'active' })
}

// Test the service in isolation
const service = new IntegrationService(mockRepository)
const result = await service.installIntegration('test')
expect(result.name).toBe('test')
```

## Benefits of This Architecture

### 1. **Testability**
- Domain logic can be tested without UI or API dependencies
- Use cases can be tested with mock repositories
- Clear boundaries make unit testing straightforward

### 2. **Maintainability**
- Clear separation of concerns
- Changes to UI don't affect business logic
- Changes to API don't affect domain rules
- Easy to locate and modify specific functionality

### 3. **Flexibility**
- Can swap implementations (e.g., different API clients)
- Easy to add new use cases
- UI components are just thin wrappers
- Business rules are centralized and reusable

### 4. **Scalability**
- New features follow established patterns
- Clear guidelines for where code belongs
- Reduces coupling between layers
- Facilitates team collaboration with clear boundaries

## Migration Notes

### For Developers

1. **Business Logic**: Moved from components to domain entities and use cases
2. **API Calls**: Now handled by infrastructure adapters
3. **State Management**: useFrigg now delegates to application services
4. **Component Updates**: Import paths changed to presentation layer

### Breaking Changes

- Component import paths now use `presentation/components/`
- useFrigg import now from `presentation/hooks/useFrigg`
- Direct API usage should be replaced with service calls
- Business logic in components should be moved to domain/application layers

### Migration Path

1. Update imports to use new presentation paths
2. Replace direct API calls with service calls
3. Move business logic from components to appropriate domain/application layer
4. Use dependency injection container for service access
5. Test thoroughly with new architecture

## Future Enhancements

1. **Add More Use Cases**: Break down complex operations into focused use cases
2. **Event Sourcing**: Add domain events for better integration
3. **CQRS**: Separate read/write models for complex scenarios
4. **Repository Patterns**: Add more sophisticated data access patterns
5. **Validation Layer**: Add comprehensive validation at domain boundaries

This architecture provides a solid foundation for scalable, maintainable frontend development while keeping the codebase organized and testable.