# Frigg Management UI

A modern React-based **developer tool** for managing local Frigg projects. Built with Vite, React, and Tailwind CSS following DDD/Hexagonal architecture principles.

## Purpose

The Management UI is a **local development tool** for Frigg framework developers to:
- Manage Frigg project lifecycle (start/stop/inspect)
- Perform git operations (branch management, sync)
- Test integrations using `@friggframework/ui` in a sandboxed environment

**NOT for runtime integration management** - that's handled by `@friggframework/ui` in deployed applications.

## Features

- **Project Management**: Discover, initialize, start/stop local Frigg projects
- **Git Operations**: Branch management, repository status, sync operations
- **Test Area**: Sandboxed environment using `@friggframework/ui` for integration testing
- **Real-time Updates**: WebSocket-based live updates for process status
- **Responsive Design**: Mobile-friendly interface
- **DDD Architecture**: Clean separation of concerns with hexagonal architecture

## Tech Stack

- **React 18.3**: Modern React with hooks and functional components
- **Vite**: Fast development and build tooling
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Modern icon library
- **Socket.io**: Real-time communication
- **Axios**: HTTP client
- **@friggframework/ui**: Shared UI components

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Frigg project directory to manage

### Quick Start

```bash
# From any Frigg project directory
frigg ui

# Or install and run globally
npm install -g @friggframework/devtools
frigg ui
```

### Development

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev:server

# Frontend only
npm run dev

# Backend only
npm run server:dev
```

### Available Scripts

- `npm run dev` - Start Vite development server (port 5173)
- `npm run dev:server` - Start both frontend and backend concurrently
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run server` - Start backend server (port 3210)
- `npm run server:dev` - Start backend server with nodemon
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run test` - Run Jest tests

## Architecture

### DDD/Hexagonal Architecture (Clean Architecture)

The Management UI follows Domain-Driven Design principles with clear separation of concerns:

```
server/src/
├── presentation/           # Routes & Controllers (HTTP adapters)
│   ├── routes/
│   │   ├── projectRoutes.js    # Project management endpoints
│   │   ├── gitRoutes.js        # Git operation endpoints
│   │   └── testAreaRoutes.js   # Test area endpoints
│   └── controllers/
│       ├── ProjectController.js
│       └── GitController.js
├── application/            # Use Cases & Services (Business logic)
│   ├── use-cases/
│   │   ├── StartProjectUseCase.js
│   │   ├── StopProjectUseCase.js
│   │   ├── InspectProjectUseCase.js
│   │   └── git/
│   │       ├── CreateBranchUseCase.js
│   │       ├── SwitchBranchUseCase.js
│   │       └── SyncBranchUseCase.js
│   └── services/
│       ├── ProjectService.js
│       └── GitService.js
├── domain/                # Domain Entities & Services
│   ├── entities/
│   │   ├── Project.js
│   │   └── AppDefinition.js
│   └── services/
│       ├── ProcessManager.js
│       └── GitService.js
└── infrastructure/        # Repositories & Adapters
    ├── repositories/
    │   └── FileSystemProjectRepository.js
    ├── adapters/
    │   ├── FriggCliAdapter.js
    │   └── GitAdapter.js
    └── persistence/
        └── SimpleGitAdapter.js

