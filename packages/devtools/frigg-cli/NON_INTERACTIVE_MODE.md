# Frigg CLI Non-Interactive Mode

This document describes the non-interactive mode implementation for the `frigg init` command, which enables automation, CI/CD pipelines, and Docker containerization.

## Overview

The non-interactive mode allows you to initialize Frigg applications without user prompts, making it suitable for:
- Automation scripts
- CI/CD pipelines
- Docker containerization
- Infrastructure as Code
- Developer onboarding automation

## Command Line Options

### Basic Non-Interactive Flags

```bash
# Use --non-interactive flag
frigg init my-project --non-interactive --mode standalone

# Use --yes flag (alias for non-interactive with defaults)
frigg init my-project --yes --mode standalone

# Use --no-interactive flag (legacy support)
frigg init my-project --no-interactive --mode standalone
```

### Configuration Options

```bash
# Application purpose
frigg init my-project --non-interactive --app-purpose own-app
frigg init my-project --non-interactive --app-purpose platform
frigg init my-project --non-interactive --app-purpose exploring

# API module configuration
frigg init my-project --non-interactive --include-api-module
frigg init my-project --non-interactive --no-include-api-module

# Integration configuration
frigg init my-project --non-interactive --include-integrations
frigg init my-project --non-interactive --no-include-integrations

# Frontend configuration
frigg init my-project --non-interactive --frontend
frigg init my-project --non-interactive --no-frontend

# Serverless provider
frigg init my-project --non-interactive --serverless-provider aws
frigg init my-project --non-interactive --serverless-provider local

# Dependencies and Git
frigg init my-project --non-interactive --install-deps
frigg init my-project --non-interactive --no-install-deps
frigg init my-project --non-interactive --init-git
frigg init my-project --non-interactive --no-init-git
```

### Configuration File Support

```bash
# Use configuration file
frigg init my-project --config ./frigg-config.json --non-interactive
```

Example configuration file (`frigg-config.json`):
```json
{
  "deploymentMode": "standalone",
  "appPurpose": "own-app",
  "includeApiModule": true,
  "includeIntegrations": true,
  "starterIntegrations": ["salesforce", "hubspot"],
  "includeFrontend": false,
  "frontendFramework": "react",
  "demoAuthMode": "mock",
  "serverlessProvider": "aws",
  "installDependencies": true,
  "initializeGit": true
}
```

## Environment Variables

You can also configure the initialization using environment variables:

```bash
# Set environment variables
export FRIGG_DEPLOYMENT_MODE=standalone
export FRIGG_APP_PURPOSE=own-app
export FRIGG_INCLUDE_API_MODULE=true
export FRIGG_INCLUDE_INTEGRATIONS=true
export FRIGG_STARTER_INTEGRATIONS=salesforce,hubspot
export FRIGG_INCLUDE_FRONTEND=false
export FRIGG_FRONTEND_FRAMEWORK=react
export FRIGG_DEMO_AUTH_MODE=mock
export FRIGG_SERVERLESS_PROVIDER=aws
export FRIGG_INSTALL_DEPS=true
export FRIGG_INIT_GIT=true

# Run init command
frigg init my-project --non-interactive
```

### Available Environment Variables

| Variable | Description | Values |
|----------|-------------|---------|
| `FRIGG_DEPLOYMENT_MODE` | Deployment mode | `standalone`, `embedded` |
| `FRIGG_APP_PURPOSE` | Application purpose | `own-app`, `platform`, `exploring` |
| `FRIGG_INCLUDE_API_MODULE` | Include custom API module | `true`, `false` |
| `FRIGG_INCLUDE_INTEGRATIONS` | Include starter integrations | `true`, `false` |
| `FRIGG_STARTER_INTEGRATIONS` | Comma-separated list of integrations | `salesforce,hubspot,slack` |
| `FRIGG_INCLUDE_FRONTEND` | Include demo frontend | `true`, `false` |
| `FRIGG_FRONTEND_FRAMEWORK` | Frontend framework | `react`, `vue`, `svelte`, `angular` |
| `FRIGG_DEMO_AUTH_MODE` | Demo authentication mode | `mock`, `real` |
| `FRIGG_SERVERLESS_PROVIDER` | Serverless provider | `aws`, `local` |
| `FRIGG_INSTALL_DEPS` | Install dependencies | `true`, `false` |
| `FRIGG_INIT_GIT` | Initialize Git repository | `true`, `false` |

## Default Configuration

