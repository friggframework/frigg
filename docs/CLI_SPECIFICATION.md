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

#### `frigg create`
**Purpose**: Create new resources (integrations, API modules, credentials, deploy strategies)

**Subcommands**:

##### `frigg create integration`
Create a new integration in the current Frigg app

```bash
frigg create integration

? Integration name: salesforce-sync
? Integration display name: Salesforce Sync
? Description: Synchronize contacts with Salesforce
? Add API modules now?
  > Yes - from API module library (npm)
  > Yes - create new local API module
  > No - I'll add them later

# If "from library":
? Search API modules: (type to search)
  > @frigg/salesforce-contacts
  > @frigg/salesforce-leads
  > @custom/salesforce-utils

? Select modules: (space to select, enter to continue)
  [x] @frigg/salesforce-contacts
  [ ] @frigg/salesforce-leads
  [x] @custom/salesforce-utils

# If "create new":
[Flows into frigg create api-module]

✓ Integration 'salesforce-sync' created
✓ Integration.js created at integrations/salesforce-sync/
✓ Added to app definition
? Run frigg ui to configure? (Y/n)
```

**Flags**:
```bash
frigg create integration <name>           # Skip name prompt
frigg create integration --no-modules     # Don't prompt for modules
frigg create integration --template <id>  # Use integration template
```

---

##### `frigg create api-module`
Create a new API module locally

```bash
frigg create api-module

? API module name: custom-webhook-handler
? Display name: Custom Webhook Handler
? Description: Handle webhooks from external systems
? Module type:
  > Entity (CRUD operations)
  > Action (Business logic)
  > Utility (Helper functions)
  > Webhook (Event handling)

? Generate boilerplate?
  > Yes - Full (routes, handlers, tests)
  > Yes - Minimal
  > No - Empty structure

? Add to existing integration?
  > Yes
  > No - I'll add it later

# If "Yes":
? Select integration:
  > salesforce-sync
  > docusign-integration
  > Create new integration

✓ API module 'custom-webhook-handler' created
✓ Files created in /api-modules/custom-webhook-handler/
✓ Added to integration 'salesforce-sync'
✓ Run 'npm test' to verify setup
```

**Flags**:
```bash
frigg create api-module <name>              # Skip name prompt
frigg create api-module --type entity       # Specify type
frigg create api-module --no-boilerplate    # Minimal structure
frigg create api-module --integration <id>  # Add to specific integration
```

---

##### `frigg create credentials` (Future)
Generate deployment credentials from template

```bash
frigg create credentials

? Credential type:
  > IAM User (programmatic access)
  > IAM Role (assume role)
  > Service Account (GCP)

? Based on app definition requirements:
  - VPC access: Yes
  - KMS encryption: Yes
  - SSM parameters: Yes
  - S3 buckets: Yes

? Generate narrowed permissions?
  > Yes - Minimal required (recommended)
  > No - Full admin (not recommended)

✓ Credentials policy generated
✓ Saved to deploy/iam-policy.json
? Apply to AWS now? (Y/n)
```

---

##### `frigg create deploy-strategy` (Future)
Create deployment configuration

```bash
frigg create deploy-strategy

? Environment:
  > Development
  > Staging
  > Production

? Deployment type:
  > Serverless Framework
  > AWS CDK
  > Terraform
  > Custom

? Region:
  > us-east-1
  > eu-west-1
  > ap-southeast-1

✓ Deploy strategy created: deploy/production.yml
✓ Run 'frigg deploy --env production' when ready
```

---

#### `frigg add`
**Purpose**: Add components to existing resources (additive operations)

##### `frigg add api-module`
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

##### `frigg add extension` (Future)
Add extension to integration or core

```bash
frigg add extension

? Extension type:
  > Core extension (modifies Frigg core functionality)
  > Integration extension (extends integration capabilities)
  > API module extension (adds to existing module)

? Select extension:
  > @frigg/auth-extension-oauth2
  > @frigg/logging-extension-datadog
  > @custom/custom-middleware

? Add to:
  > Core (affects all integrations)
  > Specific integration: salesforce-sync

✓ Extension added
✓ Configuration required - see docs/extensions/
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

#### `frigg projects` (Future)
**Purpose**: Manage multiple Frigg projects

```bash
frigg projects

? Select action:
  > List all projects
  > Switch project
  > Add project
  > Remove project

# List:
Frigg Projects:
  ├── my-app (/Users/sean/projects/my-app) [current]
  ├── client-integration (/Users/sean/clients/acme)
  └── demo-app (/Users/sean/demos/frigg-demo)

# Switch:
? Switch to:
  > my-app
  > client-integration
  > demo-app

✓ Switched to 'client-integration'
```

---

#### `frigg instance` (Future)
**Purpose**: Manage local Frigg instances

```bash
frigg instance

? Select action:
  > Status (show running instances)
  > Start instance
  > Stop instance
  > Restart instance
  > Logs

# Status:
Running Instances:
  ├── my-app (PID: 12345, Port: 3000)
  └── client-integration (PID: 12346, Port: 3001)

# Logs:
? Select instance:
  > my-app
  > client-integration