src/                       # Frontend (React)
├── presentation/          # UI Layer
│   ├── components/
│   │   ├── common/        # Shared UI components
│   │   ├── admin/         # Admin view components
│   │   └── zones/         # Zone-based organization
│   ├── pages/
│   └── hooks/
├── application/           # Frontend use cases
├── domain/               # Frontend domain models
└── infrastructure/       # API clients
```

## Core Functionality

### 1. Project Management
- **Discover Projects**: Automatically find Frigg projects in your workspace
- **Initialize**: Set up new Frigg projects
- **Start/Stop**: Manage local Frigg process lifecycle
- **Inspect**: Deep project analysis (structure, config, dependencies)

### 2. Git Operations
- **Branch Management**: Create, switch, delete branches
- **Repository Status**: Real-time git status and branch info
- **Sync Operations**: Pull, push, and synchronize branches
- **Working Directory**: Track uncommitted changes

### 3. Test Area
- **Integration Testing**: Uses `@friggframework/ui` for testing integrations
- **User Simulation**: Switch between test users
- **Live Testing**: Test integrations in real-time with hot reload
- **Same UI**: Test with the exact UI end-users will see

## API Endpoints

The management UI backend exposes clean REST APIs following DDD principles:

### Project Management (`/api/projects`)
- `GET /api/projects/discover` - Discover Frigg projects in workspace
- `POST /api/projects/initialize` - Initialize new Frigg project
- `GET /api/projects/inspect` - Deep inspection of project structure
- `GET /api/projects/status` - Get project and process status
- `POST /api/projects/start` - Start Frigg project
- `POST /api/projects/stop` - Stop Frigg project

### Git Operations (`/api/git`)
- `GET /api/git/status` - Repository and branch status
- `GET /api/git/branches` - List all branches
- `POST /api/git/branches` - Create new branch
- `PUT /api/git/branches/:name` - Switch to branch
- `DELETE /api/git/branches/:name` - Delete branch
- `POST /api/git/sync` - Sync branch with remote

### Test Area (`/api/test-area`)
- `GET /api/test-area/status` - Check if Frigg is running for testing
- `POST /api/test-area/start` - Start Frigg for test area
- `POST /api/test-area/stop` - Stop test area Frigg instance
- `GET /api/test-area/health` - Health check for test Frigg

### System
- `GET /api/health` - Management UI health check

## Styling

This project uses Tailwind CSS for styling with:

- **Design System**: Consistent spacing, colors, and typography
- **Responsive Design**: Mobile-first approach
- **Component Variants**: Button and component style variants
- **Dark Mode Ready**: CSS custom properties for theming

### Custom Utilities

- `cn()`: Utility for combining Tailwind classes with conditional logic

## Error Handling

- **Error Boundaries**: React error boundaries catch component errors
- **API Error Handling**: Axios interceptors handle API errors
- **Loading States**: Loading spinners and disabled states
- **Validation**: Form validation and user feedback

## Development

### DDD/Hexagonal Architecture Guidelines

**Golden Rule**: Handlers/Controllers ONLY call Use Cases, NEVER Repositories directly.

```
Controller → Use Case → Repository → External System
```

#### Layer Responsibilities

1. **Presentation Layer** (Routes & Controllers)
   - HTTP-specific logic only (status codes, headers, response formatting)
   - Calls use cases, never repositories
   - Thin adapters with minimal logic
   - Error mapping (domain errors → HTTP errors)

2. **Application Layer** (Use Cases & Services)
   - Business logic and orchestration
   - Coordinates multiple repository calls
   - Enforces business rules
   - Receives dependencies via constructor (dependency injection)

3. **Domain Layer** (Entities & Domain Services)
   - Core business objects
   - Domain logic and invariants
   - Technology-agnostic

4. **Infrastructure Layer** (Repositories & Adapters)
   - Pure database/file operations (CRUD)
   - External API calls
   - No business logic
   - Returns raw data

### Code Style

- **DDD Principles**: Follow hexagonal architecture patterns
- **ESLint**: Linting with React and React Hooks rules
- **Functional Components**: React hooks and composition
- **Dependency Injection**: Constructor-based injection
- **Single Responsibility**: Each use case does one thing

## Building and Deployment

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The build output will be in the `dist/` directory and can be served by any static file server.

## Key Architectural Decisions

### Why No Integration Management in Management UI?

The Management UI is a **developer tool** for managing local Frigg projects. Integration and connection management belongs in `@friggframework/ui`, which is:
- Used by deployed Frigg applications (runtime)
- End-user facing
- Embedded in Test Area for testing

This separation ensures:
- ✅ Zero duplication between dev tools and runtime UI
- ✅ Clear boundaries of responsibility
- ✅ Developers test with the exact UI end-users see
- ✅ Simpler maintenance (single source of truth)

### Test Area Pattern

The Test Area embeds `@friggframework/ui` to provide:
1. **Integration testing** with the production UI
2. **User simulation** for multi-tenant scenarios
3. **Real-time testing** with hot reload
4. **Authentication context** for testing flows

## Environment Variables

### Backend
- `PORT` - Server port (default: 3210)
- `PROJECT_PATH` - Default project path to manage

### Frontend
- Auto-detects environment:
  - **Development**: API at `http://localhost:3210`
  - **Production**: Same origin

## Contributing

1. **Follow DDD Architecture**:
   - Controllers call use cases, not repositories
   - Business logic in use cases, not controllers
   - Repositories only for data access
2. **Add error handling** for new features
3. **Include loading states** for async operations
4. **Write tests** using the established patterns
5. **Update documentation** for significant changes
6. **Use dependency injection** for all dependencies

## Testing

```bash
# Run server tests
npm run test

# Run specific test file
npm run test -- path/to/test.js

# Watch mode
npm run test -- --watch
```

### Test Structure
- **Unit Tests**: Domain entities, value objects
- **Integration Tests**: Use case workflows
- **Controller Tests**: HTTP endpoint behavior

## Related Packages

- **@friggframework/core**: Frigg framework core functionality
- **@friggframework/ui**: Runtime integration UI (used in Test Area)
- **@friggframework/devtools**: CLI tools for Frigg development

## Documentation

- [DDD Architecture](./docs/ARCHITECTURE.md)
- [Cleanup Summary](./CLEANUP_SUMMARY.md)
- [Frigg Framework Docs](https://docs.friggframework.org)

## License

This project is part of the Frigg Framework and follows the same licensing terms.