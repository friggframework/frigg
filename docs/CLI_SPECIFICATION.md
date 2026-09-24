# Frigg CLI Command Specification

## Overview

The Frigg CLI provides intelligent, contextual command interfaces for managing Frigg applications, integrations, API modules, and deployment workflows. Commands are designed to be intuitive, following modern CLI conventions while providing smart guidance through interactive prompts.

---

## Core Design Principles

### 1. **Contextual Intelligence**
- CLI understands the current state and recommends next logical actions
- Interactive prompts guide users through multi-step processes
- Commands can chain into related operations seamlessly

### 2. **Verb Conventions**
- `init` - Initialize or reconfigure projects
- `create` - Generate new resources from scratch
- `add` - Add components to existing collections
- `config` - Configure existing resources
- `start` - Run local development
- `deploy` - Deploy to production

### 3. **Progressive Disclosure**
- Essential commands available immediately
- Advanced features discoverable through interactive prompts
- Marketplace/submission features deferred for later

---

## Command Reference

### 🚀 Core Commands (Current Priority)

#### `frigg init`
**Purpose**: Initialize new Frigg project OR reconfigure existing project

**Behaviors**:
- **In empty directory**: Create new Frigg project
- **In existing Frigg project**: Update/reconfigure settings

**Interactive Flow**:
```bash
frigg init

# New Project Flow:
? What would you like to initialize?
  > Create new Frigg app
  > Reconfigure existing Frigg app

? Select backend template:
  > Default (Node.js + Serverless)
  > Minimal
  > Enterprise (VPC + KMS)

? Include frontend?
  > No
  > Yes - React
  > Yes - Next.js
  > Yes - Vue

? Include sample integration?
  > No
  > Yes - DocuSign example
  > Yes - Salesforce example
  > Yes - Custom

# Existing Project Flow:
Current Configuration:
  - Backend: Node.js + Serverless
  - Frontend: React
  - Integrations: 3

? What would you like to update?
  > Add/remove frontend
  > Update backend configuration
  > Modify deployment settings
  > Review app definition
```

**Flags**:
```bash
frigg init --force              # Force reinit in existing project
frigg init --template <name>    # Use specific template
frigg init --no-frontend        # Skip frontend
frigg init --backend-only       # Backend only, no prompts
```

---

#### `frigg create integration`

Create a new integration in the current Frigg app. An integration represents a business workflow that connects one or more API modules together.

**Command Syntax**:
```bash
frigg create integration [name] [options]
```

**Interactive Flow** (7 Steps):

##### Step 1: Basic Information
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

##### Step 2: Integration Type & Configuration
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

##### Step 3: Entity Configuration
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

##### Step 4: Capabilities
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

##### Step 5: API Module Selection
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

##### Step 6: Environment Variables
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

##### Step 7: Generation
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

**Flags & Options**:

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

**Generated File Structure**:

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

---

#### `frigg create api-module`

Create a new API module locally within the Frigg app. API modules encapsulate interactions with external APIs and can be reused across integrations.

**Command Syntax**:
```bash
frigg create api-module [name] [options]
```

**Interactive Flow** (7 Steps):

##### Step 1: Basic Information
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

##### Step 2: Module Type & Configuration
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

##### Step 3: Boilerplate Generation
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

##### Step 4: API Module Definition
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

##### Step 5: Dependencies
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

##### Step 6: Integration Association
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

##### Step 7: Generation
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

**Flags & Options**:

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

**Generated File Structure**:

```
# Full Boilerplate (Entity Type)
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

---

#### `frigg add api-module`

Add API module to existing integration

```bash
frigg add api-module

? How would you like to add an API module?
  > From API module library (npm)
  > Create new local API module
  > From local workspace

# If "from library":
? Search API modules: (type to search)
  Available modules:
  > @frigg/docusign-api
  > @frigg/salesforce-contacts
  > @frigg/stripe-payments
  > @custom/webhook-utils

? Select modules: (space to select)
  [x] @frigg/docusign-api
  [ ] @frigg/salesforce-contacts

? Add to which integration?
  > docusign-integration
  > salesforce-sync
  > Create new integration

# If "from local workspace":
? Select local API module:
  > custom-webhook-handler
  > custom-auth-provider
  > utility-functions

? Add to which integration?
  > docusign-integration
  > Create new integration

# If "create new integration":
[Flows into frigg create integration]