[Streaming logs from my-app...]
```

---

### 🔮 Future Commands

#### `frigg mcp` (Future - High Priority)
**Purpose**: Configure MCP server integration

**Note**: MCP server will automatically run with Frigg backend. This command configures additional MCP types.

```bash
frigg mcp

? Select MCP server type:
  > Docs (AI documentation assistance) - runs separately
  > Local (personal workflows) - auto-runs with backend ✓
  > Hosted (deploy with app) - deployment configuration

# Docs:
? Install Frigg Docs MCP server?
  > Yes - Install globally
  > Yes - Install for this project
  > No

# Local (already running):
✓ Local MCP server running on port 3002
? Configure:
  > View endpoints
  > Update configuration
  > Restart server

# Hosted:
? Deploy MCP server with app?
  > Yes - Same infrastructure
  > Yes - Separate service
  > No - Manual deployment

✓ MCP configuration saved
? Start local MCP server now? (Y/n)
```

---

#### `frigg add core-module` (Future)
**Purpose**: Add/switch core modules (host provider, auth, database, etc.)

```bash
frigg add core-module

? Select core module type:
  > Host Provider (AWS/GCP/Azure)
  > Authentication Provider
  > Database Provider
  > Queue Provider
  > Storage Provider

? Select AWS Host Provider:
  Current: Serverless Framework
  > Serverless Framework (keep)
  > AWS CDK
  > Terraform

? Configure AWS CDK:
  > Use default configuration
  > Custom configuration

✓ Core module 'AWS CDK' added
✓ Infrastructure code generated
? Migrate existing resources? (Y/n)
```

---

#### `frigg submit` (Future - Marketplace)
**Purpose**: Submit module to Frigg marketplace

```bash
frigg submit

? What would you like to submit?
  > API module
  > Integration template
  > Extension

? Select API module:
  > custom-webhook-handler
  > custom-auth-provider

? Package details:
  Name: @yourorg/webhook-handler
  Version: 1.0.0
  License: MIT

? Include documentation?
  > Yes - Auto-generate from code
  > Yes - Use existing README
  > No

? Publish to:
  > Frigg marketplace
  > npm registry
  > Both

✓ Package prepared
✓ Published to Frigg marketplace
✓ Published to npm as @yourorg/webhook-handler@1.0.0
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

## Command Hierarchy

```
frigg
├── init                      # Initialize/reconfigure project
├── create                    # Create new resources
│   ├── integration          # Create integration
│   ├── api-module           # Create API module
│   ├── credentials          # Generate credentials (future)
│   └── deploy-strategy      # Create deploy config (future)
├── add                       # Add to existing resources
│   ├── api-module           # Add module to integration
│   ├── extension            # Add extension (future)
│   └── core-module          # Add/switch core module (future)
├── config                    # Configure resources
│   ├── app                  # Configure app definition
│   ├── integration          # Configure integration
│   ├── core                 # Configure core modules
│   └── deploy               # Configure deployment
├── start                     # Start local development
├── deploy                    # Deploy to cloud
├── ui                        # Launch management UI
├── list                      # List resources
│   ├── integrations
│   ├── api-modules
│   ├── local
│   ├── core
│   └── extensions
├── projects                  # Manage projects (future)
│   ├── list
│   ├── switch
│   ├── add
│   └── remove
├── instance                  # Manage instances (future)
│   ├── status
│   ├── start
│   ├── stop
│   ├── restart
│   └── logs
├── mcp                       # MCP server config (future)
│   ├── docs
│   ├── local
│   └── hosted
└── submit                    # Submit to marketplace (future)
    ├── api-module
    ├── integration
    └── extension
```

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

## CLI Output Style

### Success Messages
```
✓ Integration 'salesforce-sync' created
✓ API module added to integration
✓ Configuration updated
```

### Error Messages
```
✗ Integration name already exists
  Try: salesforce-sync-v2

✗ API module not found: @frigg/invalid-module
  Search available modules: frigg list api-modules
```

### Progress Indicators
```
Creating integration...
  ✓ Generating Integration.js
  ✓ Updating app definition
  ✓ Installing dependencies
  ⠋ Running validation...
```

### Interactive Prompts
```
? Integration name: (salesforce-sync)
? Description: Synchronize contacts with Salesforce
? Add API modules now? (Y/n)
```

---

## Technical Notes

### App Definition Management
- CLI reads from `app-definition.json` or `app-definition.yml`
- Commands update app definition atomically
- Validation before writing
- Backup created on modification

### Integration Structure
```
integrations/
├── salesforce-sync/
│   ├── Integration.js        # Main integration file
│   ├── config.json           # Integration config
│   └── README.md             # Documentation
```

### API Module Structure (Local)
```
api-modules/
├── custom-webhook-handler/
│   ├── index.js              # Main module export
│   ├── routes.js             # Route definitions
│   ├── handlers.js           # Business logic
│   ├── tests/                # Tests
│   │   └── handler.test.js
│   └── package.json          # Module metadata
```

### Configuration Files
- `frigg.config.js` - CLI configuration
- `app-definition.json` - App structure
- `deploy/*.yml` - Deployment configs
- `.friggrc` - User preferences

---

*This specification is a living document and will evolve as Frigg develops.*
