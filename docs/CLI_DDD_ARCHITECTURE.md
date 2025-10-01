# Frigg CLI: DDD & Hexagonal Architecture

## Overview

The Frigg CLI follows Domain-Driven Design (DDD) principles and Hexagonal Architecture (Ports & Adapters) to ensure clean separation of concerns, testability, and maintainability.

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

#### 1. Integration (Entity)

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

#### 2. ApiModule (Entity)

```javascript
// domain/entities/ApiModule.js

class ApiModule {
    constructor(props) {
        this.id = props.id; // ApiModuleId value object
        this.name = props.name; // ApiModuleName value object
        this.displayName = props.displayName;
        this.description = props.description;
        this.version = props.version; // SemanticVersion value object
        this.type = props.type; // ApiModuleType value object
        this.authType = props.authType;
        this.source = props.source; // 'npm' | 'local'
        this.dependencies = props.dependencies || [];
        this.environmentVariables = props.environmentVariables || [];
        this.createdAt = props.createdAt || new Date();
    }

    /**
     * Add environment variable requirement
     */
    requireEnvironmentVariable(envVar) {
        if (this.hasEnvironmentVariable(envVar.name)) {
            throw new DomainException(`Environment variable ${envVar.name} already exists`);
        }

        this.environmentVariables.push(envVar);
    }

    /**
     * Check if has environment variable
     */
    hasEnvironmentVariable(name) {
        return this.environmentVariables.some(ev => ev.name === name);
    }

    /**
     * Validate module
     */
    validate() {
        const errors = [];

        if (!this.name.isValid()) {
            errors.push('Invalid API module name');
        }

        if (!this.version.isValid()) {
            errors.push('Invalid version');
        }

        if (!this.displayName || this.displayName.length === 0) {
            errors.push('Display name is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    toObject() {
        return {
            id: this.id.value,
            name: this.name.value,
            displayName: this.displayName,
            description: this.description,
            version: this.version.toString(),
            type: this.type.value,
            authType: this.authType,
            source: this.source,
            dependencies: this.dependencies,
            environmentVariables: this.environmentVariables,
            createdAt: this.createdAt
        };
    }

    static fromObject(obj) {
        return new ApiModule({
            id: ApiModuleId.fromString(obj.id),
            name: ApiModuleName.fromString(obj.name),
            displayName: obj.displayName,
            description: obj.description,
            version: SemanticVersion.fromString(obj.version),
            type: ApiModuleType.fromString(obj.type),
            authType: obj.authType,
            source: obj.source,
            dependencies: obj.dependencies,
            environmentVariables: obj.environmentVariables,
            createdAt: new Date(obj.createdAt)
        });
    }
}

module.exports = {ApiModule};
```

#### 3. AppDefinition (Aggregate Root)

```javascript
// domain/aggregates/AppDefinition.js

class AppDefinition {
    constructor(props) {
        this.name = props.name;
        this.version = props.version;
        this.integrations = props.integrations || []; // Array of Integration
        this.configuration = props.configuration || {};
    }

    /**
     * Add integration to app definition
     */
    addIntegration(integration) {
        if (this.hasIntegration(integration.name)) {
            throw new DomainException(`Integration ${integration.name.value} already exists`);
        }

        integration.validate();
        this.integrations.push(integration);
    }

    /**
     * Find integration by name
     */
    findIntegration(name) {
        return this.integrations.find(i => i.name.equals(name));
    }

    /**
     * Check if has integration
     */
    hasIntegration(name) {
        return this.integrations.some(i => i.name.equals(name));
    }

    /**
     * Remove integration
     */
    removeIntegration(name) {
        const index = this.integrations.findIndex(i => i.name.equals(name));
        if (index === -1) {
            throw new DomainException(`Integration ${name.value} not found`);
        }

        this.integrations.splice(index, 1);
    }

    /**
     * Get all integrations
     */
    getIntegrations() {
        return [...this.integrations];
    }

    toObject() {
        return {
            name: this.name,
            version: this.version,
            integrations: this.integrations.map(i => i.toObject()),
            configuration: this.configuration
        };
    }

    static fromObject(obj) {
        return new AppDefinition({
            name: obj.name,
            version: obj.version,
            integrations: obj.integrations.map(i => Integration.fromObject(i)),
            configuration: obj.configuration
        });
    }
}

module.exports = {AppDefinition};
```

### Value Objects

#### IntegrationName

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

#### SemanticVersion

