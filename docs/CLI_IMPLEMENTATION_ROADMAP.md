# Frigg CLI Implementation Roadmap

## Overview

This document provides a high-level roadmap for implementing the Frigg CLI based on the detailed specifications created.

---

## 📚 Specification Documents

### 1. **CLI_SPECIFICATION.md**
Complete command reference and design for the Frigg CLI.

**Key Content:**
- Full command hierarchy (init, create, add, config, start, deploy, ui, list, etc.)
- Interactive flows for all commands
- Contextual intelligence and command chaining
- Implementation priority phases
- 600+ lines of detailed specifications

**Status:** ✅ Complete

---

### 2. **CLI_CREATE_COMMANDS_SPEC.md**
Deep dive into `frigg create integration` and `frigg create api-module` commands.

**Key Content:**
- Step-by-step interactive flows (7 steps each)
- 20+ command flags and options
- File templates and boilerplate generation
- Validation rules with implementations
- 5 real-world examples
- Schema validation integration

**Status:** ✅ Complete

**Schemas Status:**
- ✅ `integration-definition.schema.json` - Exists and ready
- ✅ `api-module-definition.schema.json` - Exists and ready

---

### 3. **CLI_FILE_OPERATIONS_SPEC.md**
File system operations, atomic updates, and rollback strategies.

**Key Content:**
- Project structure mapping
- Files to create (integrations, API modules)
- Files to update (app-definition.json, backend.js, .env.example)
- Atomic file operations with temp files + rename
- Transaction-based operations (all-or-nothing)
- Rollback strategies for failure scenarios
- Complete utility classes ready to implement

**Status:** ✅ Complete

---

### 4. **CLI_GIT_SAFETY_SPEC.md**
Git safety checks and user guidance (non-invasive approach).

**Key Content:**
- Pre-flight safety checks
- Uncommitted changes detection and warnings
- Protected branch warnings
- Post-operation git guidance
- User control over git workflow (no automatic commits/branches)
- `GitSafetyCheck` utility class
- `--force` and `--dry-run` flag support

**Status:** ✅ Complete

---

## 🎯 Implementation Phases

### Phase 1: Core Scaffolding (Priority)

**Commands to Implement:**
- ✅ `frigg init` (exists, may need updates)
- 🔲 `frigg create integration`
- 🔲 `frigg create api-module`
- 🔲 `frigg add api-module`
- ✅ `frigg start` (exists)
- ✅ `frigg deploy` (exists)
- ✅ `frigg ui` (exists)

**Utilities Needed:**
- File operations utilities (`FileOperations`, `JSONUpdater`, `FileTransaction`)
- Git safety utilities (`GitSafetyCheck`)
- Template engine integration (Handlebars or EJS)
- Validation utilities (integration/module names, env vars, versions)

**Estimated Effort:** 3-4 weeks

---

### Phase 2: Configuration & Management

**Commands to Implement:**
- 🔲 `frigg config` (all subcommands)
- 🔲 `frigg list` (all subcommands)
- 🔲 `frigg projects`
- 🔲 `frigg instance`

**Utilities Needed:**
- Configuration management utilities
- Project discovery and switching
- Instance management (process tracking)

**Estimated Effort:** 2-3 weeks

---

### Phase 3: Extensions & Advanced

**Commands to Implement:**
- 🔲 `frigg add core-module`
- 🔲 `frigg add extension`
- 🔲 `frigg create credentials`
- 🔲 `frigg create deploy-strategy`
- 🔲 `frigg mcp` (with auto-running local MCP)

**Utilities Needed:**
- Core module management
- Extension system
- Credential generation from templates
- Deploy strategy configuration

**Estimated Effort:** 3-4 weeks

---

### Phase 4: Marketplace

**Commands to Implement:**
- 🔲 `frigg submit`
- 🔲 Marketplace integration
- 🔲 Module discovery
- 🔲 Ratings & reviews

**Estimated Effort:** 4-6 weeks

---

## 🛠️ Technical Stack

### Dependencies (Already in package.json)

```json
{
  "dependencies": {
    "commander": "^12.1.0",          // ✅ CLI framework
    "@inquirer/prompts": "^5.3.8",   // ✅ Interactive prompts
    "chalk": "^4.1.2",                // ✅ Terminal colors
    "fs-extra": "^11.2.0",            // ✅ File system utilities
    "js-yaml": "^4.1.0",              // ✅ YAML parsing
    "@babel/parser": "^7.25.3",      // ✅ AST parsing (for backend.js)
    "@babel/traverse": "^7.25.3",    // ✅ AST traversal
    "semver": "^7.6.0",               // ✅ Version parsing
    "validate-npm-package-name": "^5.0.0" // ✅ Package name validation
  }
}
```

### Additional Dependencies Needed

