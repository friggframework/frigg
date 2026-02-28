# Holistic DDD/Hexagonal Architecture - Frigg Management UI

**Date**: 2025-09-30
**Scope**: Full-stack architecture (Frontend + Backend)

---

## Executive Summary

The Frigg Management UI implements **distributed DDD** across frontend and backend:

- **Backend** (server/): Core domain logic, business rules, data persistence
- **Frontend** (src/): Presentation logic, client-side state, UI workflows

Both layers follow DDD/Hexagonal architecture **independently** but **coordinate** through HTTP/WebSocket APIs.

---

## Full-Stack Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                          │
│  Package: @friggframework/management-ui                        │
│                                                                 │
│  src/                                                          │
│  ├── presentation/      React UI, Components, Hooks           │
│  ├── application/       Client-side orchestration             │
│  ├── domain/           Client-side entities & validation      │
│  └── infrastructure/   HTTP/WS clients, external APIs         │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    HTTP/WebSocket (Port 3210)
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    BACKEND (Node.js/Express)                    │
│  Location: server/                                              │
│                                                                 │
│  server/src/                                                    │
│  ├── presentation/      Express routes, controllers            │
│  ├── application/       Server-side use cases & services       │
│  ├── domain/           Core business entities & rules          │
│  └── infrastructure/   Database, file system, external APIs    │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    ┌──────────┴────────────┐
                    │                       │
              File System              External APIs
              (Frigg repos)        (npm, GitHub, etc.)
```

---

## Why Both Layers Have DDD?

### Backend DDD (Server-Side)
**Purpose**: Source of truth for business logic

**Responsibilities**:
- Persist project state (running/stopped)
- Validate integrations before install
- Manage user sessions and credentials
- Coordinate with Frigg framework
- Access file system and databases

**Example Domain Logic**:
```javascript
// server/src/domain/entities/Project.js
class Project {
  start() {
    if (!this.hasValidConfiguration()) {
      throw new DomainError('Cannot start project without valid config')
    }
    this.status = 'running'
  }
}
```

### Frontend DDD (Client-Side)
**Purpose**: Rich UI logic and optimistic updates

**Responsibilities**:
- Client-side validation (fast feedback)
- Complex UI state machines (zone navigation)
- Optimistic updates (start project immediately in UI)
- Local caching and offline support
- UI-specific business rules

**Example Domain Logic**:
```javascript
// src/domain/entities/Integration.js
class Integration {
  canBeConfigured() {
    return this.status === 'NEEDS_CONFIG' && this.hasRequiredFields()
  }
}
```

---

## Layer-by-Layer Comparison

### Domain Layer

| Concern | Backend (Server) | Frontend (Client) |
|---------|------------------|-------------------|
| **Entities** | Project, Integration, User (DB models) | Project, Integration, User (UI models) |
| **Validation** | Server-side (security) | Client-side (UX) |
| **Business Rules** | Authoritative | Advisory/Optimistic |
| **Persistence** | Database, file system | LocalStorage, state |

**Example Entity Sync**:
```javascript
// Backend creates authoritative entity
const project = await projectRepository.findById(id)
project.start() // Changes DB

// Frontend mirrors for UI
const clientProject = Integration.fromAPI(apiResponse)
clientProject.markAsStarting() // Optimistic UI update
```

### Application Layer

| Concern | Backend (Server) | Frontend (Client) |
|---------|------------------|-------------------|
| **Use Cases** | StartProjectUseCase | StartProjectUseCase (calls backend) |
| **Services** | ProjectService (DB access) | ProjectService (API calls) |
| **Orchestration** | Multi-entity transactions | Multi-API call coordination |

**Use Case Flow**:
```
User clicks "Start Project"
  ↓
Frontend Use Case: StartProjectUseCase
  1. Validate input (client-side)
  2. Call backend API
  3. Update local state optimistically
  ↓
Backend Use Case: StartProjectUseCase
  1. Validate input (server-side)
  2. Check project can start
  3. Execute start command
  4. Update database
  5. Return result
  ↓
Frontend receives response
  1. Confirm optimistic update OR
  2. Rollback on error
