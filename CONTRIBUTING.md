# Contributing to Frigg

Welcome to the Frigg community! We're excited you're interested in contributing. This guide will help you understand our development process, project structure, and how to get your contributions merged.

## Table of Contents

- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Proposing Changes (RFCs)](#proposing-changes-rfcs)
- [Architecture Decisions (ADRs)](#architecture-decisions-adrs)
- [Code Contributions](#code-contributions)
- [API Module Development](#api-module-development)
- [Testing](#testing)
- [Documentation](#documentation)
- [Getting Help](#getting-help)

## Project Structure

Frigg is organized as a monorepo with several key components:

### Core Repository (`friggframework/frigg`)
```
frigg/
├── packages/
│   ├── core/              # Core Frigg framework
│   ├── devtools/          # CLI and development tools
│   │   ├── frigg-cli/     # Main CLI implementation
│   │   └── management-ui/ # Local development GUI (coming soon)
│   ├── ui/                # React UI components
│   ├── ui-core/           # Framework-agnostic UI core (coming soon)
│   ├── ui-vue/            # Vue.js bindings (coming soon)
│   └── ui-svelte/         # Svelte bindings (coming soon)
├── docs/                  # Documentation
├── rfcs/                  # Request for Comments
└── test-apps/             # Example applications
```

### API Module Library (`friggframework/api-module-library`)
A separate repository containing all third-party integrations:
```
api-module-library/
├── packages/
│   ├── v1-ready/          # Production-ready modules
│   └── needs-updating/    # Legacy modules needing updates
└── docs/
    └── fenestra/          # UI extension specifications
```

## Development Workflow

### 1. Setting Up Your Environment

```bash
# Clone the main repository
git clone https://github.com/friggframework/frigg.git
cd frigg

# Install dependencies
npm install

# For API module development, also clone:
git clone https://github.com/friggframework/api-module-library.git
```

### 2. Creating a Branch

We use a branch-based workflow:

```bash
# Create a feature branch from main
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b fix/issue-description

# For documentation
git checkout -b docs/what-you-are-documenting
```

### 3. Making Changes

1. Write your code following our style guidelines
2. Add tests for new functionality
3. Update documentation as needed
4. Ensure all tests pass: `npm test`
5. Run linting: `npm run lint`

### 4. Submitting a Pull Request

1. Push your branch to GitHub
2. Create a Pull Request against `main`
3. Fill out the PR template completely
4. Wait for review from maintainers

## Proposing Changes (RFCs)

For significant changes, we use an RFC (Request for Comments) process:

### When to Write an RFC

Write an RFC for:
- New features or commands
- Breaking changes
- Architectural changes
- New API module patterns
- Major dependency updates

### RFC Process

1. **Create RFC**: Copy the template from `rfcs/README.md`
2. **Number it**: Use the next available number (e.g., `0002-your-feature.md`)
3. **Draft it**: Fill out all sections thoroughly
4. **Submit PR**: Create a PR with just the RFC document
5. **Discussion**: Engage with feedback in the PR
6. **Decision**: Maintainers will accept, reject, or request changes

Example:
```bash
# Create your RFC
cp rfcs/TEMPLATE.md rfcs/0002-multi-tenant-support.md
# Edit the RFC with your proposal
# Submit PR for discussion
```

## Architecture Decisions (ADRs)

We document significant decisions using Architecture Decision Records:

### Reading ADRs

Check `docs/architecture-decisions/` to understand:
- Why we chose certain technologies
- Trade-offs we've accepted
- Historical context for decisions

### Creating ADRs

If your contribution involves architectural decisions:
1. Document the decision in a new ADR
2. Reference it in your PR
3. Update the ADR index

## Code Contributions

### Code Style

We use ESLint and Prettier for consistent code style:

```bash
# Run linting
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Commit Messages

Follow conventional commits:
```
feat: add new integration discovery UI
fix: resolve connection timeout in HubSpot module  
docs: update API module creation guide
chore: upgrade dependencies
```

### Testing Requirements

- Unit tests for all new functions
- Integration tests for API modules
- E2E tests for CLI commands
- Minimum 80% code coverage

## API Module Development

### Creating a New Module

If you're adding a new integration to the API Module Library:

1. **Use the generator**: `frigg generate api-module [name]`
2. **Follow the structure**: Check existing modules in `v1-ready/`
3. **Include Fenestra specs**: Add UI extension definitions
4. **Write comprehensive tests**: Both unit and integration
5. **Document thoroughly**: Include configuration and usage examples

### Module Requirements

Every API module must include:
- `Manager.js` - Main integration logic
- `Auth.js` - Authentication handling
- `test/` - Comprehensive test suite
- `fenestra/` - UI extension specifications
- `README.md` - Configuration and usage docs

### Submitting to API Module Library

1. Fork the `api-module-library` repository
2. Create your module in `packages/v1-ready/`
3. Ensure all tests pass
4. Submit PR with detailed description

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific package tests
npm test -- packages/core

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Writing Tests

```javascript
// Example test structure
describe('YourModule', () => {
  beforeEach(() => {
    // Setup
  });

  it('should perform expected behavior', async () => {
    // Test implementation
  });

  afterEach(() => {
    // Cleanup
  });
});
```

## Documentation

### Types of Documentation

1. **API Documentation**: JSDoc comments in code
2. **User Guides**: In `docs/` directory
3. **Module Docs**: README in each module
4. **Architecture**: ADRs and RFCs

### Documentation Standards

- Use clear, concise language
- Include code examples
- Keep it up-to-date with code changes
- Test all code examples

## Getting Help

### Resources

- **Discord**: [Join our community](https://discord.gg/frigg)
- **GitHub Issues**: For bugs and feature requests
- **Documentation**: [docs.friggframework.org](https://docs.friggframework.org)
- **Email**: support@friggframework.org

### Communication Channels

- **Questions**: Use GitHub Discussions
- **Bugs**: Open a GitHub Issue
- **Features**: Write an RFC
- **Chat**: Join our Discord

### Code of Conduct

Please read and follow our [Code of Conduct](docs/contributing/contributing/code_of_conduct.md).

## Recognition

We value all contributions! Contributors are:
- Listed in our CONTRIBUTORS file
- Mentioned in release notes
- Given credit in documentation

## License

By contributing to Frigg, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Frigg! Your efforts help make integration development easier for developers everywhere.