# Getting Started with Frigg Framework

Welcome to the Frigg Framework! This section provides comprehensive getting started guides for each supported frontend framework and the core backend system.

## Choose Your Path

Frigg Framework supports multiple frontend frameworks, allowing you to integrate with your existing tech stack or start fresh with your preferred framework.

### 🚀 Quick Framework Selection

| Framework | Best For | Guide |
|-----------|----------|-------|
| **React** | Existing React apps, component-based architecture | [React Guide](./react.md) |
| **Vue.js** | Reactive applications, composition API fans | [Vue.js Guide](./vue.md) |
| **Angular** | Enterprise applications, TypeScript-first | [Angular Guide](./angular.md) |
| **Svelte** | Performance-focused apps, minimal bundle size | [Svelte Guide](./svelte.md) |
| **Backend Only** | API-first, headless integrations | [Backend Guide](./backend-only.md) |

### 🎯 Choose by Use Case

#### Building Integration Marketplace
If you're building an integration marketplace or directory for your users:
- **Recommended**: React or Vue.js for mature ecosystem and component libraries
- **Start with**: [React Guide](./react.md) or [Vue.js Guide](./vue.md)

#### Enterprise Integration Management
If you're building internal integration management tools:
- **Recommended**: Angular for enterprise features and TypeScript
- **Start with**: [Angular Guide](./angular.md)

#### High-Performance Integration Dashboard
If performance and bundle size are critical:
- **Recommended**: Svelte for optimal performance
- **Start with**: [Svelte Guide](./svelte.md)

#### API-Only Integration Service
If you only need backend integration capabilities:
- **Recommended**: Backend-only setup with optional CLI management
- **Start with**: [Backend Guide](./backend-only.md)

## Common Prerequisites

Before starting with any framework, ensure you have:

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 8+ or **yarn** 1.22+ (included with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Recommended Tools
- **VS Code** with Frigg extension ([Download](https://code.visualstudio.com/))
- **Docker** for local development ([Download](https://docker.com/))
- **AWS CLI** for deployment ([Installation Guide](https://aws.amazon.com/cli/))

### Environment Setup
```bash
# Verify Node.js version
node --version  # Should be 18+

# Verify npm version  
npm --version   # Should be 8+

# Install Frigg CLI globally
npm install -g @friggframework/devtools

# Verify installation
frigg --version
```

## Universal Concepts

Regardless of your chosen framework, you'll work with these core Frigg concepts:

### 🔌 Integrations
Self-contained modules that handle authentication, data exchange, and business logic for specific third-party services (e.g., Salesforce, HubSpot, Slack).

### 🏗️ Core Framework
The backend engine (`@friggframework/core`) that provides:
- Authentication management
- Data encryption and security
- Integration lifecycle management
- Serverless deployment capabilities

### 🎨 UI Frameworks
Frontend packages that provide framework-specific components and utilities:
- `@friggframework/ui-react` - React components and hooks
- `@friggframework/ui-vue` - Vue composables and components  
- `@friggframework/ui-angular` - Angular services and components
- `@friggframework/ui-svelte` - Svelte stores and components

### 🛠️ Development Tools
CLI and development utilities (`@friggframework/devtools`) for:
- Project scaffolding
- Local development server
- Deployment management
- Integration testing

## Learning Path

### 1. **Start Here** (15 minutes)
Choose your framework guide above and complete the "Quick Start" section to get a working integration running locally.

### 2. **Core Concepts** (30 minutes)
Read through [Core Concepts](../reference/core-concepts.md) to understand how Frigg works under the hood.

### 3. **Build Your First Integration** (1 hour)
Follow the [First Integration Tutorial](../tutorials/your-first-integration.md) to build a complete integration from scratch.

### 4. **Explore Advanced Features** (Ongoing)
- [Authentication Patterns](../tutorials/authentication-patterns.md)
- [Data Synchronization](../tutorials/data-synchronization.md)
- [Error Handling and Monitoring](../tutorials/error-handling.md)
- [Performance Optimization](../tutorials/performance-optimization.md)

## Migration from Existing Solutions

Already using another integration framework or custom solution?

### From Zapier/Similar iPaaS
- [Migrating from iPaaS Solutions](../migration/from-ipaas.md)
- Benefits: Own your data, custom UI, no per-operation costs

### From Custom Integration Code
- [Migrating Custom Integrations](../migration/from-custom.md)
- Benefits: Standardized patterns, built-in auth, monitoring

### From create-frigg-app (Legacy)
- [Migrating from create-frigg-app](../migration/from-create-frigg-app.md)
- [Automated Migration Tool](../migration/automated-migration.md)

## Community and Support

### 📚 Documentation
- [API Reference](../reference/api-reference.md)
- [Troubleshooting Guide](../support/troubleshooting.md)
- [FAQ](../support/frequently-asked-questions.md)

### 💬 Community
- [Discord Community](https://discord.gg/frigg) - Real-time chat and support
- [GitHub Discussions](https://github.com/friggframework/frigg/discussions) - Feature requests and Q&A
- [Stack Overflow](https://stackoverflow.com/questions/tagged/frigg-framework) - Technical questions

### 🆘 Professional Support
- [Enterprise Support](https://friggframework.org/enterprise) - Dedicated support and consulting
- [Training Workshops](https://friggframework.org/training) - Team training and best practices
- [Custom Development](https://lefthook.com) - Professional services from the Frigg creators

## Next Steps

Ready to dive in? Choose your framework guide:

- 🔵 [**React Getting Started →**](./react.md)
- 🟢 [**Vue.js Getting Started →**](./vue.md)  
- 🔴 [**Angular Getting Started →**](./angular.md)
- 🟠 [**Svelte Getting Started →**](./svelte.md)
- ⚫ [**Backend Only →**](./backend-only.md)

Or explore the [Tutorial Series](../tutorials/) to learn by building real integrations.

---

**Need help choosing?** Join our [Discord community](https://discord.gg/frigg) and ask our team and community members for personalized recommendations based on your specific use case.