```json
{
  "dependencies": {
    "handlebars": "^4.7.8",          // Template engine
    "ajv": "^8.12.0",                // JSON schema validation
    "ora": "^5.4.1",                 // Spinners for progress
    "boxen": "^5.1.2"                // Boxes for important messages
  }
}
```

---

## 📁 DDD/Hexagonal Architecture File Structure

```
packages/devtools/frigg-cli/
├── index.js                        # Main CLI entry point
├── package.json
├── container.js                    # Dependency injection container
│
├── domain/                         # Domain Layer (Business Logic)
│   ├── entities/
│   │   ├── Integration.js          # Integration aggregate root
│   │   ├── ApiModule.js            # ApiModule entity
│   │   └── AppDefinition.js        # AppDefinition aggregate
│   ├── value-objects/
│   │   ├── IntegrationName.js      # Value object with validation
│   │   ├── SemanticVersion.js      # Semantic version value object
│   │   └── IntegrationId.js        # Identity value object
│   ├── services/
│   │   ├── IntegrationValidator.js # Domain validation logic
│   │   └── GitSafetyChecker.js     # Git safety domain service
│   └── ports/                      # Interfaces (contracts)
│       ├── IIntegrationRepository.js
│       ├── IApiModuleRepository.js
│       ├── IAppDefinitionRepository.js
│       └── IFileSystemPort.js
│
├── application/                    # Application Layer (Use Cases)
│   └── use-cases/
│       ├── CreateIntegrationUseCase.js
│       ├── CreateApiModuleUseCase.js
│       ├── AddApiModuleUseCase.js
│       └── UpdateAppDefinitionUseCase.js
│
├── infrastructure/                 # Infrastructure Layer (Adapters)
│   ├── adapters/
│   │   ├── FileSystemAdapter.js    # Low-level file operations
│   │   ├── GitAdapter.js           # Git operations
│   │   ├── SchemaValidator.js      # Schema validation (uses /packages/schemas)
│   │   └── TemplateEngine.js       # Template rendering
│   ├── repositories/
│   │   ├── FileSystemIntegrationRepository.js
│   │   ├── FileSystemApiModuleRepository.js
│   │   └── FileSystemAppDefinitionRepository.js
│   └── UnitOfWork.js               # Transaction coordinator
│
├── presentation/                   # Presentation Layer (CLI Commands)
│   └── commands/
│       ├── create/
│       │   ├── integration.js      # Orchestrates CreateIntegrationUseCase
│       │   └── api-module.js       # Orchestrates CreateApiModuleUseCase
│       ├── add/
│       │   └── api-module.js       # Orchestrates AddApiModuleUseCase
│       ├── config/
│       ├── init/                   # Existing commands
│       ├── start/
│       ├── deploy/
│       ├── ui/
│       └── list/
│
├── templates/                      # File templates (Handlebars)
│   ├── integration/
│   │   ├── Integration.js.hbs
│   │   ├── definition.js.hbs
│   │   └── README.md.hbs
│   └── api-module/
│       ├── full/
│       ├── minimal/
│       └── empty/
│
└── __tests__/                      # Tests
    ├── domain/
    │   ├── entities/
    │   │   └── Integration.test.js # Test domain logic
    │   └── value-objects/
    │       └── IntegrationName.test.js
    ├── application/
    │   └── use-cases/
    │       └── CreateIntegrationUseCase.test.js # Mock repositories
    ├── infrastructure/
    │   ├── adapters/
    │   │   └── FileSystemAdapter.test.js
    │   └── repositories/
    │       └── FileSystemIntegrationRepository.test.js
    └── integration/
        └── create-integration-e2e.test.js # Full workflow tests
```

### Architecture Benefits

**Domain Layer (Business Logic)**
- Pure domain models without infrastructure dependencies
- Testable without file system or external dependencies
- Reusable across different CLI implementations

**Application Layer (Orchestration)**
- Use Cases coordinate domain operations
- Transaction management through UnitOfWork
- Clear entry points for CLI commands

**Infrastructure Layer (Technical Details)**
- Adapters implement ports defined by domain
- Repositories handle persistence
- Easy to swap implementations (FileSystem → Database)

**Presentation Layer (User Interface)**
- Thin layer that delegates to Use Cases
- Handles user input/output and formatting
- No business logic

---

## 🧪 DDD Testing Strategy

### Unit Tests (Domain Layer)
- **Entities**: Integration, ApiModule, AppDefinition business logic
- **Value Objects**: IntegrationName validation, SemanticVersion parsing
- **Domain Services**: IntegrationValidator, GitSafetyChecker logic
- **No dependencies on infrastructure** - pure domain testing

### Unit Tests (Application Layer)
- **Use Cases**: Test with **mock repositories**
- CreateIntegrationUseCase with InMemoryIntegrationRepository
- Verify domain logic is called correctly
- Test transaction rollback scenarios

