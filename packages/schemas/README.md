# @friggframework/schemas

Canonical JSON Schema definitions for the Frigg Framework, providing formal validation and documentation for all core configuration objects.

## Overview

This package contains the official, versioned schemas for:

- **App Definition**: Configuration for Frigg applications
- **Integration Definition**: Configuration for Frigg integrations  
- **API Module Definition**: Configuration for Frigg API modules
- **Serverless Configuration**: AWS deployment configuration
- **Environment Configuration**: Environment variable management
- **Core Models**: User, Entity, and Credential data models

## Installation

```bash
npm install @friggframework/schemas
```

## Usage

### Basic Validation

```javascript
const { validateAppDefinition } = require('@friggframework/schemas');

const appDefinition = {
    integrations: [],
    user: { password: true },
    encryption: { fieldLevelEncryptionMethod: 'kms' }
};

const result = validateAppDefinition(appDefinition);

if (result.valid) {
    console.log('✅ App definition is valid');
} else {
    console.error('❌ Validation errors:', result.errors);
}
```

### Advanced Validation

```javascript
const { validate, formatErrors } = require('@friggframework/schemas');

// Validate any schema by name
const result = validate('integration-definition', integrationData);

if (!result.valid) {
    console.error('Validation failed:');
    console.error(formatErrors(result.errors));
}
```

### Schema Introspection

```javascript
const { getSchemas, getSchema } = require('@friggframework/schemas');

// Get all available schemas
const allSchemas = getSchemas();
console.log('Available schemas:', Object.keys(allSchemas));

// Get a specific schema
const appSchema = getSchema('app-definition');
console.log('App definition schema:', appSchema);
```

## Available Schemas

### App Definition Schema

Defines the structure for Frigg application configuration.

**Key Properties:**
- `integrations` (required): Array of integration classes
- `user`: User management configuration
- `security`: CORS, rate limiting, and security settings
- `encryption`: KMS and encryption settings
- `logging`: Logging configuration
- `custom`: Application-specific settings

**Example:**
```javascript
const appDefinition = {
    integrations: [HubSpotIntegration],
    user: { password: true },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
    vpc: { enable: true },
    security: {
        cors: {
            origin: "http://localhost:3000",
            credentials: true
        }
    },
    logging: { level: "info" },
    custom: {
        appName: "My Frigg App",
        version: "1.0.0",
        environment: "development"
    }
};
```

### Integration Definition Schema

Defines the structure for Frigg integrations.

**Key Properties:**
- `name` (required): Integration identifier
- `version` (required): Semantic version
- `options`: Configuration options and display properties
- `capabilities`: Authentication, webhooks, sync capabilities
- `requirements`: Environment variables and dependencies

**Example:**
```javascript
const integrationDefinition = {
    name: "hubspot",
    version: "2.0.0",
    options: {
        type: "api",
        hasUserConfig: true,
        display: {
            name: "HubSpot CRM",
            description: "Integrate with HubSpot for CRM functionality",
            category: "CRM",
            tags: ["crm", "marketing"]
        }
    },
    capabilities: {
        auth: ["oauth2"],
        webhooks: true,
        sync: { bidirectional: true, incremental: true }
    }
};
```

### API Module Definition Schema

Defines the structure for Frigg API modules.

**Key Properties:**
- `moduleName` (required): Module identifier
- `getName` (required): Function returning module name
- `requiredAuthMethods` (required): Authentication configuration
- `env`: Environment variable configuration
- `config`: Module-specific configuration

**Example:**
```javascript
const apiModuleDefinition = {
    moduleName: "hubspot",
    getName: function() { return "hubspot"; },
    requiredAuthMethods: {
        getToken: async function(api, params) { /* implementation */ },
        apiPropertiesToPersist: {
            credential: ["access_token", "refresh_token"],
            entity: ["external_id", "portal_id"]
        },
        getCredentialDetails: async function(api) { /* implementation */ },
        testAuthRequest: async function() { /* implementation */ }
    },
    env: {
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET
    }
};
```

### Serverless Configuration Schema

Defines the structure for Serverless Framework configuration used in AWS deployments.

**Key Properties:**
- `service` (required): Service name for the deployment
- `provider` (required): Cloud provider configuration (AWS, runtime, region, etc.)
- `functions`: Lambda function definitions with handlers and events
- `resources`: CloudFormation resource definitions
- `plugins`: Serverless Framework plugins

