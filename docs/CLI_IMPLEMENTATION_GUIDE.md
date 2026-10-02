# Frigg CLI Implementation Guide

## Overview

This guide provides a practical roadmap for implementing the Frigg CLI using DDD/Hexagonal Architecture patterns with git safety checks and transaction-based file operations.

---

## Implementation Phases

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
- File operations utilities (FileSystemAdapter, SchemaValidator, UnitOfWork)
- Git safety utilities (GitSafetyChecker)
- Template engine integration (Handlebars)
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

## Technical Stack

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

## DDD File Structure

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

---

## Git Safety Integration

### Design Philosophy

1. **Non-Invasive** - CLI doesn't modify git state (no commits, branches, stashes)
2. **Informative** - Clearly shows what will be modified
3. **User Choice** - Always gives option to bail out
4. **Safety First** - Warns about potential issues before proceeding

### What CLI Does

✅ **Check git status**
✅ **Warn about uncommitted changes**
✅ **Show which files will be modified/created**
✅ **Give option to cancel and commit first**
✅ **Track created files for informational purposes**

### What CLI Does NOT Do

❌ Create commits
❌ Create branches
❌ Stash changes
❌ Stage files
❌ Modify git state in any way

### GitSafetyChecker Implementation

```javascript
// domain/services/GitSafetyChecker.js

class GitSafetyChecker {
    constructor(gitPort) {
        this.gitPort = gitPort; // Port/Interface to git operations
    }

    /**
     * Check if it's safe to proceed with file operations
     */
    async checkSafety(filesToCreate, filesToModify) {
        const gitStatus = await this.gitPort.getStatus();

        if (!gitStatus.isRepository) {
            return {
                safe: true,
                warnings: ['Not a git repository'],
                requiresConfirmation: false
            };
        }

        const warnings = [];
        let requiresConfirmation = false;

        // Check for uncommitted changes
        if (!gitStatus.isClean) {
            warnings.push(`${gitStatus.uncommittedCount} uncommitted file(s)`);
            requiresConfirmation = true;
        }

        // Check for protected branch
        if (this.isProtectedBranch(gitStatus.branch)) {
            warnings.push(`Working on protected branch: ${gitStatus.branch}`);
        }

        return {
            safe: true,
            warnings,
            requiresConfirmation,
            gitStatus
        };
    }

    isProtectedBranch(branchName) {
        const protected = ['main', 'master', 'production', 'prod'];
        return protected.includes(branchName);
    }
}

module.exports = {GitSafetyChecker};
```

### Integration with Commands

```javascript
// presentation/commands/create/integration.js

async function createIntegrationCommand(name, options) {
    console.log(chalk.bold(`\nCreating integration: ${name}\n`));

    // Determine what files will be affected
    const filesToCreate = [
        `backend/src/integrations/${name}/Integration.js`,
        `backend/src/integrations/${name}/definition.js`,
        // ... more files
    ];

    const filesToModify = [
        'backend/app-definition.json',
        'backend/backend.js',
        'backend/.env.example',
    ];

    // Run pre-flight check (via GitSafetyChecker domain service)
    const useCase = container.get('CreateIntegrationUseCase');

    const safetyResult = await useCase.checkSafety(filesToCreate, filesToModify);

    if (safetyResult.requiresConfirmation) {
        // Display warnings and get user confirmation
        const proceed = await confirmWithWarnings(safetyResult.warnings);

        if (!proceed) {
            console.log(chalk.dim('\nOperation cancelled.'));
            process.exit(0);
        }
    }

    // Proceed with creating integration
    const result = await useCase.execute({name, ...options});

    // Show success and git guidance
    displayPostOperationGuidance(result);
}
```

---

## Implementation Checklist

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

---

## Testing Strategy

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

## Success Criteria

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

## Key Implementation Notes

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

## Next Actions

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

*This implementation guide provides a clear path from specification to working CLI commands.*