### Unit Tests (Infrastructure Layer)
- **Adapters**: FileSystemAdapter, SchemaValidator in isolation
- **Repositories**: Test persistence logic with test file system
- Verify atomic operations and rollback behavior

### Integration Tests
- **Repository + Adapter**: Test real file operations
- **Use Case + Repository**: Test complete flows with temp directories
- Error handling and rollback with actual file system

### E2E Tests
- **Full CLI commands**: Test user-facing workflows
- Create integration from command to files on disk
- Verify schema validation, git safety checks
- Test with real project structure

### Test Isolation Levels

```javascript
// Level 1: Pure Domain (Fastest)
test('Integration entity validates name', () => {
    const integration = new Integration({name: 'invalid name'});
    expect(integration.validate().isValid).toBe(false);
});

// Level 2: Use Case with Mocks
test('CreateIntegrationUseCase saves to repository', async () => {
    const mockRepo = new InMemoryIntegrationRepository();
    const useCase = new CreateIntegrationUseCase(mockRepo, ...);
    await useCase.execute({name: 'test'});
    expect(await mockRepo.exists('test')).toBe(true);
});

// Level 3: Infrastructure
test('FileSystemAdapter writes atomically', async () => {
    const adapter = new FileSystemAdapter();
    await adapter.writeFile('/tmp/test.txt', 'content');
    expect(fs.readFileSync('/tmp/test.txt', 'utf-8')).toBe('content');
});

// Level 4: E2E
test('frigg create integration creates files', async () => {
    await execCommand('frigg create integration test --no-prompt');
    expect(fs.existsSync('./integrations/test/Integration.js')).toBe(true);
});
```

---

## 🚀 DDD Implementation Checklist

### Domain Layer

**Entities** (`domain/entities/`)
- [ ] Implement `Integration` aggregate root with business rules
- [ ] Implement `ApiModule` entity
- [ ] Implement `AppDefinition` aggregate
- [ ] Add entity validation methods
- [ ] Add tests for domain logic

**Value Objects** (`domain/value-objects/`)
- [ ] Implement `IntegrationName` with format validation
- [ ] Implement `SemanticVersion` with parsing
- [ ] Implement `IntegrationId` for identity
- [ ] Ensure immutability
- [ ] Add tests

**Domain Services** (`domain/services/`)
- [ ] Implement `IntegrationValidator` for complex validation
- [ ] Implement `GitSafetyChecker` domain service
- [ ] Add tests

**Ports** (`domain/ports/`)
- [ ] Define `IIntegrationRepository` interface
- [ ] Define `IApiModuleRepository` interface
- [ ] Define `IAppDefinitionRepository` interface
- [ ] Define `IFileSystemPort` interface

### Application Layer

**Use Cases** (`application/use-cases/`)
- [ ] Implement `CreateIntegrationUseCase`
- [ ] Implement `CreateApiModuleUseCase`
- [ ] Implement `AddApiModuleUseCase`
- [ ] Add transaction coordination (UnitOfWork)
- [ ] Add tests with mock repositories

### Infrastructure Layer

**Adapters** (`infrastructure/adapters/`)
- [ ] Implement `FileSystemAdapter` with atomic operations
- [ ] Implement `SchemaValidator` (leverage /packages/schemas)
- [ ] Implement `GitAdapter` for git operations
- [ ] Implement `TemplateEngine` (Handlebars)
- [ ] Add tests for each adapter

**Repositories** (`infrastructure/repositories/`)
- [ ] Implement `FileSystemIntegrationRepository`
- [ ] Implement `FileSystemApiModuleRepository`
- [ ] Implement `FileSystemAppDefinitionRepository`
- [ ] Add persistence/retrieval tests
- [ ] Test rollback scenarios

**Transaction Management**
- [ ] Implement `UnitOfWork` pattern
- [ ] Track operations across repositories
- [ ] Implement commit/rollback

### Presentation Layer

**Commands** (`presentation/commands/`)
- [ ] Implement `frigg create integration` command
- [ ] Implement `frigg create api-module` command
- [ ] Implement `frigg add api-module` command
- [ ] Wire up to Use Cases via dependency injection
- [ ] Add interactive prompts (@inquirer/prompts)

**Dependency Injection**
- [ ] Create `container.js` for DI setup
- [ ] Register all dependencies
- [ ] Provide factory methods for Use Cases
- [ ] Add pre-flight checks
- [ ] Add tests

**Validation** (`utils/validation.js`)
- [ ] Name validation (integration, module)
- [ ] Version validation
- [ ] Env var validation
- [ ] Add tests

**Templates** (`utils/templates.js`)
- [ ] Set up Handlebars
- [ ] Template loading
- [ ] Variable substitution
- [ ] Add tests

---

### `frigg create integration`