**Example:**
```javascript
const serverlessConfig = {
    frameworkVersion: ">=3.17.0",
    service: "frigg-backend",
    provider: {
        name: "aws",
        runtime: "nodejs20.x",
        timeout: 30,
        region: "us-east-1"
    },
    functions: {
        api: {
            handler: "./src/api.handler",
            events: [{
                http: {
                    path: "/api/{proxy+}",
                    method: "ANY",
                    cors: true
                }
            }]
        }
    }
};
```

### Environment Configuration Schema

Defines the structure for environment variable management and validation.

**Key Properties:**
- `environments`: Environment-specific configurations (development, staging, production)
- `global`: Global settings for masking, encryption, and audit logging
- `templates`: Reusable templates for different integration types

**Example:**
```javascript
const environmentConfig = {
    environments: {
        development: {
            variables: {
                DATABASE_URL: {
                    value: "mongodb://localhost:27017/frigg-dev",
                    required: true,
                    sensitive: true,
                    description: "MongoDB connection string"
                }
            },
            integrations: {
                hubspot: {
                    required: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
                    prefix: "HUBSPOT"
                }
            }
        }
    },
    global: {
        encryptionKeys: {
            kmsKeyId: "12345678-1234-1234-1234-123456789abc",
            algorithm: "AES-256-GCM"
        }
    }
};
```

### Core Models Schema

Defines the structure for core Frigg data models including User, Entity, and Credential.

**Key Properties:**
- `user`: User model with authentication, preferences, and permissions
- `credential`: Authentication credential storage with encryption
- `entity`: Data entity configuration with sync settings

**Example:**
```javascript
const coreModels = {
    user: {
        _id: "507f1f77bcf86cd799439011",
        email: "user@example.com",
        role: "user",
        permissions: ["integrations:read", "integrations:write"],
        preferences: {
            theme: "dark",
            notifications: { email: true }
        }
    },
    credential: {
        _id: "507f1f77bcf86cd799439012",
        userId: "507f1f77bcf86cd799439011",
        subType: "hubspot",
        authIsValid: true,
        authData: {
            access_token: "encrypted_token",
            token_type: "Bearer"
        }
    },
    entity: {
        _id: "507f1f77bcf86cd799439013",
        credentialId: "507f1f77bcf86cd799439012",
        userId: "507f1f77bcf86cd799439011",
        subType: "contact",
        name: "HubSpot Contacts",
        status: "active"
    }
};
```

## API Reference

### Validation Functions

#### `validate(schemaName, data)`
Validates data against a named schema.

**Parameters:**
- `schemaName` (string): Name of schema ('app-definition', 'integration-definition', 'api-module-definition', 'serverless-config', 'environment-config', 'core-models')
- `data` (object): Data to validate

**Returns:** `{ valid: boolean, errors: array|null, data: object }`

#### `validateAppDefinition(appDefinition)`
Validates an app definition object.

#### `validateIntegrationDefinition(integrationDefinition)`
Validates an integration definition object.

#### `validateApiModuleDefinition(apiModuleDefinition)`
Validates an API module definition object.

#### `validateServerlessConfig(serverlessConfig)`
Validates a Serverless Framework configuration object.

#### `validateEnvironmentConfig(environmentConfig)`
Validates an environment configuration object.

#### `validateCoreModels(coreModels)`
Validates core data models (User, Entity, Credential).

### Schema Access Functions

#### `getSchemas()`
Returns all available schemas as an object.

#### `getSchema(schemaName)`
Returns a specific schema by name.

### Utility Functions

#### `formatErrors(errors)`
Formats AJV validation errors for human-readable output.

## Development

### Running Schema Validation

```bash
npm run validate
```

This validates all schemas against the JSON Schema meta-schema and tests all examples.

### Testing

```bash
npm test
```

## Schema Versioning

Schemas follow semantic versioning. Breaking changes to schemas will result in major version bumps.

Current schema versions:
- App Definition: Draft-07 (JSON Schema)
- Integration Definition: Draft-07 (JSON Schema)  
- API Module Definition: Draft-07 (JSON Schema)
- Serverless Configuration: Draft-07 (JSON Schema)
- Environment Configuration: Draft-07 (JSON Schema)
- Core Models: Draft-07 (JSON Schema)

## Contributing

When updating schemas:

1. Update the schema file in `schemas/`
2. Update examples in the schema
3. Run `npm run validate` to ensure validity
4. Update this README if needed
5. Update version if breaking changes

## License

MIT - see LICENSE file for details.