```javascript
// domain/value-objects/SemanticVersion.js

class SemanticVersion {
    constructor(major, minor, patch, prerelease = null) {
        this.major = major;
        this.minor = minor;
        this.patch = patch;
        this.prerelease = prerelease;
    }

    static fromString(versionString) {
        const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/;
        const match = versionString.match(semverRegex);

        if (!match) {
            throw new DomainException('Invalid semantic version format');
        }

        return new SemanticVersion(
            parseInt(match[1]),
            parseInt(match[2]),
            parseInt(match[3]),
            match[4] || null
        );
    }

    isValid() {
        return this.major >= 0 && this.minor >= 0 && this.patch >= 0;
    }

    toString() {
        let version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease) {
            version += `-${this.prerelease}`;
        }
        return version;
    }

    equals(other) {
        return other instanceof SemanticVersion &&
               this.major === other.major &&
               this.minor === other.minor &&
               this.patch === other.patch &&
               this.prerelease === other.prerelease;
    }
}

module.exports = {SemanticVersion};
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

#### GitSafetyChecker (Domain Service)

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
    constructor(fileSystemAdapter, templateAdapter) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.templateAdapter = templateAdapter;
        this.basePath = 'backend/src/integrations';
    }

    /**
     * Save integration (creates files on disk)
     */
    async save(integration) {
        const integrationPath = `${this.basePath}/${integration.name.value}`;

        // Ensure directory exists
        await this.fileSystemAdapter.ensureDirectory(integrationPath);

        // Generate and write files
        const files = await this.generateIntegrationFiles(integration);

        for (const [filename, content] of Object.entries(files)) {
            const filePath = `${integrationPath}/${filename}`;
            await this.fileSystemAdapter.writeFile(filePath, content);
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

    async generateIntegrationFiles(integration) {
        const files = {};

        files['Integration.js'] = await this.templateAdapter.render(
            'integration/Integration.js',
            integration.toObject()
        );

        files['definition.js'] = await this.templateAdapter.render(
            'integration/definition.js',
            integration.toObject()
        );

        files['integration-definition.json'] = JSON.stringify(
            integration.toObject(),
            null,
            2
        );

        files['config.json'] = JSON.stringify(
            {name: integration.name.value, version: '1.0.0'},
            null,
            2
        );

        files['README.md'] = await this.templateAdapter.render(
            'integration/README.md',
            integration.toObject()
        );

        files['.env.example'] = this.generateEnvExample(integration);

        return files;
    }

    generateEnvExample(integration) {
        const lines = [];
        for (const [key, config] of Object.entries(integration.capabilities.environment || {})) {
            if (config.description) {
                lines.push(`# ${config.description}`);
            }
            lines.push(`${key}=${config.example || 'your-value-here'}`);
            lines.push('');
        }
        return lines.join('\n');
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
    }

    /**
     * Write file atomically (temp + rename)
     */
    async writeFile(filePath, content) {
        const fullPath = path.join(this.baseDirectory, filePath);
        const tempPath = `${fullPath}.tmp.${Date.now()}`;

        try {
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, fullPath);
        } catch (error) {
            // Clean up temp file on error
            if (await fs.pathExists(tempPath)) {
                await fs.remove(tempPath);
            }
            throw error;
        }
    }

    /**
     * Read file
     */
    async readFile(filePath) {
        const fullPath = path.join(this.baseDirectory, filePath);
        return await fs.readFile(fullPath, 'utf-8');
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        const fullPath = path.join(this.baseDirectory, filePath);
        return await fs.pathExists(fullPath);
    }

    /**
     * Ensure directory exists
     */
    async ensureDirectory(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);
        await fs.ensureDir(fullPath);
    }

    /**
     * Check if directory exists
     */
    async directoryExists(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);
        return await fs.pathExists(fullPath);
    }

    /**
     * List directories
     */
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

    /**
     * Remove directory
     */
    async removeDirectory(dirPath) {
        const fullPath = path.join(this.baseDirectory, dirPath);
        await fs.remove(fullPath);
    }
}

module.exports = {FileSystemAdapter};
```

#### GitAdapter

```javascript
// infrastructure/adapters/GitAdapter.js

const {execSync} = require('child_process');

class GitAdapter {
    constructor(cwd = process.cwd()) {
        this.cwd = cwd;
    }

    /**
     * Get git status
     */
    async getStatus() {
        try {
            const isRepo = this.isRepository();
            if (!isRepo) {
                return {
                    isRepository: false,
                    branch: null,
                    isClean: false,
                    uncommittedFiles: [],
                    uncommittedCount: 0
                };
            }

            const branch = this.getCurrentBranch();
            const uncommittedFiles = this.getUncommittedFiles();

            return {
                isRepository: true,
                branch,
                isClean: uncommittedFiles.length === 0,
                uncommittedFiles,
                uncommittedCount: uncommittedFiles.length
            };
        } catch (error) {
            throw new AdapterException('Failed to get git status', error);
        }
    }

    isRepository() {
        try {
            execSync('git rev-parse --git-dir', {
                cwd: this.cwd,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }

    getCurrentBranch() {
        return execSync('git branch --show-current', {
            cwd: this.cwd,
            encoding: 'utf-8'
        }).trim();
    }

    getUncommittedFiles() {
        const output = execSync('git status --porcelain', {
            cwd: this.cwd,
            encoding: 'utf-8'
        });

        return output
            .trim()
            .split('\n')
            .filter(line => line.length > 0)
            .map(line => ({
                status: line.substring(0, 2),
                file: line.substring(3)
            }));
    }
}

module.exports = {GitAdapter};
```

---

## Ports (Interfaces)

### Repository Ports

```javascript
// domain/ports/IIntegrationRepository.js

class IIntegrationRepository {
    async save(integration) {
        throw new Error('Not implemented');
    }

    async findByName(name) {
        throw new Error('Not implemented');
    }

    async findAll() {
        throw new Error('Not implemented');
    }

    async delete(name) {
        throw new Error('Not implemented');
    }
}

module.exports = {IIntegrationRepository};
```

### Adapter Ports

```javascript
// domain/ports/IGitPort.js

class IGitPort {
    async getStatus() {
        throw new Error('Not implemented');
    }

    async isRepository() {
        throw new Error('Not implemented');
    }
}

module.exports = {IGitPort};
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