**Command Setup**
- [ ] Create command handler (`commands/create/integration.js`)
- [ ] Set up Commander.js command
- [ ] Add all flags and options
- [ ] Wire up to main CLI

**Interactive Flow**
- [ ] Step 1: Basic information
- [ ] Step 2: Type & configuration
- [ ] Step 3: Entity configuration
- [ ] Step 4: Capabilities
- [ ] Step 5: API module selection
- [ ] Step 6: Environment variables
- [ ] Step 7: Generation

**File Generation**
- [ ] Create integration directory
- [ ] Generate all files from templates
- [ ] Update app-definition.json
- [ ] Update backend.js
- [ ] Update .env.example

**Safety & UX**
- [ ] Git pre-flight check
- [ ] Show planned changes
- [ ] Handle user cancellation
- [ ] Post-operation guidance

---

### `frigg create api-module`

**Command Setup**
- [ ] Create command handler (`commands/create/api-module.js`)
- [ ] Set up Commander.js command
- [ ] Add all flags and options

**Interactive Flow**
- [ ] Step 1: Basic information
- [ ] Step 2: Module type & config
- [ ] Step 3: Boilerplate level
- [ ] Step 4: API module definition
- [ ] Step 5: Dependencies
- [ ] Step 6: Integration association
- [ ] Step 7: Generation

**File Generation**
- [ ] Create module directory
- [ ] Generate files based on boilerplate level
- [ ] Handle TypeScript option
- [ ] Generate tests

**Integration Linking**
- [ ] Update integration files if adding to existing
- [ ] Flow into `frigg create integration` if creating new

---

### `frigg add api-module`

**Command Setup**
- [ ] Create command handler (`commands/add/api-module.js`)

**Module Selection**
- [ ] From npm registry (search and select)
- [ ] Create new local module (flow to `frigg create api-module`)
- [ ] From local workspace (select existing)

**Installation & Updates**
- [ ] Search npm for @friggframework/api-module-*
- [ ] Install selected packages
- [ ] Update package.json
- [ ] List existing integrations
- [ ] Select integration to add to
- [ ] Option to create new integration
- [ ] Add module to Integration.js
- [ ] Update integration definition
- [ ] Update .env.example if needed

---

### Testing & Polish

**Tests**
- [ ] Unit tests for all utilities
- [ ] Integration tests for commands
- [ ] E2E tests for workflows

**Error Handling**
- [ ] Graceful error messages
- [ ] Rollback on failures
- [ ] Clear user guidance

**Documentation**
- [ ] Update README
- [ ] Add usage examples

**UX Polish**
- [ ] Progress indicators
- [ ] Better error messages
- [ ] Consistent formatting

---

## 📊 Success Criteria

### Phase 1 Complete When:

- ✅ `frigg create integration` works end-to-end
- ✅ `frigg create api-module` works end-to-end
- ✅ `frigg add api-module` works end-to-end
- ✅ Git safety checks working
- ✅ File operations atomic and safe
- ✅ Rollback works on failures
- ✅ All core templates implemented
- ✅ Validation catches common errors
- ✅ Post-operation guidance helpful
- ✅ Test coverage >80%

---

## 🎯 Key Implementation Notes

### Do's ✅

- Use atomic file operations (temp + rename)
- Always show what will change before changing it
- Provide clear error messages with solutions
- Use git pre-flight checks
- Make operations idempotent where possible
- Track all operations for rollback
- Validate all inputs before file operations
- Use AST manipulation for backend.js updates
- Follow existing CLI command patterns
- Keep git operations informational only

### Don'ts ❌

- Don't modify files without user confirmation
- Don't auto-commit or auto-create branches
- Don't use regex for complex file updates (use AST)
- Don't leave partial state on errors
- Don't suppress error details
- Don't skip validation steps
- Don't create files in unexpected locations
- Don't assume project structure

---

## 📝 Next Actions

1. **Review specifications** with team
2. **Set up project structure** for new commands
3. **Implement utility modules** (file ops, git safety, validation)
4. **Create templates** for integrations and API modules
5. **Implement `frigg create integration`** command
6. **Implement `frigg create api-module`** command
7. **Implement `frigg add api-module`** command
8. **Write tests** for all new functionality
9. **Update documentation** with new commands
10. **Release beta** for testing

---

## 📚 Reference Documents

- `CLI_SPECIFICATION.md` - Complete command reference
- `CLI_CREATE_COMMANDS_SPEC.md` - Deep dive on create commands
- `CLI_FILE_OPERATIONS_SPEC.md` - File manipulation patterns
- `CLI_GIT_SAFETY_SPEC.md` - Git integration approach
- `/packages/schemas/schemas/integration-definition.schema.json` - Integration schema
- `/packages/schemas/schemas/api-module-definition.schema.json` - API module schema

---

*This roadmap provides a clear path from specification to implementation for the Frigg CLI.*