```

### Infrastructure Layer

| Concern | Backend (Server) | Frontend (Client) |
|---------|------------------|-------------------|
| **Adapters** | File system, Database | HTTP client, WebSocket |
| **External APIs** | GitHub, npm, AWS | Backend API, npm registry |
| **I/O** | Disk, network | Network only |

**Infrastructure Independence**:
- Backend can swap databases (Postgres → MongoDB) without changing domain
- Frontend can swap HTTP client (axios → fetch) without changing domain

### Presentation Layer

| Concern | Backend (Server) | Frontend (Client) |
|---------|------------------|-------------------|
| **Controllers** | Express route handlers | N/A |
| **Routes** | REST/WebSocket endpoints | React Router |
| **Views** | JSON responses | React components |
| **Validation** | Request validation | Form validation |

---

## Communication Protocol (The "Seam")

### REST API Contract

**Backend Exposes**:
```
GET  /api/projects/:id/status
POST /api/projects/:id/start
POST /api/projects/:id/stop
GET  /api/integrations
POST /api/integrations/:name/install
```

**Frontend Consumes**:
```javascript
// src/infrastructure/http/api-client.js
export const startProject = (projectId) =>
  api.post(`/api/projects/${projectId}/start`)
```

### WebSocket Events

**Backend Emits**:
```javascript
socket.emit('project:status', { status: 'running' })
socket.emit('integration:installed', { name: 'salesforce' })
```

**Frontend Listens**:
```javascript
// src/infrastructure/websocket/websocket-handlers.js
socket.on('project:status', (data) => {
  // Update client-side state
})
```

---

## Current Directory Structure

### Frontend (`/src`)
```
src/
├── main.jsx                  # Vite entry
├── container.js             # DI container
│
├── domain/                  # CLIENT-SIDE domain
│   ├── entities/           # UI entities
│   ├── value-objects/      # UI value objects
│   └── interfaces/         # Port definitions
│
├── application/            # CLIENT-SIDE application
│   ├── use-cases/         # UI workflows
│   └── services/          # API orchestration
│
├── infrastructure/         # CLIENT-SIDE infrastructure
│   ├── adapters/          # Repository implementations
│   ├── http/              # ✅ NEW: HTTP client
│   ├── websocket/         # ✅ NEW: WebSocket client
│   └── npm/               # ✅ NEW: NPM registry client
│
└── presentation/           # UI layer
    ├── components/        # React components
    ├── hooks/            # React hooks
    └── pages/            # Page components
```

### Backend (`/server/src`)
```
server/src/
├── domain/                # SERVER-SIDE domain
│   ├── entities/        # Core business entities
│   ├── value-objects/   # Domain value objects
│   ├── services/        # Domain services
│   └── errors/          # Domain exceptions
│
├── application/           # SERVER-SIDE application
│   ├── use-cases/       # Business workflows
│   └── services/        # Application services
│
├── infrastructure/        # SERVER-SIDE infrastructure
│   ├── adapters/        # External service adapters
│   └── repositories/    # Data persistence
│
└── presentation/          # API layer
    ├── controllers/     # Request handlers
    └── routes/          # Express routes
```

---

## Refactoring Status

### ✅ Phase 1 Complete: Infrastructure Cleanup

**Actions Taken**:
1. Created `/src/infrastructure/http/`, `/websocket/`, `/npm/`
2. Moved `services/api.js` → `infrastructure/http/api-client.js`
3. Moved `services/websocket-handlers.js` → `infrastructure/websocket/`
4. Moved `services/apiModuleService.js` → `infrastructure/npm/npm-registry-client.js`
5. Updated all imports to new paths
6. Deleted empty `/src/services` directory
7. ✅ **Build verified successful**

### 🔄 Phase 2 Pending: Presentation Consolidation

**Goal**: Eliminate duplicate directories
- Move `/src/components` → `/src/presentation/components`
- Move `/src/hooks` → `/src/presentation/hooks`
- Organize components by feature (zones, integrations, common)

**Awaiting approval** before proceeding.

---

## Architectural Decision Record (ADR)

### ADR-001: Distributed DDD Across Frontend/Backend

**Status**: Accepted

**Context**:
- Management UI has complex client-side logic (state machines, zone navigation)
- Need optimistic UI updates for responsiveness
- Backend is source of truth for persistent state

**Decision**:
Both frontend and backend implement full DDD/Hexagonal architecture independently.

**Rationale**:
1. **Separation of Concerns**: UI logic ≠ business logic
2. **Scalability**: Can scale frontend and backend independently
3. **Testability**: Each layer tested in isolation
4. **Flexibility**: Can swap implementations on either side

**Consequences**:
- ✅ Clear boundaries and responsibilities
- ✅ Easy to test and maintain
- ⚠️ Some duplication (acceptable for separation)
- ⚠️ Must keep entities synchronized

### ADR-002: Frontend Infrastructure Layer

**Status**: Accepted

**Context**:
Frontend needs to communicate with backend and external APIs (npm registry).

**Decision**:
Frontend infrastructure layer contains HTTP/WebSocket clients and external API adapters.

**Rationale**:
- HTTP client is infrastructure (not domain concern)
- WebSocket is infrastructure (real-time communication)
- NPM registry is external dependency (adapter pattern)

**Consequences**:
- ✅ Domain layer stays pure (no HTTP imports)
- ✅ Easy to mock for testing
- ✅ Can swap HTTP client without affecting domain

---

## Benefits of This Architecture

### 1. Clear Responsibilities

**Backend owns**:
- Persistent data
- Security & authorization
- File system access
- Integration with Frigg framework

**Frontend owns**:
- User experience
- Client-side validation
- UI state management
- Optimistic updates

### 2. Independent Scalability

- Frontend can be deployed to CDN
- Backend can scale horizontally
- No tight coupling

### 3. Testing Excellence

```javascript
// Backend domain test (no HTTP)
test('Project cannot start without valid config', () => {
  const project = new Project({ config: null })
  expect(() => project.start()).toThrow()
})

