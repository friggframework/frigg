# Graphite Stacking Progress Bookmark

**Date**: 2025-10-01
**Session**: Stacking fix-frigg-ui onto feat/general-code-improvements

## Current Status: Stack 4 In Progress

### ✅ Completed Stacks (3/10)

#### Stack 1: Core Models & Middleware
- **Branch**: `stack/core-models-and-middleware`
- **Commit**: `54f6fba2`
- **Status**: ✅ Committed and complete
- **Files**: 7 files (4 new, 3 modified)
- **Changes**: 189 insertions, 52 deletions
- **Key files**:
  - `packages/core/database/models/State.js` (new)
  - `packages/core/database/models/Token.js` (new)
  - `packages/core/handlers/routers/middleware/loadUser.js` (new)
  - `packages/core/handlers/routers/middleware/requireLoggedInUser.js` (new)

#### Stack 2: Core Integration Router
- **Branch**: `stack/core-integration-router`
- **Commit**: `71719e30`
- **Status**: ✅ Committed and complete
- **Files**: 23 files (12 new, 11 modified)
- **Changes**: 2587 insertions, 1654 deletions
- **Key files**:
  - `packages/core/integrations/integration-factory.js` (new)
  - `packages/core/module-plugin/auther.js` (new)
  - `packages/core/integrations/integration-router.js` (BREAKING CHANGE)
- **Note**: BREAKING CHANGE - replaced use-case/repository patterns with factory approach

#### Stack 3: Management-UI Server DDD
- **Branch**: `stack/management-ui-server-ddd`
- **Commit**: `6304dc5c`
- **Status**: ✅ Committed and complete
- **Files**: 63 files (60 new, 3 modified)
- **Changes**: 9544 insertions, 445 deletions
- **Architecture**: Complete DDD/hexagonal architecture for server
  - Domain layer: Entities, Value Objects, Services, Errors
  - Application layer: Services, Use Cases
  - Infrastructure layer: Adapters, Repositories, Persistence
  - Presentation layer: Controllers, Routes
  - Dependency Injection: container.js, app.js
  - Documentation: 3 major architecture docs

### 🔄 Currently Working: Stack 4

#### Stack 4: Management-UI Client DDD
- **Branch**: `stack/management-ui-client-ddd`
- **Status**: 🔄 IN PROGRESS - Branch created, partially staged
- **Current state**: Cherry-picking presentation components (part 1 complete)
- **Completed cherry-picks**:
  - ✅ Domain layer (16 files): entities, interfaces, value-objects
  - ✅ Application layer (11 files): services, use-cases
  - ✅ Infrastructure layer (10 files): adapters, http, websocket
  - ✅ Presentation components part 1 (14 files): admin, common components
- **Remaining cherry-picks needed**:
  - ⏳ Presentation components part 2: integrations, layout, theme, ui, zones
  - ⏳ Presentation hooks (5 files)
  - ⏳ Presentation pages
  - ⏳ Root files: container.js, main.jsx, index.css, etc.

