# Frigg Framework Documentation Style Guide

## Overview

This style guide establishes consistent documentation standards across all Frigg Framework packages and the overall multi-framework system. It ensures professional, accessible, and maintainable documentation for developers adopting our integration framework.

## Documentation Principles

### 1. **Clarity First**
- Write for developers with varying experience levels
- Use clear, concise language
- Provide context before diving into technical details
- Include practical examples for every concept

### 2. **Consistency**
- Follow standardized structure across all packages
- Use consistent terminology and formatting
- Maintain uniform code example styles
- Apply consistent cross-referencing patterns

### 3. **Completeness**
- Cover installation, configuration, usage, and troubleshooting
- Include migration guides between frameworks
- Provide comprehensive API reference documentation
- Offer practical examples and tutorials

### 4. **Discoverability**
- Use clear navigation structures
- Include comprehensive cross-references
- Provide multiple entry points for different user journeys
- Maintain up-to-date tables of contents

## Document Structure Standards

### Package README Structure

All package README files must follow this structure:

```markdown
# Package Name

Brief description (1-2 sentences) of what this package does and its role in the Frigg ecosystem.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Migration Guide](#migration-guide) (if applicable)
- [TypeScript Support](#typescript-support) (if applicable)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Installation

Standard npm/yarn installation instructions with peer dependencies clearly listed.

## Quick Start

Minimal working example to get users up and running quickly (under 20 lines).

## Features

Bullet-point list of key features with brief descriptions.

## API Reference

Comprehensive API documentation with parameters, return types, and examples.

## Examples

Real-world usage examples organized by complexity (Basic, Intermediate, Advanced).

## Migration Guide

(If applicable) Step-by-step guide for migrating from/to other frameworks.

## TypeScript Support

(If applicable) TypeScript-specific documentation and type definitions.

## Development

Local development setup and contribution guidelines specific to this package.

## Contributing

Link to main contributing guide with package-specific notes.

## License

Standard MIT license reference.
```

### Code Example Standards

#### JavaScript/TypeScript Examples

```javascript
// ✅ Good: Clear, commented example with realistic use case
import { createFriggUICore } from '@friggframework/ui-core';
import { VuePlugin } from '@friggframework/ui-vue';

// Initialize the core with configuration
const friggCore = createFriggUICore({
  api: {
    baseUrl: 'https://api.example.com',
    jwt: process.env.FRIGG_JWT_TOKEN
  }
});

// Register Vue plugin
friggCore.registerPlugin(VuePlugin);

// Use in your Vue application
app.use(friggCore.getVuePlugin());
```

```javascript
// ❌ Bad: Unclear, minimal context
const core = createFriggUICore();
core.registerPlugin(VuePlugin);
```

#### Installation Examples

```bash
# Primary installation method
npm install @friggframework/package-name

# Alternative with yarn
yarn add @friggframework/package-name

# With peer dependencies
npm install @friggframework/package-name react react-dom
```

### Cross-Reference Standards

#### Internal Links
- Use relative paths for internal documentation: `[API Reference](../reference/api.md)`
- Use absolute GitHub URLs for cross-package references: `[Core Package](https://github.com/friggframework/frigg/tree/main/packages/core)`

#### External Links
- Always include descriptive link text: `[Frigg Framework Website](https://friggframework.org)`
- Open external links in new tabs where appropriate in web documentation

## Terminology Standards

### Consistent Terminology

| Use | Don't Use | Context |
|-----|-----------|---------|
| Integration | Connection, Plugin | Referring to Frigg integrations |
| Framework | Library, Tool | Referring to Frigg as a whole |
| Package | Module, Plugin | Referring to npm packages |
| Component | Widget, Element | Referring to UI components |
| Composable | Hook, Utility | Referring to Vue composables |
| Configuration | Config, Settings | Referring to setup options |

### Framework-Specific Terms

#### Vue.js
- Use "composable" not "hook"
- Use "reactive" not "state"
- Use "component" not "widget"

#### React
- Use "hook" not "composable"
- Use "state" not "reactive"
- Use "component" not "widget"