// Frontend domain test (no HTTP)
test('Integration shows config button when needs config', () => {
  const integration = new Integration({ status: 'NEEDS_CONFIG' })
  expect(integration.canBeConfigured()).toBe(true)
})

// Frontend infrastructure test (mock HTTP)
test('API client retries on network error', async () => {
  mockAxios.onGet('/api/projects').networkError()
  mockAxios.onGet('/api/projects').reply(200, { projects: [] })

  const result = await apiClient.getProjects()
  expect(result).toBeDefined()
})
```

### 4. Framework Independence

- Backend could move from Express to Fastify
- Frontend could move from React to Vue
- Domain logic unaffected

---

## Best Practices

### 1. Keep Entities Synchronized

**Backend entity**:
```javascript
class Project {
  constructor({ id, name, status, config }) {
    this.id = id
    this.name = name
    this.status = status
    this.config = config
  }
}
```

**Frontend entity** (mirrors structure):
```javascript
class Project {
  constructor({ id, name, status, config }) {
    this.id = id
    this.name = name
    this.status = status
    this.config = config
  }

  static fromAPI(apiResponse) {
    return new Project(apiResponse)
  }
}
```

### 2. Backend is Source of Truth

Frontend should never make assumptions about server state.

**❌ Bad**:
```javascript
// Frontend assumes start succeeded
project.status = 'running'
await api.startProject(project.id) // Hope it works
```

**✅ Good**:
```javascript
// Frontend waits for confirmation
project.status = 'starting' // Optimistic
const result = await api.startProject(project.id)
project.status = result.status // Use server response
```

### 3. Use Adapters for External Dependencies

**Frontend example**:
```javascript
// infrastructure/npm/npm-registry-client.js
export class NPMRegistryClient {
  async searchPackages(query) {
    const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}`)
    return response.json()
  }
}

// application/services/IntegrationService.js
class IntegrationService {
  constructor(npmClient) { // Injected, not hardcoded
    this.npmClient = npmClient
  }

  async discoverIntegrations() {
    const packages = await this.npmClient.searchPackages('@friggframework/api-module-')
    return packages.map(Integration.fromNPM)
  }
}
```

---

## Migration Guidelines

### When Refactoring Backend

1. Keep API contract stable
2. Update frontend infrastructure adapters if needed
3. Run integration tests

### When Refactoring Frontend

1. Domain changes don't affect backend
2. Update API calls in infrastructure layer
3. Keep presentation layer thin

---

## Conclusion

The Frigg Management UI uses **distributed DDD** effectively:

- ✅ Both frontend and backend have complete DDD layers
- ✅ Clear separation of concerns
- ✅ Infrastructure layer in frontend is valid and necessary
- ✅ Communication through well-defined API contract
- ✅ Each side testable in isolation

This architecture supports the complexity of a developer tool with both rich UI interactions and robust backend operations.

---

**Next Steps**:
1. Complete presentation layer consolidation (Phase 2)
2. Add integration tests across frontend/backend boundary
3. Document API contract explicitly
4. Consider adding API versioning strategy