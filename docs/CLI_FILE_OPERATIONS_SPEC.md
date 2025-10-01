# Frigg CLI: Infrastructure & Persistence Specification (DDD/Hexagonal Architecture)

## Overview

This document specifies the infrastructure layer for the Frigg CLI using DDD and Hexagonal Architecture patterns. It defines repository implementations, adapters, and ports that handle persistence of domain entities while keeping domain logic isolated from infrastructure concerns.

**Key Principles:**
- Domain entities are persisted through **Repository interfaces** (ports)
- Repositories are implemented using **Adapters** (FileSystemAdapter, etc.)
- **Use Cases** orchestrate domain operations through repositories
- All file operations are **atomic, transactional, and reversible**
- Infrastructure concerns are **isolated** from domain logic

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Repository Patterns](#repository-patterns)
3. [Infrastructure Adapters](#infrastructure-adapters)
4. [Domain Entity Persistence](#domain-entity-persistence)
5. [Transaction Management](#transaction-management)
6. [Rollback Strategy](#rollback-strategy)
7. [Schema Integration](#schema-integration)
8. [Implementation Examples](#implementation-examples)

---

## Architecture Overview

### Layer Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (Commands)                              │
│  - frigg create integration                                 │
│  - frigg create api-module                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Application Layer (Use Cases)                              │
│  - CreateIntegrationUseCase                                 │
│  - CreateApiModuleUseCase                                   │
│  - UpdateAppDefinitionUseCase                               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Domain Layer                                               │
│  - Entities: Integration, ApiModule, AppDefinition          │
│  - Value Objects: IntegrationName, SemanticVersion          │
│  - Domain Services: IntegrationValidator                    │
│  - Ports (Interfaces): IIntegrationRepository               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Infrastructure Layer (Adapters & Repositories)             │
│  - FileSystemAdapter: atomic file operations                │
│  - IntegrationRepository: persist Integration entities      │
│  - AppDefinitionRepository: persist AppDefinition aggregate │
│  - SchemaValidator: validate against JSON schemas           │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Ports (Domain/Application Layer)**
- Interfaces that define what the domain needs from infrastructure
- Example: `IIntegrationRepository`, `IFileSystemPort`

**Adapters (Infrastructure Layer)**
- Concrete implementations of ports
- Handle actual file system operations
- Example: `FileSystemIntegrationRepository`, `FileSystemAdapter`

**Repositories**
- Provide collection-like interface for domain entities
- Abstract away persistence details
- Handle serialization/deserialization from domain to storage

**Unit of Work**
- Tracks changes to entities during a business transaction
- Ensures all-or-nothing commits with rollback capability

---

## Repository Patterns

### Repository Interfaces (Ports)

Located in: `domain/ports/`

```javascript
// domain/ports/IIntegrationRepository.js
class IIntegrationRepository {
    async save(integration) {
        throw new Error('Not implemented');
    }

    async findById(id) {
        throw new Error('Not implemented');
    }

    async findByName(name) {
        throw new Error('Not implemented');
    }

    async exists(name) {
        throw new Error('Not implemented');
    }

    async list() {
        throw new Error('Not implemented');
    }

    async delete(id) {
        throw new Error('Not implemented');
    }
}

// domain/ports/IAppDefinitionRepository.js
class IAppDefinitionRepository {
    async get() {
        throw new Error('Not implemented');
    }

    async save(appDefinition) {
        throw new Error('Not implemented');
    }

    async addIntegration(integration) {
        throw new Error('Not implemented');
    }

    async removeIntegration(integrationName) {
        throw new Error('Not implemented');
    }
}

// domain/ports/IApiModuleRepository.js
class IApiModuleRepository {
    async save(apiModule) {
        throw new Error('Not implemented');
    }

    async findById(id) {
        throw new Error('Not implemented');
    }

    async findByName(name) {
        throw new Error('Not implemented');
    }

    async exists(name) {
        throw new Error('Not implemented');
    }

    async list() {
        throw new Error('Not implemented');
    }
}
```

### Repository Implementations

Located in: `infrastructure/repositories/`

```javascript
// infrastructure/repositories/FileSystemIntegrationRepository.js
const {IIntegrationRepository} = require('../../domain/ports/IIntegrationRepository');
const {Integration} = require('../../domain/entities/Integration');
const path = require('path');

class FileSystemIntegrationRepository extends IIntegrationRepository {
    constructor(fileSystemAdapter, projectRoot, schemaValidator) {
        super();
        this.fileSystemAdapter = fileSystemAdapter;
        this.projectRoot = projectRoot;
        this.schemaValidator = schemaValidator;
        this.integrationsDir = path.join(projectRoot, 'backend/src/integrations');
    }

    async save(integration) {
        // Validate domain entity
        const validation = integration.validate();
        if (!validation.isValid) {
            throw new Error(`Invalid integration: ${validation.errors.join(', ')}`);
        }

        // Convert domain entity to persistence format
        const integrationData = this._toPersistenceFormat(integration);

        // Validate against schema
        const schemaValidation = await this.schemaValidator.validate(
            'integration-definition',
            integrationData.definition
        );
        if (!schemaValidation.valid) {
            throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
        }

        // Create directory structure
        const integrationPath = path.join(this.integrationsDir, integration.name.value);
        await this.fileSystemAdapter.ensureDirectory(integrationPath);

        // Write files atomically through adapter
        const filesToWrite = [
            {
                path: path.join(integrationPath, 'Integration.js'),
                content: integrationData.classFile
            },
            {
                path: path.join(integrationPath, 'definition.js'),
                content: integrationData.definitionFile
            },
            {
                path: path.join(integrationPath, 'integration-definition.json'),
                content: JSON.stringify(integrationData.definition, null, 2)
            },
            {
                path: path.join(integrationPath, 'config.json'),
                content: JSON.stringify(integrationData.config, null, 2)
            },
            {
                path: path.join(integrationPath, 'README.md'),
                content: integrationData.readme
            }
        ];

        for (const file of filesToWrite) {
            await this.fileSystemAdapter.writeFile(file.path, file.content);
        }

        return integration;
    }

    async findByName(name) {
        const integrationPath = path.join(this.integrationsDir, name);

        if (!await this.fileSystemAdapter.exists(integrationPath)) {
            return null;
        }

        // Read files
        const definitionPath = path.join(integrationPath, 'integration-definition.json');
        const definitionContent = await this.fileSystemAdapter.readFile(definitionPath);
        const definition = JSON.parse(definitionContent);

        // Reconstruct domain entity from persistence format
        return this._toDomainEntity(definition);
    }

    async exists(name) {
        const integrationPath = path.join(this.integrationsDir, name);
        return await this.fileSystemAdapter.exists(integrationPath);
    }

    async list() {
        const integrationDirs = await this.fileSystemAdapter.listDirectories(this.integrationsDir);
        const integrations = [];

        for (const dirName of integrationDirs) {
            const integration = await this.findByName(dirName);
            if (integration) {
                integrations.push(integration);
            }
        }

        return integrations;
    }

    _toPersistenceFormat(integration) {
        // Convert domain entity to file structure
        return {
            classFile: this._generateIntegrationClass(integration),
            definitionFile: this._generateDefinitionFile(integration),
            definition: integration.toJSON(),
            config: integration.config,
            readme: this._generateReadme(integration)
        };
    }

    _toDomainEntity(persistenceData) {
        // Reconstruct domain entity from persistence
        return new Integration({
            id: persistenceData.id,
            name: persistenceData.name,
            displayName: persistenceData.displayName,
            description: persistenceData.description,
            type: persistenceData.type,
            entities: persistenceData.entities,
            apiModules: persistenceData.apiModules
        });
    }

    _generateIntegrationClass(integration) {
        // Template generation logic - delegates to template service
        return `// Generated Integration.js for ${integration.name.value}`;
    }

    _generateDefinitionFile(integration) {
        return `// Generated definition.js for ${integration.name.value}`;
    }

    _generateReadme(integration) {
        return `# ${integration.displayName}\n\n${integration.description}`;
    }
}

module.exports = {FileSystemIntegrationRepository};
```

---

## Infrastructure Adapters

### FileSystemAdapter (Low-level Operations)

Located in: `infrastructure/adapters/FileSystemAdapter.js`

This adapter provides atomic file operations with transaction support:

```javascript
const fs = require('fs-extra');
const path = require('path');

class FileSystemAdapter {
    constructor() {
        this.operations = []; // Track for rollback
    }

    /**
     * Write file atomically (temp file + rename)
     */
    async writeFile(filePath, content) {
        const tempPath = `${filePath}.tmp.${Date.now()}`;

        try {
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, filePath);

            this.operations.push({
                type: 'create',
                path: filePath,
                backup: null
            });

            return {success: true, path: filePath};
        } catch (error) {
            // Clean up temp file
            if (await fs.pathExists(tempPath)) {
                await fs.unlink(tempPath);
            }
            throw error;
        }
    }

    /**
     * Update file atomically (backup + write + verify)
     */
    async updateFile(filePath, updateFn) {
        const backupPath = `${filePath}.backup.${Date.now()}`;

        try {
            // Create backup if file exists
            if (await fs.pathExists(filePath)) {
                await fs.copy(filePath, backupPath);
            }

            // Read current content
            const currentContent = await fs.pathExists(filePath)
                ? await fs.readFile(filePath, 'utf-8')
                : '';

            // Apply update
            const newContent = await updateFn(currentContent);

            // Write to temp, then rename
            const tempPath = `${filePath}.tmp.${Date.now()}`;
            await fs.writeFile(tempPath, newContent, 'utf-8');
            await fs.rename(tempPath, filePath);

            this.operations.push({
                type: 'update',
                path: filePath,
                backup: backupPath
            });

            return {success: true, path: filePath};
        } catch (error) {
            // Restore from backup
            if (await fs.pathExists(backupPath)) {
                await fs.copy(backupPath, filePath);
            }
            throw error;
        }
    }

    async readFile(filePath) {
        return await fs.readFile(filePath, 'utf-8');
    }

    async exists(filePath) {
        return await fs.pathExists(filePath);
    }

    async ensureDirectory(dirPath) {
        if (!await fs.pathExists(dirPath)) {
            await fs.ensureDir(dirPath);

            this.operations.push({
                type: 'mkdir',
                path: dirPath,
                backup: null
            });
        }

        return {exists: true};
    }

    async listDirectories(dirPath) {
        const entries = await fs.readdir(dirPath, {withFileTypes: true});
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    }

    /**
     * Rollback all operations in reverse order
     */
    async rollback() {
        const errors = [];

        for (const op of this.operations.reverse()) {
            try {
                switch (op.type) {
                    case 'create':
                        if (await fs.pathExists(op.path)) {
                            await fs.unlink(op.path);
                        }
                        break;

                    case 'update':
                        if (op.backup && await fs.pathExists(op.backup)) {
                            await fs.copy(op.backup, op.path);
                        }
                        break;

                    case 'mkdir':
                        if (await fs.pathExists(op.path)) {
                            const files = await fs.readdir(op.path);
                            if (files.length === 0) {
                                await fs.rmdir(op.path);
                            }
                        }
                        break;
                }
            } catch (error) {
                errors.push({operation: op, error});
            }
        }

        return {success: errors.length === 0, errors};
    }

    /**
     * Commit operations (clean up backups)
     */
    async commit() {
        for (const op of this.operations) {
            if (op.backup && await fs.pathExists(op.backup)) {
                await fs.unlink(op.backup);
            }
        }

        this.operations = [];
    }
}

module.exports = {FileSystemAdapter};
```

### SchemaValidator (Leverages schemas package)

Located in: `infrastructure/adapters/SchemaValidator.js`

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('path');
const fs = require('fs-extra');

class SchemaValidator {
    constructor(schemasPath) {
        this.schemasPath = schemasPath || path.join(__dirname, '../../../schemas/schemas');
        this.ajv = new Ajv({allErrors: true, strict: false});
        addFormats(this.ajv);
        this.schemas = new Map();
    }

    async loadSchema(schemaName) {
        if (this.schemas.has(schemaName)) {
            return this.schemas.get(schemaName);
        }

        const schemaPath = path.join(this.schemasPath, `${schemaName}.schema.json`);
        const schemaContent = await fs.readFile(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        const validate = this.ajv.compile(schema);
        this.schemas.set(schemaName, validate);

        return validate;
    }

    async validate(schemaName, data) {
        const validate = await this.loadSchema(schemaName);
        const valid = validate(data);

        if (!valid) {
            return {
                valid: false,
                errors: validate.errors.map(err =>
                    `${err.instancePath || '/'} ${err.message}`
                )
            };
        }

        return {valid: true, errors: []};
    }
}

module.exports = {SchemaValidator};
```

---

## Domain Entity Persistence

### How Entities Map to File Structure

**Integration Entity** → Multiple files in `backend/src/integrations/<name>/`
- Integration.js (class file)
- definition.js (module definition)
- integration-definition.json (schema-compliant JSON)
- config.json (configuration)
- README.md (documentation)

**ApiModule Entity** → Multiple files in `backend/src/api-modules/<name>/`
- index.js (exports)
- api.js (API class)
- definition.js (module definition)
- package.json (npm metadata)
- tests/ (test suite)

**AppDefinition Aggregate** → Single file `backend/app-definition.json`
- Contains references to all integrations
- Updated when integrations are added/removed

### Repository Pattern Benefits

1. **Isolation**: Domain doesn't know about file system
2. **Testability**: Mock repositories for unit tests
3. **Flexibility**: Swap FileSystem for Database later
4. **Validation**: Schema validation at persistence boundary
5. **Transactions**: All-or-nothing operations with rollback

---

## Transaction Management

### Unit of Work Pattern

Located in: `infrastructure/UnitOfWork.js`

```javascript
class UnitOfWork {
    constructor(fileSystemAdapter) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.repositories = new Map();
    }

    registerRepository(name, repository) {
        this.repositories.set(name, repository);
    }

    async commit() {
        try {
            await this.fileSystemAdapter.commit();
            return {success: true};
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    async rollback() {
        return await this.fileSystemAdapter.rollback();
    }
}
```

### Use Case Transaction Example

```javascript
// application/use-cases/CreateIntegrationUseCase.js
class CreateIntegrationUseCase {
    constructor(integrationRepository, appDefinitionRepository, unitOfWork) {
        this.integrationRepository = integrationRepository;
        this.appDefinitionRepository = appDefinitionRepository;
        this.unitOfWork = unitOfWork;
    }

    async execute(request) {
        try {
            // 1. Create domain entity
            const integration = Integration.create(request);

            // 2. Validate
            const validation = integration.validate();
            if (!validation.isValid) {
                throw new ValidationException(validation.errors);
            }

            // 3. Save through repository (tracked by UnitOfWork)
            await this.integrationRepository.save(integration);

            // 4. Update app definition aggregate
            const appDef = await this.appDefinitionRepository.get();
            appDef.addIntegration(integration);
            await this.appDefinitionRepository.save(appDef);

            // 5. Commit transaction
            await this.unitOfWork.commit();

            return {success: true, integration: integration.toObject()};
        } catch (error) {
            // Rollback all changes
            await this.unitOfWork.rollback();
            throw error;
        }
    }
}
```

---

## Rollback Strategy

### Rollback Scenarios

1. **Validation Failure**: Rollback before any writes
2. **Schema Validation Failure**: Rollback after detecting invalid schema
3. **Partial Write Failure**: Rollback all written files
4. **AppDefinition Update Failure**: Rollback integration files

### Automatic Rollback in FileSystemAdapter

The `FileSystemAdapter` tracks all operations and can rollback in reverse order:

```javascript
// Automatic rollback on error
try {
    await fileSystemAdapter.writeFile('file1.js', content1);
    await fileSystemAdapter.writeFile('file2.js', content2);
    await fileSystemAdapter.updateFile('app-definition.json', updateFn);
    throw new Error('Simulated failure');
} catch (error) {
    // All operations automatically rolled back
    await fileSystemAdapter.rollback();
    // file1.js deleted
    // file2.js deleted
    // app-definition.json restored from backup
}
```

---

## Schema Integration

### Leveraging the schemas Package

The CLI **MUST** use schemas from `/packages/schemas/schemas/` rather than recreating validation:

```javascript
// ❌ WRONG - Don't recreate schema validation
const validateIntegration = (data) => {
    if (!data.name || data.name.length < 2) {
        return {valid: false, message: 'Name too short'};
    }
    // ... manual validation
};

// ✅ CORRECT - Use SchemaValidator with schemas package
const schemaValidator = new SchemaValidator('/packages/schemas/schemas');
const result = await schemaValidator.validate('integration-definition', data);
if (!result.valid) {
    throw new Error(result.errors.join(', '));
}
```

### Available Schemas

| Schema | Location | Purpose |
|--------|----------|---------|
| `integration-definition` | `integration-definition.schema.json` | ✅ Validate Integration entities |
| `app-definition` | `app-definition.schema.json` | ✅ Validate AppDefinition aggregate |
| `api-module-definition` | `api-module-definition.schema.json` | ❌ **Needs creation** |
| `api-module-package` | `api-module-package.schema.json` | ❌ **Needs creation** |

---

## Implementation Examples

### Example 1: Complete Use Case Flow

```javascript
// Dependency injection setup
const container = {
    fileSystemAdapter: new FileSystemAdapter(),
    schemaValidator: new SchemaValidator('/packages/schemas/schemas'),
    integrationRepository: new FileSystemIntegrationRepository(
        container.fileSystemAdapter,
        '/project/root',
        container.schemaValidator
    ),
    appDefinitionRepository: new FileSystemAppDefinitionRepository(
        container.fileSystemAdapter,
        '/project/root',
        container.schemaValidator
    ),
    unitOfWork: new UnitOfWork(container.fileSystemAdapter),
    createIntegrationUseCase: new CreateIntegrationUseCase(
        container.integrationRepository,
        container.appDefinitionRepository,
        container.unitOfWork
    )
};

// Execute use case
const result = await container.createIntegrationUseCase.execute({
    name: 'salesforce-sync',
    displayName: 'Salesforce Sync',
    description: 'Sync contacts with Salesforce',
    type: 'sync',
    entities: {...}
});
```

### Example 2: Testing with Mock Repositories

```javascript
// Test with in-memory repository
class InMemoryIntegrationRepository extends IIntegrationRepository {
    constructor() {
        super();
        this.integrations = new Map();
    }

    async save(integration) {
        this.integrations.set(integration.name.value, integration);
        return integration;
    }

    async findByName(name) {
        return this.integrations.get(name) || null;
    }

    async exists(name) {
        return this.integrations.has(name);
    }
}

// Test use case without file system
test('creates integration successfully', async () => {
    const mockRepo = new InMemoryIntegrationRepository();
    const useCase = new CreateIntegrationUseCase(mockRepo, ...);

    const result = await useCase.execute({name: 'test-integration'});

    expect(result.success).toBe(true);
    expect(await mockRepo.exists('test-integration')).toBe(true);
});
```

---

## Summary

### DDD/Hexagonal Benefits for CLI

1. **Testability**: Mock repositories, no file system in tests
2. **Maintainability**: Clear separation of concerns
3. **Flexibility**: Swap FileSystem for Database/Cloud storage
4. **Schema-First**: Leverage schemas package for validation
5. **Transaction Safety**: Atomic operations with rollback
6. **Domain Focus**: Business logic isolated from infrastructure

### Key Differences from Previous Approach

| Old Approach | New DDD Approach |
|--------------|------------------|
| Direct file operations in commands | Commands call Use Cases |
| File utilities mixed with logic | Repositories handle persistence |
| Manual validation | Schema validation at boundary |
| Ad-hoc rollback | Automatic transaction rollback |
| Tight coupling to file system | Ports/Adapters isolation |

### Dependencies Required

```json
{
  "dependencies": {
    "fs-extra": "^11.2.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^3.0.1"
  }
}
```

### File Structure

```
packages/devtools/frigg-cli/
├── domain/
│   ├── entities/           # Integration, ApiModule, AppDefinition
│   ├── value-objects/      # IntegrationName, SemanticVersion
│   ├── services/           # IntegrationValidator, GitSafetyChecker
│   └── ports/              # IIntegrationRepository, IFileSystemPort
├── application/
│   └── use-cases/          # CreateIntegrationUseCase, etc.
├── infrastructure/
│   ├── adapters/           # FileSystemAdapter, SchemaValidator
│   ├── repositories/       # FileSystem implementations
│   └── UnitOfWork.js       # Transaction coordinator
└── presentation/
    └── commands/           # CLI command handlers
```

---

*This specification ensures the Frigg CLI follows DDD and Hexagonal Architecture principles while leveraging the schemas package for validation.*