When using non-interactive mode without explicit configuration, the following defaults are used:

```javascript
{
  deploymentMode: 'standalone',
  appPurpose: 'exploring',
  needsCustomApiModule: false,
  includeIntegrations: false,
  starterIntegrations: [],
  includeDemoFrontend: false,
  frontendFramework: 'react',
  demoAuthMode: 'mock',
  serverlessProvider: 'aws', // for standalone mode
  installDependencies: true,
  initializeGit: true
}
```

## Examples

### Basic Non-Interactive Setup

```bash
# Minimal setup for exploring Frigg
frigg init my-project --non-interactive

# Standalone application for own use
frigg init my-project --non-interactive --mode standalone --app-purpose own-app

# Platform application with integrations
frigg init my-project --non-interactive --mode standalone --app-purpose platform --include-integrations
```

### CI/CD Pipeline Example

```bash
#!/bin/bash
# CI/CD pipeline script

# Set configuration via environment variables
export FRIGG_DEPLOYMENT_MODE=standalone
export FRIGG_APP_PURPOSE=own-app
export FRIGG_INCLUDE_API_MODULE=true
export FRIGG_INCLUDE_INTEGRATIONS=true
export FRIGG_STARTER_INTEGRATIONS=salesforce,hubspot
export FRIGG_INSTALL_DEPS=true
export FRIGG_INIT_GIT=true

# Initialize Frigg application
frigg init my-frigg-app --non-interactive

# Build and deploy
cd my-frigg-app
npm run build
npm run deploy
```

### Docker Containerization Example

```dockerfile
FROM node:18-alpine

# Install Frigg CLI
RUN npm install -g @friggframework/devtools

# Set non-interactive configuration
ENV FRIGG_DEPLOYMENT_MODE=standalone
ENV FRIGG_APP_PURPOSE=platform
ENV FRIGG_INCLUDE_INTEGRATIONS=true
ENV FRIGG_INSTALL_DEPS=true
ENV FRIGG_INIT_GIT=false

# Initialize Frigg application
RUN frigg init my-app --non-interactive

WORKDIR /my-app
EXPOSE 3001

CMD ["npm", "start"]
```

### Configuration File Example

```bash
# Create configuration file
cat > frigg-config.json << EOF
{
  "deploymentMode": "standalone",
  "appPurpose": "platform",
  "includeApiModule": false,
  "includeIntegrations": true,
  "starterIntegrations": ["salesforce", "hubspot", "slack"],
  "includeFrontend": true,
  "frontendFramework": "react",
  "demoAuthMode": "mock",
  "serverlessProvider": "aws",
  "installDependencies": true,
  "initializeGit": true
}
EOF

# Use configuration file
frigg init my-platform --config frigg-config.json --non-interactive
```

## Error Handling

The non-interactive mode includes proper error handling:

- **Missing templates**: Creates basic templates if they don't exist
- **Invalid configuration**: Shows clear error messages and exits gracefully
- **Dependency issues**: Continues with warnings if dependency installation fails
- **Git initialization**: Continues if Git initialization fails (not critical)

## Testing

The non-interactive mode is thoroughly tested with:

- Unit tests for configuration merging
- Integration tests for command-line options
- Environment variable testing
- Configuration file testing
- Error handling scenarios

Run tests with:
```bash
npm test -- --testPathPattern="init-command"
```

## Migration from Interactive Mode

If you have existing scripts using interactive mode, you can migrate them by:

1. Adding `--non-interactive` flag
2. Specifying required options explicitly
3. Using environment variables for configuration
4. Creating configuration files for complex setups

## Troubleshooting

### Common Issues

1. **Command hangs**: Make sure you're using `--non-interactive` or `--yes` flag
2. **Missing templates**: The CLI will create basic templates automatically
3. **Dependency errors**: Check that you're in a valid Node.js environment
4. **Configuration conflicts**: Command-line options override environment variables and config files

### Debug Mode

Use `--verbose` flag for detailed output:
```bash
frigg init my-project --non-interactive --verbose
```

## Implementation Details

The non-interactive mode is implemented in:

- `init-command/index.js`: Command-line option parsing and configuration merging
- `init-command/backend-first-handler.js`: Non-interactive logic and default configuration
- `index.js`: CLI argument definitions

Key features:
- Configuration precedence: CLI options > Environment variables > Config file > Defaults
- Graceful error handling
- Comprehensive testing
- Backward compatibility with existing interactive mode