**Next commands to complete Stack 4**:
```bash
# Continue cherry-picking presentation components
git checkout fix-frigg-ui -- \
  packages/devtools/management-ui/src/presentation/components/integrations/IntegrationGallery.jsx \
  packages/devtools/management-ui/src/presentation/components/layout/AppRouter.jsx \
  packages/devtools/management-ui/src/presentation/components/layout/ErrorBoundary.jsx \
  packages/devtools/management-ui/src/presentation/components/layout/Layout.jsx \
  packages/devtools/management-ui/src/presentation/components/theme/ThemeProvider.jsx \
  packages/devtools/management-ui/src/presentation/components/ui/badge.tsx \
  packages/devtools/management-ui/src/presentation/components/ui/button.tsx \
  packages/devtools/management-ui/src/presentation/components/ui/card.tsx \
  packages/devtools/management-ui/src/presentation/components/ui/dialog.jsx \
  packages/devtools/management-ui/src/presentation/components/ui/dropdown-menu.tsx \
  packages/devtools/management-ui/src/presentation/components/ui/input.jsx \
  packages/devtools/management-ui/src/presentation/components/ui/select.tsx \
  packages/devtools/management-ui/src/presentation/components/ui/skeleton.jsx \
  packages/devtools/management-ui/src/presentation/components/zones/DefinitionsZone.jsx \
  packages/devtools/management-ui/src/presentation/components/zones/TestAreaContainer.jsx \
  packages/devtools/management-ui/src/presentation/components/zones/TestAreaUserSelection.jsx \
  packages/devtools/management-ui/src/presentation/components/zones/TestAreaWelcome.jsx \
  packages/devtools/management-ui/src/presentation/components/zones/TestingZone.jsx

# Cherry-pick hooks and pages
git checkout fix-frigg-ui -- \
  packages/devtools/management-ui/src/presentation/hooks/useFrigg.jsx \
  packages/devtools/management-ui/src/presentation/hooks/useIDE.js \
  packages/devtools/management-ui/src/presentation/hooks/useIntegrations.js \
  packages/devtools/management-ui/src/presentation/hooks/useRepositories.js \
  packages/devtools/management-ui/src/presentation/hooks/useSocket.jsx \
  packages/devtools/management-ui/src/presentation/pages/Settings.jsx

# Cherry-pick root files
git checkout fix-frigg-ui -- \
  packages/devtools/management-ui/src/container.js \
  packages/devtools/management-ui/src/main.jsx \
  packages/devtools/management-ui/src/index.css \
  packages/devtools/management-ui/src/index.js \
  packages/devtools/management-ui/src/lib/utils.ts \
  packages/devtools/management-ui/src/assets/FriggLogo.svg \
  packages/devtools/management-ui/src/pages/Settings.jsx

# Commit Stack 4
git add -A && git commit -m "feat(management-ui): implement DDD/hexagonal architecture for client

Implements clean architecture with domain, application, infrastructure, and presentation layers

Domain Layer:
- Entities: User, AdminUser, Project, Integration, APIModule, Environment, GlobalEntity
- Interfaces: Repository interfaces, SocketService interface
- Value Objects: IntegrationStatus, ServiceStatus

Application Layer:
- Services: UserService, AdminService, ProjectService, IntegrationService, EnvironmentService
- Use Cases: GetProjectStatus, InstallIntegration, ListIntegrations, StartProject, StopProject, SwitchRepository

Infrastructure Layer:
- Adapters: Repository adapters for all domains, SocketServiceAdapter
- HTTP Client: api-client.js with request/response handling
- WebSocket: websocket-handlers.js for real-time updates
- NPM Registry: npm-registry-client.js for package management

Presentation Layer:
- App: Main App.jsx with routing
- Components:
  * Admin: AdminViewContainer, UserManagement, GlobalEntityManagement, CreateUserModal
  * Common: IDESelector, LiveLogPanel, OpenInIDEButton, RepositoryPicker, SearchBar, SettingsButton, SettingsModal, ZoneNavigation
  * Integrations: IntegrationGallery
  * Layout: AppRouter, ErrorBoundary, Layout
  * Theme: ThemeProvider
  * UI: badge, button, card, dialog, dropdown-menu, input, select, skeleton
  * Zones: DefinitionsZone, TestAreaContainer, TestAreaUserSelection, TestAreaWelcome, TestingZone
- Hooks: useFrigg, useIDE, useIntegrations, useRepositories, useSocket
- Pages: Settings

Dependency Injection:
- container.js for client-side DI configuration
- main.jsx as application entry point"
```

### ⏳ Remaining Stacks (6/10)

#### Stack 5: Management-UI Testing
- **Branch**: `stack/management-ui-testing` (not yet created)
- **Purpose**: Vitest→Jest migration, comprehensive test coverage
- **Files**: 38 test files
- **Key areas**:
  - Server tests: API endpoints, controllers, use cases, domain services
  - Jest configuration and setup
  - Test utilities and mocks