✓ API module(s) added to integration 'docusign-integration'
✓ Dependencies installed
✓ Integration.js updated
✓ App definition updated
```

**Flags**:
```bash
frigg add api-module <package>              # Add specific package
frigg add api-module --integration <id>     # Skip integration prompt
frigg add api-module --local                # Only show local modules
frigg add api-module --create               # Force create new module
```

---

#### `frigg config`
**Purpose**: Configure app settings, integrations, and core modules

```bash
frigg config

? What would you like to configure?
  > App definition
  > Integration settings
  > Core modules
  > Deployment configuration
  > Environment variables

# App definition flow:
Current App Definition:
  - Integrations: 3
  - API Modules: 12
  - Core Modules: VPC, KMS, SSM
  - Frontend: React

? Edit option:
  > Open in editor (YAML)
  > Interactive configuration
  > Import from file
  > Export current

# Core modules flow:
? Select core module:
  > Host Provider (AWS/GCP/Azure)
  > Authentication Provider
  > Database Provider
  > Queue Provider
  > Storage Provider

? Configure AWS Host Provider:
  Current: Serverless Framework
  > Switch to: AWS CDK
  > Switch to: Terraform
  > Advanced settings

✓ Configuration updated
? Regenerate infrastructure? (Y/n)
```

**Subcommands**:
```bash
frigg config app              # Configure app definition
frigg config integration      # Configure specific integration
frigg config core             # Configure core modules
frigg config deploy           # Configure deployment
```

**Flags**:
```bash
frigg config --edit           # Open in $EDITOR
frigg config --import <file>  # Import configuration
frigg config --export <file>  # Export configuration
```

---

#### `frigg start`
**Purpose**: Run local development server

```bash
frigg start

? What would you like to start?
  > Full stack (backend + frontend + UI)
  > Backend only (serverless offline)
  > Frontend only
  > Management UI only

Starting Frigg development environment...
✓ Backend running on http://localhost:3000
✓ Queue workers initialized
✓ Frontend running on http://localhost:5173
✓ Management UI running on http://localhost:5174

Press 'h' for help, 'q' to quit
```

**Flags**:
```bash
frigg start --backend-only    # Only start backend
frigg start --ui-only         # Only start management UI
frigg start --port <port>     # Custom port
frigg start --no-queue        # Skip queue scaffolding
frigg start --debug           # Enable debug logging
```

---

#### `frigg deploy`
**Purpose**: Deploy Frigg app to cloud provider

```bash
frigg deploy

? Select environment:
  > development
  > staging
  > production

? Confirm deployment:
  Environment: production
  Region: us-east-1
  Integrations: 3
  API Modules: 12

  Deploy? (Y/n)

Deploying to production...
✓ Validating app definition
✓ Building backend
✓ Deploying serverless stack
✓ Configuring API Gateway
✓ Setting up environment variables
✓ Deploying frontend (if configured)

✓ Deployment complete!
  API Endpoint: https://api.example.com
  Frontend URL: https://app.example.com
```

**Flags**:
```bash
frigg deploy --env <environment>    # Skip environment prompt
frigg deploy --region <region>      # Override region
frigg deploy --dry-run              # Show what would be deployed
frigg deploy --force                # Skip confirmation
frigg deploy --backend-only         # Only deploy backend
frigg deploy --frontend-only        # Only deploy frontend
```

---

### 📦 Management Commands

#### `frigg ui`
**Purpose**: Launch management UI for local development

```bash
frigg ui

Starting Frigg Management UI...
✓ Server running on http://localhost:5174
✓ Detected Frigg project at /Users/sean/Documents/GitHub/frigg
✓ Press Ctrl+C to stop
```

**Flags**:
```bash
frigg ui --port <port>        # Custom port
frigg ui --host <host>        # Custom host
frigg ui --open               # Auto-open browser
```

---

#### `frigg list`
**Purpose**: List resources in current project

```bash
frigg list

? What would you like to list?
  > Integrations
  > API modules
  > Local API modules
  > Core modules
  > Extensions

# Integrations:
Integrations (3):
  ├── docusign-integration (4 modules)
  ├── salesforce-sync (3 modules)
  └── stripe-payments (2 modules)

# API modules:
API Modules (12):
  ├── @frigg/docusign-api (docusign-integration)
  ├── @frigg/salesforce-contacts (salesforce-sync)
  └── custom-webhook-handler (local, salesforce-sync)
```

**Subcommands**:
```bash
frigg list integrations       # List integrations
frigg list api-modules        # List API modules
frigg list local              # List local modules only
frigg list core               # List core modules
frigg list extensions         # List extensions
```

---

## Contextual Intelligence Layer

### Smart Recommendations

The CLI provides intelligent suggestions based on context:

#### When adding API module:
```bash
frigg add api-module