#### Angular
- Use "service" not "provider"
- Use "component" not "widget"
- Use "directive" not "helper"

#### Svelte
- Use "store" not "state management"
- Use "action" not "directive"
- Use "component" not "widget"

## Version Documentation

### Versioning in Documentation
- Always specify version compatibility: `Requires @friggframework/core ^2.0.0`
- Include breaking changes clearly marked with ⚠️ 
- Use semantic versioning in examples: `npm install @friggframework/package@^2.0.0`

### Migration Documentation
- Provide step-by-step migration instructions
- Include before/after code examples
- Highlight breaking changes and deprecations
- Offer automated migration tools where possible

## Code Quality Standards

### Code Examples
- All code examples must be tested and working
- Include error handling in examples
- Use realistic variable names and data
- Provide complete, runnable examples when possible

### Documentation Testing
- All installation commands must be verified
- All code examples must be syntax-checked
- All links must be validated
- All API references must be current

## Multi-Framework Documentation

### Framework Comparison
- Provide clear comparison matrices between frameworks
- Highlight framework-specific benefits and use cases
- Include performance comparisons where relevant
- Offer migration paths between frameworks

### Framework-Specific Sections
- Each framework package should have dedicated sections for:
  - Framework-specific installation instructions
  - Framework-specific configuration
  - Framework-specific best practices
  - Framework-specific troubleshooting

## Visual Standards

### Screenshots and Diagrams
- Use consistent styling and themes
- Include alt text for accessibility
- Maintain high resolution (at least 1200px wide)
- Use annotations to highlight key features

### Code Syntax Highlighting
- Use appropriate language tags for syntax highlighting
- Maintain consistent indentation (2 spaces)
- Use meaningful variable names
- Include inline comments for complex logic

## Accessibility Standards

### Writing
- Use clear, simple language
- Avoid jargon without explanation
- Provide context for technical terms
- Include pronunciation guides for difficult terms

### Structure
- Use proper heading hierarchy (h1 → h2 → h3)
- Include descriptive link text
- Provide table of contents for long documents
- Use lists for related items

## Maintenance Guidelines

### Regular Updates
- Review documentation quarterly for accuracy
- Update examples when APIs change
- Verify all links and references
- Update version numbers in examples

### Feedback Integration
- Monitor community feedback for documentation gaps
- Address common support questions in documentation
- Update based on user experience feedback
- Maintain changelog for documentation updates

## Examples of Compliant Documentation

### Good Package Introduction
```markdown
# @friggframework/ui-vue

Vue.js bindings for the Frigg Framework, providing reactive composables and components for building integration management interfaces. This package seamlessly integrates Frigg's backend capabilities with Vue.js applications, offering real-time monitoring, user management, and integration configuration.

**Key Features:**
- 🔄 Reactive integration management
- 📊 Real-time monitoring dashboard
- 🔐 Built-in authentication handling
- 🎨 Customizable UI components
- 📱 Mobile-responsive design
```

### Good API Documentation
```markdown
### useApiClient(config?)

Provides access to Frigg API functionality with automatic loading states and error handling.

**Parameters:**
- `config` (optional): Configuration object
  - `baseUrl` (string): API base URL
  - `jwt` (string): Authentication token
  - `timeout` (number): Request timeout in milliseconds

**Returns:**
Object with the following properties:
- `loading` (Ref<boolean>): Reactive loading state
- `error` (Ref<Error | null>): Reactive error state
- `listIntegrations` (Function): Fetch all integrations
- `createIntegration` (Function): Create new integration

**Example:**
```javascript
import { useApiClient } from '@friggframework/ui-vue';

const { loading, error, listIntegrations } = useApiClient({
  baseUrl: 'https://api.frigg.dev',
  jwt: 'your-jwt-token'
});

// Fetch integrations with automatic loading state
const integrations = await listIntegrations();
```

This style guide ensures consistent, professional documentation across the entire Frigg Framework ecosystem, making it easier for developers to adopt and contribute to the project.