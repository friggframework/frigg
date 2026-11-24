# Frigg CLI: DDD & Hexagonal Architecture

## Overview

The Frigg CLI follows Domain-Driven Design (DDD) principles and Hexagonal Architecture (Ports & Adapters) to ensure clean separation of concerns, testability, and maintainability.

**Key Principles:**
- Domain entities are persisted through **Repository interfaces** (ports)
- Repositories are implemented using **Adapters** (FileSystemAdapter, etc.)
- **Use Cases** orchestrate domain operations through repositories
- All file operations are **atomic, transactional, and reversible**
- Infrastructure concerns are **isolated** from domain logic

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  (CLI Commands, Prompts, Output Formatting)                 │
│                                                              │
│  - CommandHandlers (create, add, config, etc.)             │
│  - Interactive Prompts (inquirer)                           │
│  - Output Formatters (chalk, console)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Uses
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  (Use Cases, Application Services)                          │
│                                                              │
│  - CreateIntegrationUseCase                                 │
│  - CreateApiModuleUseCase                                   │
│  - AddApiModuleUseCase                                      │
│  - ApplicationServices (orchestration)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Uses
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  (Business Logic, Domain Models, Domain Services)           │
│                                                              │
│  Domain Models:                                             │
│  - Integration (Entity)                                     │
│  - ApiModule (Entity)                                       │
│  - AppDefinition (Aggregate Root)                           │
│  - Environment (Value Object)                               │
│  - IntegrationName (Value Object)                           │
│                                                              │
│  Domain Services:                                           │
│  - IntegrationValidator                                     │
│  - ApiModuleValidator                                       │
│  - GitSafetyChecker (Domain Service)                        │
│                                                              │
│  Repositories (Interfaces):                                 │
│  - IIntegrationRepository                                   │
│  - IApiModuleRepository                                     │
│  - IAppDefinitionRepository                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Depends on (via Ports)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                        │
│  (Adapters, External Systems)                               │
│                                                              │
│  Repositories (Implementations):                            │
│  - FileSystemIntegrationRepository                          │
│  - FileSystemApiModuleRepository                            │
│  - FileSystemAppDefinitionRepository                        │
│                                                              │
│  Adapters:                                                  │
│  - FileSystemAdapter                                        │
│  - GitAdapter                                               │
│  - NpmAdapter                                               │
│  - TemplateAdapter (Handlebars)                            │
│                                                              │
│  External Services:                                         │
│  - FileOperations (atomic writes)                           │
│  - GitOperations (status, checks)                           │
│  - NpmRegistry (search, install)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Domain Layer

### Domain Models (Entities & Value Objects)

#### Integration (Entity)

```javascript
// domain/entities/Integration.js

class Integration {
    constructor(props) {
        this.id = props.id; // IntegrationId value object
        this.name = props.name; // IntegrationName value object
        this.displayName = props.displayName;
        this.description = props.description;
        this.type = props.type; // IntegrationType value object
        this.category = props.category;
        this.entities = props.entities; // Map of EntityConfig
        this.options = props.options;
        this.capabilities = props.capabilities;
        this.apiModules = props.apiModules || []; // Array of ApiModuleReference
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
    }

    /**
     * Add an API module to this integration
     */
    addApiModule(apiModule) {
        if (this.hasApiModule(apiModule.name)) {
            throw new DomainException(`API module ${apiModule.name} already exists`);
        }

        this.apiModules.push({
            name: apiModule.name,
            version: apiModule.version,
            source: apiModule.source // 'npm' | 'local'
        });

        this.updatedAt = new Date();
    }

    /**
     * Check if integration has specific API module
     */
    hasApiModule(moduleName) {
        return this.apiModules.some(m => m.name === moduleName);
    }

    /**
     * Validate integration completeness
     */
    validate() {
        const errors = [];

        if (!this.name.isValid()) {
            errors.push('Invalid integration name');
        }

        if (!this.displayName || this.displayName.length === 0) {
            errors.push('Display name is required');
        }

        if (this.entities.size === 0 && this.options.requiresNewEntity) {
            errors.push('At least one entity is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Convert to plain object for persistence
     */
    toObject() {
        return {
            id: this.id.value,
            name: this.name.value,
            displayName: this.displayName,
            description: this.description,
            type: this.type.value,
            category: this.category,
            entities: Array.from(this.entities.entries()),
            options: this.options,
            capabilities: this.capabilities,
            apiModules: this.apiModules,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Create from plain object
     */
    static fromObject(obj) {
        return new Integration({
            id: IntegrationId.fromString(obj.id),
            name: IntegrationName.fromString(obj.name),
            displayName: obj.displayName,
            description: obj.description,
            type: IntegrationType.fromString(obj.type),
            category: obj.category,
            entities: new Map(obj.entities),
            options: obj.options,
            capabilities: obj.capabilities,
            apiModules: obj.apiModules,
            createdAt: new Date(obj.createdAt),
            updatedAt: new Date(obj.updatedAt)
        });
    }
}

module.exports = {Integration};
```

