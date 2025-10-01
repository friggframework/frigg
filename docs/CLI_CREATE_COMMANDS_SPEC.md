# Frigg CLI: `create` Commands Deep Dive

## Table of Contents
1. [Overview](#overview)
2. [frigg create integration](#frigg-create-integration)
3. [frigg create api-module](#frigg-create-api-module)
4. [Schemas](#schemas)
5. [File Structures](#file-structures)
6. [Validation Rules](#validation-rules)
7. [Implementation Examples](#implementation-examples)

---

## Overview

The `frigg create` commands generate new resources with proper structure, validation, and integration with the Frigg framework. These commands are the foundation for building Frigg applications.

### Key Principles
- **Schema-driven**: All generation follows JSON schemas from `/packages/schemas`
- **DDD Architecture**: Commands delegate to Use Cases, entities contain business logic
- **Repository Pattern**: Persistence abstracted through repository interfaces
- **Contextual**: CLI understands project state and offers intelligent defaults
- **Chaining**: Commands can flow into related operations
- **Validation**: Domain validation + schema validation at persistence boundary
- **Idempotent**: Safe to run multiple times (with warnings)
- **Transactional**: All-or-nothing operations with automatic rollback

### DDD Architecture Summary

**Separation of Concerns:**
1. **Presentation Layer** (Commands): Handle user input/output, delegate to Use Cases
2. **Application Layer** (Use Cases): Orchestrate domain operations, manage transactions
3. **Domain Layer** (Entities/Services): Business logic, validation rules
4. **Infrastructure Layer** (Repositories/Adapters): File system operations, schema validation

**Benefits:**
- Domain logic testable without file system
- Easy to swap FileSystem for Database
- Clear boundaries between layers
- Transaction management with rollback

---

## frigg create integration

### Purpose
Create a new integration in the current Frigg app. An integration represents a business workflow that connects one or more API modules together.

**Architecture Flow:**
```
CLI Command (Presentation)
    ↓
CreateIntegrationUseCase (Application)
    ↓
Integration Entity (Domain) + IntegrationRepository (Infrastructure)
    ↓
FileSystemAdapter + SchemaValidator (Infrastructure)
```

### Command Syntax
```bash
frigg create integration [name] [options]
```

### DDD Implementation

The command delegates to `CreateIntegrationUseCase`:

```javascript
// presentation/commands/create/integration.js
const {CreateIntegrationUseCase} = require('../../../application/use-cases/CreateIntegrationUseCase');

async function createIntegration(options) {
    // 1. Gather user input (interactive prompts)
    const request = await gatherIntegrationInput(options);

    // 2. Execute use case (via DI container)
    const useCase = container.get('CreateIntegrationUseCase');

    try {
        const result = await useCase.execute(request);

        if (result.success) {
            console.log(`✓ Integration '${result.integration.name}' created`);
        }
    } catch (error) {
        console.error(`✗ Failed to create integration: ${error.message}`);
        process.exit(1);
    }
}
```

### Interactive Flow

#### Step 1: Basic Information
```bash
frigg create integration

? Integration name: salesforce-sync
  ↳ Validates: kebab-case, unique, 2-100 chars
  ↳ Auto-suggests based on common patterns

? Display name: (Salesforce Sync)
  ↳ Human-readable name for UI
  ↳ Auto-generated from integration name if empty

? Description: Synchronize contacts with Salesforce
  ↳ 1-1000 characters
  ↳ Used in UI and documentation
```

#### Step 2: Integration Type & Configuration
```bash
? Integration type:
  > API (REST/GraphQL API integration)
  > Webhook (Event-driven integration)
  > Sync (Bidirectional data sync)
  > Transform (Data transformation pipeline)
  > Custom

? Category:
  > CRM
  > Marketing
  > Communication
  > ECommerce
  > Finance
  > Analytics
  > Storage
  > Development
  > Productivity
  > Social
  > Other

? Tags (comma-separated): crm, salesforce, contacts
  ↳ Used for filtering and discovery
```

#### Step 3: Entity Configuration
```bash
? Configure entities for this integration?
  > Yes - Interactive setup
  > Yes - Import from template
  > No - I'll configure later

# If "Yes - Interactive":
? How many entities will this integration use? 2

=== Entity 1 ===
? Entity type: salesforce
? Entity label: Salesforce Account
? Is this a global entity (managed by app owner)? No
? Can this entity be auto-provisioned? Yes
? Is this entity required? Yes

=== Entity 2 ===
? Entity type: stripe
? Entity label: Stripe Account
? Is this a global entity? Yes
? Can this entity be auto-provisioned? No
? Is this entity required? Yes
```

#### Step 4: Capabilities
```bash
? Authentication methods (space to select):
  [x] OAuth2
  [ ] API Key
  [ ] Basic Auth
  [ ] Token
  [ ] Custom

? Does this integration support webhooks? Yes

? Does this integration support real-time updates? No

? Data sync capabilities:
  [x] Bidirectional sync
  [x] Incremental sync
  ? Batch size: 100
```

#### Step 5: API Module Selection
```bash
? Add API modules now?
  > Yes - from API module library (npm)
  > Yes - create new local API module
  > No - I'll add them later

# If "from library":
? Search API modules: salesforce

  Available modules:
  [x] @friggframework/api-module-salesforce (v1.2.0)
      ↳ Official Salesforce API module
  [ ] @friggframework/api-module-salesforce-marketing (v1.0.0)
      ↳ Salesforce Marketing Cloud
  [ ] @custom/salesforce-utils (v0.5.0)
      ↳ Custom Salesforce utilities

? Select modules: (space to select, enter to continue)
  [x] @friggframework/api-module-salesforce

# If "create new":
[Flows to frigg create api-module with context]
```

#### Step 6: Environment Variables
```bash
? Configure required environment variables?
  > Yes - Interactive setup
  > Yes - Use .env.example
  > No - I'll configure later

# If "Yes - Interactive":
Required environment variables for this integration:

? SALESFORCE_CLIENT_ID: (your-client-id)
  ↳ Description: Salesforce OAuth client ID
  ↳ Required: Yes

? SALESFORCE_CLIENT_SECRET: (your-client-secret)
  ↳ Description: Salesforce OAuth client secret
  ↳ Required: Yes

? SALESFORCE_REDIRECT_URI: (${process.env.REDIRECT_URI}/salesforce)
  ↳ Description: OAuth callback URL
  ↳ Required: Yes

✓ .env.example updated with required variables
✓ See documentation for how to obtain credentials
```

#### Step 7: Generation
```bash
Creating integration 'salesforce-sync'...

✓ Validating configuration
✓ Checking for naming conflicts
✓ Creating directory structure
✓ Generating Integration.js
✓ Creating definition.js
✓ Generating integration-definition.json
✓ Installing API modules (@friggframework/api-module-salesforce)
✓ Updating app-definition.json
✓ Creating .env.example entries
✓ Generating README.md
✓ Running validation tests

Integration 'salesforce-sync' created successfully!

Location: integrations/salesforce-sync/

Next steps:
  1. Configure environment variables in .env
  2. Review Integration.js implementation
  3. Run 'frigg ui' to test the integration
  4. Run 'frigg start' to start local development

? Open Integration.js in editor? (Y/n)
? Run frigg ui now? (Y/n)
```

### Flags & Options

```bash
# Basic flags
frigg create integration <name>              # Skip name prompt
frigg create integration --name <name>       # Explicit name flag

# Configuration flags
frigg create integration --type <type>       # Specify type (api|webhook|sync|transform|custom)
frigg create integration --category <cat>    # Specify category
frigg create integration --tags <tags>       # Comma-separated tags

# Template flags
frigg create integration --template <id>     # Use integration template
frigg create integration --from-example      # Copy from examples

# Module flags
frigg create integration --no-modules        # Don't prompt for modules
frigg create integration --modules <list>    # Add specific modules

# Entity flags
frigg create integration --entities <json>   # Provide entity config as JSON
frigg create integration --no-entities       # Skip entity configuration

# Behavior flags
frigg create integration --force             # Overwrite existing
frigg create integration --dry-run           # Preview without creating
frigg create integration --no-env            # Skip environment variable setup
frigg create integration --no-edit           # Don't open in editor

# Output flags
frigg create integration --quiet             # Minimal output
frigg create integration --verbose           # Detailed output
frigg create integration --json              # JSON output for scripting
```

### Generated File Structure

```
integrations/salesforce-sync/
├── Integration.js              # Main integration class (extends IntegrationBase)
├── definition.js               # Integration definition metadata
├── integration-definition.json # JSON schema-compliant definition
├── config.json                 # Integration configuration
├── README.md                   # Documentation
├── .env.example               # Environment variable template
├── tests/                     # Integration tests
│   ├── integration.test.js
│   └── fixtures/
└── docs/                      # Additional documentation
    ├── setup.md
    └── api-reference.md
```

### Schema Integration

The generated `integration-definition.json` must conform to `/packages/schemas/schemas/integration-definition.schema.json`:

**Required Fields:**
- `name`: Integration identifier (kebab-case)
- `version`: Semantic version (1.0.0)

**Optional but Recommended:**
- `supportedVersions`: Array of Frigg versions
- `events`: Array of event names
- `options`: Integration options and display properties
- `entities`: Entity configuration
- `capabilities`: Authentication, webhooks, sync capabilities
- `requirements`: Environment variables, permissions, dependencies

---

## frigg create api-module

### Purpose
Create a new API module locally within the Frigg app. API modules encapsulate interactions with external APIs and can be reused across integrations.

**Architecture Flow:**
```
CLI Command (Presentation)
    ↓
CreateApiModuleUseCase (Application)
    ↓
ApiModule Entity (Domain) + ApiModuleRepository (Infrastructure)
    ↓
FileSystemAdapter + SchemaValidator (Infrastructure)
```

### Command Syntax
```bash
frigg create api-module [name] [options]
```

### DDD Implementation

The command delegates to `CreateApiModuleUseCase`:

```javascript
// presentation/commands/create/api-module.js
const {CreateApiModuleUseCase} = require('../../../application/use-cases/CreateApiModuleUseCase');

async function createApiModule(options) {
    // 1. Gather user input (interactive prompts)
    const request = await gatherApiModuleInput(options);

    // 2. Execute use case (via DI container)
    const useCase = container.get('CreateApiModuleUseCase');

    try {
        const result = await useCase.execute(request);

        if (result.success) {
            console.log(`✓ API module '${result.apiModule.name}' created`);
        }
    } catch (error) {
        console.error(`✗ Failed to create API module: ${error.message}`);
        process.exit(1);
    }
}
```

### Interactive Flow

#### Step 1: Basic Information
```bash
frigg create api-module

? API module name: custom-webhook-handler
  ↳ Validates: kebab-case, unique, 2-100 chars
  ↳ Prefix with @scope/ for scoped packages

? Display name: (Custom Webhook Handler)
  ↳ Human-readable name

? Description: Handle webhooks from external systems
  ↳ 1-500 characters

? Author: (Sean Matthews)
  ↳ From git config or prompted

? License: (MIT)
  ↳ Common choices: MIT, Apache-2.0, ISC, BSD-3-Clause
```

#### Step 2: Module Type & Configuration
```bash
? Module type:
  > Entity (CRUD operations for a resource)
    ↳ Creates: Entity class, Manager class, CRUD methods
  > Action (Business logic or workflow)
    ↳ Creates: Action handlers, workflow methods
  > Utility (Helper functions and tools)
    ↳ Creates: Utility functions, helpers
  > Webhook (Event handling and webhooks)
    ↳ Creates: Webhook handlers, event processors
  > API (Full API client)
    ↳ Creates: API class, auth, endpoints

? Primary API pattern:
  > REST API
  > GraphQL
  > SOAP/XML
  > Custom

? Authentication type:
  > OAuth2
  > API Key
  > Basic Auth
  > Token Bearer
  > Custom
  > None
```

#### Step 3: Boilerplate Generation
```bash
? Generate boilerplate code?
  > Yes - Full (routes, handlers, tests, docs)
  > Yes - Minimal (basic structure only)
  > No - Empty structure (manual implementation)

# If "Yes - Full":
? Include example implementations? Yes
? Generate TypeScript definitions? Yes
? Include JSDoc comments? Yes

# If module type is "Entity":
? Entity name (singular): Contact
? Entity name (plural): Contacts
? Generate CRUD methods?
  [x] Create
  [x] Read
  [x] Update
  [x] Delete
  [x] List

# If module type is "Webhook":
? Webhook event types (comma-separated): contact.created, contact.updated, contact.deleted
? Include signature verification? Yes
? Queue webhooks for processing? Yes
```

#### Step 4: API Module Definition
```bash
? Configure API module definition?
  > Yes - Interactive setup
  > Yes - Import from existing
  > No - Minimal defaults

# If "Yes - Interactive":
? Module name (for registration): custom-webhook-handler
? Model name: CustomWebhook
? Required auth methods:
  [x] getToken
  [x] getEntityDetails
  [ ] getCredentialDetails
  [x] testAuthRequest

? API properties to persist:
  Credential properties (comma-separated): access_token, refresh_token
  Entity properties (comma-separated): webhook_id, webhook_secret

? Environment variables needed:
  ? Variable name: WEBHOOK_SECRET
  ? Description: Secret for webhook signature verification
  ? Required: Yes
  ? Example value: your-webhook-secret

  Add another? No
```

#### Step 5: Dependencies
```bash
? Additional dependencies to install?
  > Yes - Search npm
  > Yes - Enter manually
  > No

# If "Yes - Enter manually":
? Dependency name: axios
? Version: (latest)

? Install dev dependencies?
  > Jest (testing)
  > SuperTest (API testing)
  > Nock (HTTP mocking)
  > ESLint (linting)
  > Prettier (formatting)
```

#### Step 6: Integration Association
```bash
? Add to existing integration?
  > Yes - Select from list
  > No - I'll add it later

# If "Yes":
? Select integration:
  > salesforce-sync
  > docusign-integration
  > Create new integration

# If "Create new integration":
[Flows to frigg create integration with this module pre-selected]
```

#### Step 7: Generation
```bash
Creating API module 'custom-webhook-handler'...

✓ Validating configuration
✓ Checking for naming conflicts
✓ Creating directory structure
✓ Generating api.js
✓ Generating definition.js
✓ Creating index.js
✓ Generating package.json
✓ Installing dependencies (axios, @friggframework/core)
✓ Installing dev dependencies (jest, eslint, prettier)
✓ Generating tests
✓ Creating README.md
✓ Generating TypeScript definitions
✓ Creating .env.example entries
✓ Adding to integration 'salesforce-sync'
✓ Running linter
✓ Running initial tests

API module 'custom-webhook-handler' created successfully!

Location: api-modules/custom-webhook-handler/

Files created:
  - index.js (module exports)
  - api.js (API class with methods)
  - definition.js (module definition)
  - package.json (dependencies and scripts)
  - README.md (documentation)
  - tests/ (test suite)

Next steps:
  1. Review api.js and implement custom logic
  2. Update tests in tests/
  3. Configure environment variables
  4. Run 'npm test' to verify setup
  5. Use module in integration

? Open api.js in editor? (Y/n)
? Run tests now? (Y/n)
```

### Flags & Options

```bash
# Basic flags
frigg create api-module <name>               # Skip name prompt
frigg create api-module --name <name>        # Explicit name flag

# Type flags
frigg create api-module --type <type>        # Module type (entity|action|utility|webhook|api)
frigg create api-module --auth <type>        # Auth type (oauth2|api-key|basic|token|custom|none)

# Generation flags
frigg create api-module --boilerplate <level># full|minimal|none
frigg create api-module --no-boilerplate     # Empty structure
frigg create api-module --typescript         # Generate TypeScript
frigg create api-module --javascript         # Generate JavaScript (default)

# Template flags
frigg create api-module --template <id>      # Use module template
frigg create api-module --from <source>      # Copy from existing module

# Dependency flags
frigg create api-module --deps <list>        # Install dependencies
frigg create api-module --dev-deps <list>    # Install dev dependencies
frigg create api-module --no-install         # Skip npm install

# Integration flags
frigg create api-module --integration <id>   # Add to specific integration
frigg create api-module --no-integration     # Don't prompt for integration

# Behavior flags
frigg create api-module --force              # Overwrite existing
frigg create api-module --dry-run            # Preview without creating
frigg create api-module --no-tests           # Skip test generation
frigg create api-module --no-docs            # Skip documentation

# Output flags
frigg create api-module --quiet              # Minimal output
frigg create api-module --verbose            # Detailed output
frigg create api-module --json               # JSON output for scripting
```

### Generated File Structure

#### Full Boilerplate (Entity Type)
```
api-modules/custom-webhook-handler/
├── index.js                    # Module exports (Api, Definition)
├── api.js                      # API class extending ModuleAPIBase
├── definition.js               # Module definition and auth methods
├── defaultConfig.json          # Default configuration
├── package.json                # Module metadata and dependencies
├── README.md                   # Documentation
├── .env.example               # Environment variables template
├── types/                     # TypeScript definitions
│   └── index.d.ts
├── tests/                     # Test suite
│   ├── api.test.js
│   ├── definition.test.js
│   └── fixtures/
│       └── sample-data.json
└── docs/                      # Additional documentation
    ├── api-reference.md
    └── examples.md
```

#### Minimal Boilerplate
```
api-modules/custom-webhook-handler/
├── index.js                    # Module exports
├── api.js                      # Minimal API class
├── definition.js               # Minimal definition
├── package.json                # Module metadata
└── README.md                   # Basic documentation
```

#### Empty Structure
```
api-modules/custom-webhook-handler/
├── index.js                    # Empty exports
├── package.json                # Module metadata only
└── README.md                   # Template documentation
```

---

## Schemas

### Integration Definition Schema

Location: `/packages/schemas/schemas/integration-definition.schema.json`

**Status**: ✅ Exists and comprehensive

**Key Sections:**
1. **Basic Information**: name, version, supportedVersions, events
2. **Options**: type, hasUserConfig, isMany, display properties
3. **Entities**: Entity configuration with type, label, global, autoProvision, required
4. **Capabilities**: Authentication methods, webhooks, realtime, sync
5. **Requirements**: Environment variables, permissions, dependencies

**Recommendations**: Schema is comprehensive and ready to use.

### API Module Definition Schema

Location: `/packages/schemas/schemas/api-module-definition.schema.json`

**Status**: ❌ Does not exist - **NEEDS CREATION**

**Proposed Schema** (see below for full schema):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://schemas.friggframework.org/api-module-definition.schema.json",
  "title": "Frigg API Module Definition",
  "description": "Schema for defining a Frigg API module",
  "type": "object",
  "required": ["name", "version", "moduleName", "modelName"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*$",
      "description": "Module identifier (kebab-case)"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$"
    },
    "moduleName": {
      "type": "string",
      "description": "Module name for registration"
    },
    "modelName": {
      "type": "string",
      "description": "Model name for database entities"
    }
    // ... see full schema below
  }
}
```

### API Module Package Schema

Location: `/packages/schemas/schemas/api-module-package.schema.json`

**Status**: ❌ Does not exist - **NEEDS CREATION**

Defines the structure of `package.json` for API modules, including:
- Naming conventions (@friggframework/api-module-*)
- Required dependencies (@friggframework/core)
- Standard scripts (test, build, lint)
- Metadata fields

---

## File Structures

### Integration File Templates

#### Integration.js Template
```javascript
const IntegrationBase = require('@friggframework/core').IntegrationBase;

class {{IntegrationClass}} extends IntegrationBase {
    constructor(params) {
        super(params);
        // Initialize integration
    }

    async install() {
        // Installation logic
        // Called when integration is first set up
    }

    async uninstall() {
        // Cleanup logic
        // Called when integration is removed
    }

    async receiveWebhook(webhook) {
        // Webhook handling logic
    }

    // Custom methods for integration workflows
}

module.exports = {{IntegrationClass}};
```

#### definition.js Template
```javascript
const config = require('./config.json');

const Definition = {
    name: '{{integration-name}}',
    version: '1.0.0',
    display: {
        name: '{{Display Name}}',
        description: '{{Description}}',
        category: '{{Category}}',
        icon: '{{icon-identifier}}',
        tags: [{{tags}}]
    },
    options: {
        type: '{{type}}',
        hasUserConfig: {{hasUserConfig}},
        isMany: {{isMany}},
        requiresNewEntity: {{requiresNewEntity}}
    },
    entities: {
        {{#each entities}}
        '{{type}}': {
            type: '{{type}}',
            label: '{{label}}',
            global: {{global}},
            autoProvision: {{autoProvision}},
            required: {{required}}
        }{{#unless @last}},{{/unless}}
        {{/each}}
    },
    capabilities: {
        auth: [{{authMethods}}],
        webhooks: {{webhooks}},
        realtime: {{realtime}},
        sync: {
            bidirectional: {{syncBidirectional}},
            incremental: {{syncIncremental}},
            batchSize: {{batchSize}}
        }
    },
    requirements: {
        environment: {
            {{#each envVars}}
            '{{name}}': {
                required: {{required}},
                description: '{{description}}',
                example: '{{example}}'
            }{{#unless @last}},{{/unless}}
            {{/each}}
        }
    }
};

module.exports = {Definition};
```

### API Module File Templates

#### api.js Template (Full Boilerplate)
```javascript
const {ModuleAPIBase} = require('@friggframework/core');
const axios = require('axios');

class Api extends ModuleAPIBase {
    constructor(params) {
        super(params);
        this.baseUrl = '{{baseUrl}}';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add auth interceptors
        this.client.interceptors.request.use(
            (config) => this.addAuthToRequest(config)
        );
    }

    addAuthToRequest(config) {
        // Add authentication to requests
        if (this.access_token) {
            config.headers.Authorization = `Bearer ${this.access_token}`;
        }
        return config;
    }

    {{#if isEntity}}
    // CRUD Methods for {{EntityName}}
    async list{{EntityPlural}}(params = {}) {
        const response = await this.client.get('/{{entityPath}}', {params});
        return response.data;
    }

    async get{{EntityName}}(id) {
        const response = await this.client.get(`/{{entityPath}}/${id}`);
        return response.data;
    }

    async create{{EntityName}}(data) {
        const response = await this.client.post('/{{entityPath}}', data);
        return response.data;
    }

    async update{{EntityName}}(id, data) {
        const response = await this.client.put(`/{{entityPath}}/${id}`, data);
        return response.data;
    }

    async delete{{EntityName}}(id) {
        const response = await this.client.delete(`/{{entityPath}}/${id}`);
        return response.data;
    }
    {{/if}}

    {{#if isWebhook}}
    // Webhook Methods
    async verifyWebhookSignature(payload, signature) {
        // Implement signature verification
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        return signature === expectedSignature;
    }

    async processWebhook(event) {
        // Process webhook event
        switch(event.type) {
            {{#each webhookEvents}}
            case '{{this}}':
                return this.handle{{pascalCase this}}(event.data);
            {{/each}}
            default:
                console.log('Unknown webhook event:', event.type);
        }
    }
    {{/if}}

    // Authentication Methods
    async getAuthorizationUrl() {
        // Return OAuth authorization URL
    }

    async getTokenFromCode(code) {
        // Exchange code for token
    }

    async refreshAccessToken() {
        // Refresh expired token
    }

    async getUserDetails() {
        // Get authenticated user details
    }
}

module.exports = {Api};
```

#### definition.js Template (API Module)
```javascript
require('dotenv').config();
const {Api} = require('./api');
const config = require('./defaultConfig.json');

const Definition = {
    API: Api,
    getName: () => config.name,
    moduleName: config.name,
    modelName: '{{ModelName}}',
    requiredAuthMethods: {
        getToken: async (api, params) => {
            const code = params.data.code;
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: {
                    externalId: userDetails.id,
                    user: userId
                },
                details: {
                    name: userDetails.name || userDetails.email
                }
            };
        },
        apiPropertiesToPersist: {
            credential: {{credentialProps}},
            entity: {{entityProps}}
        },
        getCredentialDetails: async (api, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: {
                    externalId: userDetails.id,
                    user: userId
                },
                details: {}
            };
        },
        testAuthRequest: async (api) => api.getUserDetails()
    },
    env: {
        {{#each envVars}}
        {{name}}: process.env.{{envName}},
        {{/each}}
    }
};

module.exports = {Definition};
```

#### package.json Template
```json
{
  "name": "{{packageName}}",
  "version": "{{version}}",
  "description": "{{description}}",
  "main": "index.js",
  "scripts": {
    "test": "jest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write ."
  },
  "author": "{{author}}",
  "license": "{{license}}",
  "dependencies": {
    "@friggframework/core": "^2.0.0",
    {{#each dependencies}}
    "{{name}}": "{{version}}"{{#unless @last}},{{/unless}}
    {{/each}}
  },
  "devDependencies": {
    "@friggframework/devtools": "^1.1.2",
    "@friggframework/test": "^1.1.2",
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^2.0.0"
  }
}
```

---

## Validation Rules (DDD Approach)

### Validation in Domain Layer

Validation is split between Value Objects and Domain Services:

**Value Object Validation (IntegrationName)**
```javascript
// domain/value-objects/IntegrationName.js
class IntegrationName {
    constructor(value) {
        this.value = value;
        this._validate();
    }

    _validate() {
        const rules = [
            {
                test: () => /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(this.value),
                message: 'Name must be kebab-case (lowercase, hyphens only)'
            },
            {
                test: () => this.value.length >= 2 && this.value.length <= 100,
                message: 'Name must be between 2 and 100 characters'
            },
            {
                test: () => !this.value.startsWith('-') && !this.value.endsWith('-'),
                message: 'Name cannot start or end with hyphen'
            },
            {
                test: () => !this.value.includes('--'),
                message: 'Name cannot contain consecutive hyphens'
            }
        ];

        for (const rule of rules) {
            if (!rule.test()) {
                throw new DomainException(rule.message);
            }
        }
    }

    equals(other) {
        return other instanceof IntegrationName && this.value === other.value;
    }
}
```

**Domain Service Validation (IntegrationValidator)**
```javascript
// domain/services/IntegrationValidator.js
class IntegrationValidator {
    constructor(integrationRepository) {
        this.integrationRepository = integrationRepository;
    }

    async validateForCreation(integration) {
        const errors = [];

        // Entity self-validation
        const entityValidation = integration.validate();
        if (!entityValidation.isValid) {
            errors.push(...entityValidation.errors);
        }

        // Repository checks (uniqueness)
        const exists = await this.integrationRepository.exists(integration.name.value);
        if (exists) {
            errors.push(`Integration '${integration.name.value}' already exists`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
```

**Usage in Use Case:**
```javascript
// application/use-cases/CreateIntegrationUseCase.js
async execute(request) {
    // 1. Create domain entity (throws if invalid name format)
    const integration = Integration.create({
        name: request.name,  // IntegrationName value object validates format
        displayName: request.displayName,
        // ...
    });

    // 2. Domain service validates business rules (uniqueness, etc.)
    const validation = await this.integrationValidator.validateForCreation(integration);
    if (!validation.isValid) {
        throw new ValidationException(validation.errors);
    }

    // 3. Repository validates schema and persists
    await this.integrationRepository.save(integration);  // Throws if schema invalid
}
```

### API Module Name Validation
```javascript
const validateApiModuleName = (name) => {
    const rules = [
        {
            test: (n) => /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(n),
            message: 'Name must be valid npm package name'
        },
        {
            test: (n) => {
                const baseName = n.includes('/') ? n.split('/')[1] : n;
                return baseName.length >= 2 && baseName.length <= 214;
            },
            message: 'Name must be between 2 and 214 characters'
        },
        {
            test: (n) => !existingModules.includes(n),
            message: `API module '${n}' already exists`
        }
    ];

    for (const rule of rules) {
        if (!rule.test(name)) {
            return {valid: false, message: rule.message};
        }
    }

    return {valid: true};
};
```

### Environment Variable Validation
```javascript
const validateEnvVar = (name, value, config) => {
    const rules = [
        {
            test: (n) => /^[A-Z][A-Z0-9_]*$/.test(n),
            message: 'Environment variable names must be UPPER_SNAKE_CASE'
        },
        {
            test: (n, v, c) => !c.required || (v && v.trim().length > 0),
            message: 'Required environment variable must have a value'
        },
        {
            test: (n, v, c) => {
                if (c.format === 'url') {
                    try {
                        new URL(v);
                        return true;
                    } catch {
                        return false;
                    }
                }
                return true;
            },
            message: 'Environment variable must be a valid URL'
        }
    ];

    for (const rule of rules) {
        if (!rule.test(name, value, config)) {
            return {valid: false, message: rule.message};
        }
    }

    return {valid: true};
};
```

### Semantic Version Validation
```javascript
const validateVersion = (version) => {
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

    if (!semverRegex.test(version)) {
        return {
            valid: false,
            message: 'Version must follow semantic versioning (e.g., 1.0.0, 1.0.0-beta.1)'
        };
    }

    return {valid: true};
};
```

---

## Implementation Examples

### Example 1: Create Simple Integration
```bash
$ frigg create integration webhook-logger \
    --type webhook \
    --category Development \
    --no-modules \
    --no-env

Creating integration 'webhook-logger'...
✓ Integration created at integrations/webhook-logger/
```

### Example 2: Create Integration with API Modules
```bash
$ frigg create integration salesforce-stripe-sync

? Integration name: salesforce-stripe-sync
? Display name: Salesforce to Stripe Sync
? Description: Sync customers from Salesforce to Stripe
? Integration type: Sync
? Category: CRM
? Tags: crm, payments, salesforce, stripe

? Configure entities? Yes

Entity 1:
? Entity type: salesforce
? Entity label: Salesforce Account
? Global entity? No
? Auto-provision? Yes
? Required? Yes

Entity 2:
? Entity type: stripe
? Entity label: Stripe Account
? Global entity? Yes
? Auto-provision? No
? Required? Yes

? Add API modules? Yes - from library

? Search: salesforce
[x] @friggframework/api-module-salesforce

? Search: stripe
[x] @friggframework/api-module-stripe

Creating integration...
✓ Installing @friggframework/api-module-salesforce@1.2.0
✓ Installing @friggframework/api-module-stripe@1.1.0
✓ Integration 'salesforce-stripe-sync' created
```

### Example 3: Create Entity API Module
```bash
$ frigg create api-module custom-contacts \
    --type entity \
    --auth oauth2 \
    --boilerplate full \
    --integration salesforce-sync

? Entity name (singular): Contact
? Entity name (plural): Contacts
? Generate CRUD methods?
[x] Create
[x] Read
[x] Update
[x] Delete
[x] List

Creating API module 'custom-contacts'...
✓ Generated with full CRUD boilerplate
✓ Added to integration 'salesforce-sync'
```

### Example 4: Create Webhook Handler Module
```bash
$ frigg create api-module github-webhooks \
    --type webhook \
    --auth token

? Webhook event types: push, pull_request, issues
? Include signature verification? Yes
? Queue webhooks? Yes

Creating webhook handler...
✓ Generated webhook processing logic
✓ Created event handlers for: push, pull_request, issues
✓ Added signature verification
✓ Configured queue integration
```

### Example 5: Scripted Creation (CI/CD)
```bash
# Create integration with JSON config
$ cat integration-config.json | frigg create integration --json --quiet

# Create API module from template
$ frigg create api-module my-api \
    --template rest-oauth2 \
    --deps axios,lodash \
    --integration my-integration \
    --no-prompt \
    --json
```

---

## Missing Schemas to Create

Based on the analysis, the following schemas need to be created:

### 1. api-module-definition.schema.json
**Priority**: High
**Location**: `/packages/schemas/schemas/api-module-definition.schema.json`
**Purpose**: Define structure for API module definitions (definition.js)

### 2. api-module-package.schema.json
**Priority**: High
**Location**: `/packages/schemas/schemas/api-module-package.schema.json`
**Purpose**: Define package.json structure for API modules

### 3. integration-package.schema.json
**Priority**: Medium
**Location**: `/packages/schemas/schemas/integration-package.schema.json`
**Purpose**: Define package.json structure for integrations (if they become npm packages)

### 4. local-api-module.schema.json
**Priority**: Medium
**Location**: `/packages/schemas/schemas/local-api-module.schema.json`
**Purpose**: Define structure for local (non-npm) API modules

---

## Next Steps

1. **Create Missing Schemas**
   - [ ] Create api-module-definition.schema.json
   - [ ] Create api-module-package.schema.json
   - [ ] Validate schemas with examples

2. **Implement CLI Commands**
   - [ ] Implement `frigg create integration`
   - [ ] Implement `frigg create api-module`
   - [ ] Add validation logic
   - [ ] Add interactive prompts

3. **Create Templates**
   - [ ] Integration templates (api, webhook, sync, etc.)
   - [ ] API module templates (entity, action, utility, webhook)
   - [ ] Test templates

4. **Testing**
   - [ ] Unit tests for validation
   - [ ] Integration tests for file generation
   - [ ] E2E tests for full workflow

5. **Documentation**
   - [ ] CLI reference documentation
   - [ ] Video tutorials
   - [ ] Example projects

---

*This specification serves as the implementation blueprint for `frigg create integration` and `frigg create api-module` commands.*