#### Stack 6: UI Library Context API
- **Branch**: `stack/ui-library-context-api` (not yet created)
- **Purpose**: Context API for integration data management
- **Files**: 4-5 files
- **Key files**:
  - `packages/ui/lib/integration/IntegrationDataContext.jsx` (new)
  - Updates to IntegrationList, IntegrationHorizontal, IntegrationVertical

#### Stack 7: UI Library DDD Layers
- **Branch**: `stack/ui-library-ddd-layers` (not yet created)
- **Purpose**: DDD architecture for @friggframework/ui
- **Files**: 40+ files
- **Architecture**: Domain, repositories, services, use cases, infrastructure, presentation

#### Stack 8: UI Library Wizard Components
- **Branch**: `stack/ui-library-wizard-components` (not yet created)
- **Purpose**: Installation wizard and entity management UI
- **Files**: 10+ files
- **Key components**: InstallationWizardModal, entity management flows

#### Stack 9: CLI Specifications & Docs
- **Branch**: `stack/cli-specs-and-docs` (not yet created)
- **Purpose**: CLI documentation and specifications
- **Files**: 15+ files
- **Key docs**:
  - 7 CLI specification documents
  - CLI updates (ui-command, infrastructure)
  - Management-UI documentation updates

#### Stack 10: Multi-Step Auth Spec
- **Branch**: Move/rebase existing `multi-step-auth-spec` to top of stack
- **Purpose**: Multi-step authentication specification
- **Files**: 1 major spec document
- **Key file**: `MULTI_STEP_AUTH_AND_SHARED_ENTITIES_SPEC.md`

## Stack Hierarchy

Current Graphite stack structure:
```
◯        multi-step-auth-spec (needs restack to top)
◯        fix-frigg-ui (source branch)
◯        codex/skip-aws-discovery-on-frigg-start
│ ◉      stack/management-ui-server-ddd (Stack 3 - COMPLETE)
│ ◯      stack/core-integration-router (Stack 2 - COMPLETE)
│ ◯      stack/core-models-and-middleware (Stack 1 - COMPLETE)
│ ◯      feat/general-code-improvements (base branch)
◯─┘      next (main branch)
```

**Target stack structure**:
```
◯        stack/multi-step-auth-spec (Stack 10 - top)
◯        stack/cli-specs-and-docs (Stack 9)
◯        stack/ui-library-wizard-components (Stack 8)
◯        stack/ui-library-ddd-layers (Stack 7)
◯        stack/ui-library-context-api (Stack 6)
◯        stack/management-ui-testing (Stack 5)
◯        stack/management-ui-client-ddd (Stack 4) ← IN PROGRESS
◯        stack/management-ui-server-ddd (Stack 3) ✅
◯        stack/core-integration-router (Stack 2) ✅
◯        stack/core-models-and-middleware (Stack 1) ✅
◯        feat/general-code-improvements (base)
◯        next
```

## Key Commands Reference

### Creating stacks:
```bash
gt create stack/<name> --no-interactive
```

### Cherry-picking files:
```bash
git checkout fix-frigg-ui -- <file-paths>
```

### Committing:
```bash
git add -A && git commit -m "<message>"
```

### Checking status:
```bash
git status --short
gt log short
```

### Submitting PRs (when all stacks complete):
```bash
gt submit --stack --no-interactive
```

## Notes

- All stacks build on `feat/general-code-improvements` (PR #395)
- Each stack is independently reviewable
- Merge order: bottom-to-top (Stack 1 → Stack 10)
- Stack 2 contains BREAKING CHANGE (factory pattern)
- Complete plan available in `/docs/GRAPHITE_STACK_PLAN.md`

## Resume Instructions

When resuming:
1. Check current branch: `gt log short`
2. If on `stack/management-ui-client-ddd` with uncommitted changes:
   - Complete the cherry-picks listed above under "Stack 4 → Next commands"
   - Commit with the provided commit message
3. Continue to Stack 5, following the pattern from completed stacks
4. Reference `/docs/GRAPHITE_STACK_PLAN.md` for complete file lists and commit messages