#### Value Objects

```javascript
// domain/value-objects/IntegrationName.js

class IntegrationName {
    constructor(value) {
        if (!this.isValidFormat(value)) {
            throw new DomainException('Invalid integration name format');
        }
        this._value = value;
    }

    get value() {
        return this._value;
    }

    isValidFormat(name) {
        // Kebab-case, 2-100 chars
        return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) &&
               name.length >= 2 &&
               name.length <= 100 &&
               !name.includes('--');
    }

    isValid() {
        return this.isValidFormat(this._value);
    }

    equals(other) {
        return other instanceof IntegrationName &&
               this._value === other._value;
    }

    static fromString(str) {
        return new IntegrationName(str);
    }

    toString() {
        return this._value;
    }
}

module.exports = {IntegrationName};
```

### Domain Services

#### IntegrationValidator

```javascript
// domain/services/IntegrationValidator.js

class IntegrationValidator {
    constructor(integrationRepository) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Validate integration name is unique
     */
    async validateUniqueName(name) {
        const existing = await this.integrationRepository.findByName(name);
        if (existing) {
            throw new DomainException(`Integration with name "${name.value}" already exists`);
        }
    }

    /**
     * Validate integration can be created
     */
    async validateForCreation(integration) {
        const errors = [];

        // Name validation
        if (!integration.name.isValid()) {
            errors.push('Invalid integration name format');
        }

        // Check uniqueness
        try {
            await this.validateUniqueName(integration.name);
        } catch (e) {
            errors.push(e.message);
        }

        // Domain validation
        const domainValidation = integration.validate();
        errors.push(...domainValidation.errors);

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = {IntegrationValidator};
```

---

## Application Layer

### Use Cases

#### CreateIntegrationUseCase

```javascript
// application/use-cases/CreateIntegrationUseCase.js

class CreateIntegrationUseCase {
    constructor(dependencies) {
        this.integrationRepository = dependencies.integrationRepository;
        this.appDefinitionRepository = dependencies.appDefinitionRepository;
        this.integrationValidator = dependencies.integrationValidator;
        this.gitSafetyChecker = dependencies.gitSafetyChecker;
        this.templateAdapter = dependencies.templateAdapter;
        this.fileSystemAdapter = dependencies.fileSystemAdapter;
    }

    async execute(request) {
        // 1. Create domain model from request
        const integration = this.createIntegrationFromRequest(request);

        // 2. Validate
        const validation = await this.integrationValidator.validateForCreation(integration);
        if (!validation.isValid) {
            throw new ValidationException(validation.errors);
        }

        // 3. Check git safety
        const filesToCreate = this.getFilesToCreate(integration);
        const filesToModify = this.getFilesToModify();

        const safetyCheck = await this.gitSafetyChecker.checkSafety(
            filesToCreate,
            filesToModify
        );

        if (safetyCheck.requiresConfirmation) {
            // Return for presentation layer to handle confirmation
            return {
                requiresConfirmation: true,
                warnings: safetyCheck.warnings,
                filesToCreate,
                filesToModify
            };
        }

        // 4. Generate files from templates
        const files = await this.generateIntegrationFiles(integration);

        // 5. Save integration (creates files, updates app definition)
        await this.integrationRepository.save(integration);

        // 6. Update app definition
        const appDef = await this.appDefinitionRepository.load();
        appDef.addIntegration(integration);
        await this.appDefinitionRepository.save(appDef);

        return {
            success: true,
            integration: integration.toObject(),
            filesCreated: files.created,
            filesModified: files.modified
        };
    }

    createIntegrationFromRequest(request) {
        return new Integration({
            id: IntegrationId.generate(),
            name: IntegrationName.fromString(request.name),
            displayName: request.displayName,
            description: request.description,
            type: IntegrationType.fromString(request.type),
            category: request.category,
            entities: new Map(Object.entries(request.entities || {})),
            options: request.options,
            capabilities: request.capabilities
        });
    }

    getFilesToCreate(integration) {
        return [
            `backend/src/integrations/${integration.name.value}/Integration.js`,
            `backend/src/integrations/${integration.name.value}/definition.js`,
            `backend/src/integrations/${integration.name.value}/integration-definition.json`,
            `backend/src/integrations/${integration.name.value}/config.json`,
            `backend/src/integrations/${integration.name.value}/README.md`,
            `backend/src/integrations/${integration.name.value}/.env.example`,
            `backend/src/integrations/${integration.name.value}/tests/integration.test.js`,
        ];
    }

    getFilesToModify() {
        return [
            'backend/app-definition.json',
            'backend/backend.js',
            'backend/.env.example'
        ];
    }

    async generateIntegrationFiles(integration) {
        const templates = [
            'Integration.js',
            'definition.js',
            'integration-definition.json',
            'config.json',
            'README.md',
            '.env.example'
        ];

        const created = [];

        for (const template of templates) {
            const content = await this.templateAdapter.render(
                `integration/${template}`,
                integration.toObject()
            );

            const filePath = `backend/src/integrations/${integration.name.value}/${template}`;
            await this.fileSystemAdapter.writeFile(filePath, content);
            created.push(filePath);
        }

        return {created, modified: []};
    }
}

module.exports = {CreateIntegrationUseCase};
```