? How would you like to add an API module?
  > From API module library (npm)      ← Searches npm/marketplace
  > Create new local API module        ← Flows to frigg create api-module
  > From local workspace               ← Shows existing local modules

? Add to which integration?
  > docusign-integration
  > salesforce-sync
  > Create new integration             ← Flows to frigg create integration
```

#### When creating API module:
```bash
frigg create api-module

# ... module creation flow ...

? Add to existing integration?
  > Yes                                ← Shows integration picker
  > No - I'll add it later

? Select integration:
  > salesforce-sync
  > docusign-integration
  > Create new integration             ← Flows to frigg create integration
```

#### When creating integration:
```bash
frigg create integration

# ... integration creation flow ...

? Add API modules now?
  > Yes - from API module library      ← Searches npm/marketplace
  > Yes - create new local API module  ← Flows to frigg create api-module
  > No - I'll add them later
```

### Context Detection

The CLI automatically detects:

1. **Project state**: New vs. existing Frigg project
2. **Available resources**: Local modules, installed packages, integrations
3. **Configuration**: App definition, deployment settings
4. **Environment**: Development, staging, production
5. **Git state**: Clean, uncommitted changes, branch

### Smart Defaults

- Uses existing configuration when available
- Suggests logical next steps based on project state
- Pre-fills forms with intelligent defaults
- Validates inputs against project constraints

---

## Implementation Priority

### Phase 1: Core Scaffolding (Current Focus)
- ✅ `frigg init` (new + reconfigure)
- ✅ `frigg create integration`
- ✅ `frigg create api-module`
- ✅ `frigg add api-module`
- ✅ `frigg start`
- ✅ `frigg deploy`
- ✅ `frigg ui`

### Phase 2: Configuration & Management
- 🔲 `frigg config` (all subcommands)
- 🔲 `frigg list` (all subcommands)
- 🔲 `frigg projects`
- 🔲 `frigg instance`

### Phase 3: Extensions & Advanced
- 🔲 `frigg add core-module`
- 🔲 `frigg add extension`
- 🔲 `frigg create credentials`
- 🔲 `frigg create deploy-strategy`
- 🔲 `frigg mcp` (with auto-running local MCP)

### Phase 4: Marketplace
- 🔲 `frigg submit`
- 🔲 Marketplace integration
- 🔲 Module discovery
- 🔲 Ratings & reviews

---

## Design Notes

### Verb Semantics
- **`init`**: First-time setup OR reconfiguration (git-style)
- **`create`**: Generate from scratch (cloud-native standard)
- **`add`**: Append to collections (modern package managers)
- **`config`**: Modify settings (avoids unwieldy app definition editing)

### Contextual Chaining
Commands intelligently chain into related operations:
- Adding module → Create integration if needed
- Creating module → Add to integration if desired
- Creating integration → Add modules if desired

### Progressive Disclosure
- Essential operations first
- Advanced features through prompts
- Marketplace/submission deferred

### Future-Proof Architecture
- Extensible command structure
- Support for core modules (host providers, auth, etc.)
- Extension system for integrations and API modules
- Marketplace submission workflow

---

## Examples

### Example 1: Quick Start (New Project)
```bash
# Create new Frigg app with integration
frigg init
# > Create new Frigg app
# > Default backend
# > Yes - React frontend
# > Yes - DocuSign example

# Done! Ready to go
frigg start
```

### Example 2: Add Module to Existing Integration
```bash
# Add Salesforce API module
frigg add api-module
# > From API module library
# Search: salesforce
# Select: @frigg/salesforce-contacts
# Add to: salesforce-sync

# Done! Module added
frigg start
```

### Example 3: Create Custom Module
```bash
# Create local API module
frigg create api-module
# Name: custom-webhook-handler
# Type: Webhook
# Boilerplate: Yes - Full
# Add to integration: Yes
# Select: docusign-integration

# Done! Module created and added
npm test
```

### Example 4: Create Integration with New Module
```bash
# Create new integration
frigg create integration
# Name: stripe-payments
# Add modules now: Yes - create new
# [flows to create api-module]
# Module name: stripe-checkout
# Type: Action
# Add to integration: Yes (stripe-payments)

# Done! Integration and module created
frigg ui  # Configure in UI
```

### Example 5: Reconfigure Existing Project
```bash
# Update existing project
frigg init
# > Reconfigure existing Frigg app
# > Add/remove frontend
# > Yes - add Next.js frontend

# Done! Frontend added
frigg start
```

---

*This specification is a living document and will evolve as Frigg develops.*
