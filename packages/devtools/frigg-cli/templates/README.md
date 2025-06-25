# Frigg CLI Templates

This directory contains templates used by the Frigg CLI for initializing new projects.

## Structure

```
templates/
├── backend/          # Backend template for Frigg applications
│   ├── src/         # Source code including integrations and routers
│   ├── test/        # Test files and fixtures
│   ├── serverless.yml # Serverless framework configuration
│   ├── package.json  # Node.js dependencies and scripts
│   └── ...          # Other backend configuration files
└── README.md        # This file
```

## Backend Template

The backend template provides a complete Frigg backend application structure with:

- **Serverless Framework** configuration for AWS Lambda deployment
- **Express.js** application with pre-configured routers
- **Integration framework** with sample HubSpot integration
- **Testing setup** with Jest
- **Docker** configuration for local development
- **Webpack** configuration for bundling

### Key Features

1. **Pre-configured Routes**:
   - `/api/integrations` - Integration management endpoints
   - `/api/authorize` - OAuth authorization flow
   - `/user` - User management endpoints
   - `/api/demo/sample` - Demo endpoints

2. **Integration Support**:
   - Sample HubSpot integration
   - Base integration structure for easy extension
   - Built-in OAuth flow handling

3. **Development Tools**:
   - Local development with `serverless-offline`
   - Docker Compose for database services
   - Jest testing configuration
   - ESLint and Prettier setup

## Usage

The templates are used by the `frigg init` command to scaffold new projects:

```bash
frigg init my-project
```

This will create a new directory with the backend template copied and configured for your project.