---

## Infrastructure Layer (Ports & Adapters)

### Repository Implementations

#### FileSystemIntegrationRepository

```javascript
// infrastructure/repositories/FileSystemIntegrationRepository.js

class FileSystemIntegrationRepository {
    constructor(fileSystemAdapter, projectRoot, schemaValidator) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.projectRoot = projectRoot;
        this.schemaValidator = schemaValidator;
        this.basePath = 'backend/src/integrations';
    }

    /**
     * Save integration (creates files on disk)
     */
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
        const integrationPath = path.join(this.basePath, integration.name.value);
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

    /**
     * Find integration by name
     */
    async findByName(name) {
        const integrationPath = `${this.basePath}/${name.value}`;
        const exists = await this.fileSystemAdapter.directoryExists(integrationPath);

        if (!exists) {
            return null;
        }

        // Load integration from definition file
        const definitionPath = `${integrationPath}/integration-definition.json`;
        const content = await this.fileSystemAdapter.readFile(definitionPath);
        const data = JSON.parse(content);

        return Integration.fromObject(data);
    }

    /**
     * List all integrations
     */
    async findAll() {
        const directories = await this.fileSystemAdapter.listDirectories(this.basePath);
        const integrations = [];

        for (const dir of directories) {
            const name = IntegrationName.fromString(dir);
            const integration = await this.findByName(name);
            if (integration) {
                integrations.push(integration);
            }
        }

        return integrations;
    }

    /**
     * Delete integration
     */
    async delete(name) {
        const integrationPath = `${this.basePath}/${name.value}`;
        await this.fileSystemAdapter.removeDirectory(integrationPath);
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
}

module.exports = {FileSystemIntegrationRepository};
```

### Adapters (Implementations of Ports)

#### FileSystemAdapter

```javascript
// infrastructure/adapters/FileSystemAdapter.js

const fs = require('fs-extra');
const path = require('path');

class FileSystemAdapter {
    constructor(baseDirectory = process.cwd()) {
        this.baseDirectory = baseDirectory;
        this.operations = []; // Track for rollback
    }

    /**
     * Write file atomically (temp file + rename)
     */
    async writeFile(filePath, content) {
        const fullPath = path.join(this.baseDirectory, filePath);
        const tempPath = `${fullPath}.tmp.${Date.now()}`;

        try {
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, fullPath);

            this.operations.push({
                type: 'create',
                path: fullPath,
                backup: null
            });

            return {success: true, path: fullPath};
        } catch (error) {
            // Clean up temp file on error
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
        const fullPath = path.join(this.baseDirectory, filePath);
        const backupPath = `${fullPath}.backup.${Date.now()}`;

        try {
            // Create backup if file exists
            if (await fs.pathExists(fullPath)) {
                await fs.copy(fullPath, backupPath);
            }

            // Read current content
            const currentContent = await fs.pathExists(fullPath)
                ? await fs.readFile(fullPath, 'utf-8')
                : '';

            // Apply update
            const newContent = await updateFn(currentContent);

            // Write to temp, then rename
            const tempPath = `${fullPath}.tmp.${Date.now()}`;
            await fs.writeFile(tempPath, newContent, 'utf-8');
            await fs.rename(tempPath, fullPath);

            this.operations.push({
                type: 'update',
                path: fullPath,
                backup: backupPath
            });

            return {success: true, path: fullPath};
        } catch (error) {
            // Restore from backup
            if (await fs.pathExists(backupPath)) {
                await fs.copy(backupPath, fullPath);
            }
            throw error;
        }
    }

    async readFile(filePath) {
        const fullPath = path.join(this.baseDirectory, filePath);
        return await fs.readFile(fullPath, 'utf-8');
    }

    async fileExists(filePath) {
        const fullPath = path.join(this.baseDirectory, filePath);
        return await fs.pathExists(fullPath);
    }

    async ensureDirectory(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);

        if (!await fs.pathExists(fullPath)) {
            await fs.ensureDir(fullPath);

            this.operations.push({
                type: 'mkdir',
                path: fullPath,
                backup: null
            });
        }

        return {exists: true};
    }

    async directoryExists(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);
        return await fs.pathExists(fullPath);
    }

    async listDirectories(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);

        if (!await fs.pathExists(fullPath)) {
            return [];
        }

        const entries = await fs.readdir(fullPath, {withFileTypes: true});
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    }

    async removeDirectory(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);
        await fs.remove(fullPath);
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

#### SchemaValidator

```javascript
// infrastructure/adapters/SchemaValidator.js

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

## Transaction Management

### Unit of Work Pattern

```javascript
// infrastructure/UnitOfWork.js

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

module.exports = {UnitOfWork};
```

---

## Dependency Injection

### Container Setup

```javascript
// infrastructure/container.js

const {Container} = require('./Container');

// Domain
const {IntegrationValidator} = require('../domain/services/IntegrationValidator');
const {GitSafetyChecker} = require('../domain/services/GitSafetyChecker');

// Application
const {CreateIntegrationUseCase} = require('../application/use-cases/CreateIntegrationUseCase');
const {CreateApiModuleUseCase} = require('../application/use-cases/CreateApiModuleUseCase');

// Infrastructure
const {FileSystemIntegrationRepository} = require('../infrastructure/repositories/FileSystemIntegrationRepository');
const {FileSystemAdapter} = require('../infrastructure/adapters/FileSystemAdapter');
const {GitAdapter} = require('../infrastructure/adapters/GitAdapter');
const {TemplateAdapter} = require('../infrastructure/adapters/TemplateAdapter');

class DependencyContainer {
    constructor() {
        this.container = new Container();
        this.registerDependencies();
    }

    registerDependencies() {
        // Adapters
        this.container.register('fileSystemAdapter', () => new FileSystemAdapter());
        this.container.register('gitAdapter', () => new GitAdapter());
        this.container.register('templateAdapter', () => new TemplateAdapter());

        // Repositories
        this.container.register('integrationRepository', (c) =>
            new FileSystemIntegrationRepository(
                c.resolve('fileSystemAdapter'),
                c.resolve('templateAdapter')
            )
        );

        // Domain Services
        this.container.register('integrationValidator', (c) =>
            new IntegrationValidator(c.resolve('integrationRepository'))
        );

        this.container.register('gitSafetyChecker', (c) =>
            new GitSafetyChecker(c.resolve('gitAdapter'))
        );

        // Use Cases
        this.container.register('createIntegrationUseCase', (c) =>
            new CreateIntegrationUseCase({
                integrationRepository: c.resolve('integrationRepository'),
                appDefinitionRepository: c.resolve('appDefinitionRepository'),
                integrationValidator: c.resolve('integrationValidator'),
                gitSafetyChecker: c.resolve('gitSafetyChecker'),
                templateAdapter: c.resolve('templateAdapter'),
                fileSystemAdapter: c.resolve('fileSystemAdapter')
            })
        );
    }

    resolve(name) {
        return this.container.resolve(name);
    }
}

module.exports = {DependencyContainer};
```

---

## Summary

### Benefits of This Architecture

1. **Testability** - Domain logic isolated from infrastructure
2. **Flexibility** - Easy to swap adapters (file system → database)
3. **Maintainability** - Clear separation of concerns
4. **Domain Focus** - Business logic in domain layer, pure
5. **Dependency Inversion** - Domain doesn't depend on infrastructure

### Key Principles Applied

- ✅ **Domain-Driven Design** - Rich domain models with behavior
- ✅ **Hexagonal Architecture** - Ports & adapters pattern
- ✅ **Dependency Injection** - Constructor injection throughout
- ✅ **Repository Pattern** - Abstract data access
- ✅ **Use Case Pattern** - One use case per business operation
- ✅ **Value Objects** - Immutable, validated values
- ✅ **Aggregates** - AppDefinition as aggregate root

---

*This architecture ensures the Frigg CLI is maintainable, testable, and follows modern software design principles.*
