# Frigg Core

The `@friggframework/core` package is the foundational layer of the Frigg Framework, implementing a hexagonal architecture pattern for building scalable, maintainable enterprise integrations. It provides the essential building blocks, domain logic, and infrastructure components that power the entire Frigg ecosystem.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Components](#core-components)
- [Hexagonal Architecture](#hexagonal-architecture)
- [Usage Examples](#usage-examples)
- [Testing](#testing)
- [Development](#development)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## Architecture Overview

Frigg Core implements a **hexagonal architecture** (also known as ports and adapters) that separates business logic from external concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Inbound Adapters                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Express     │  │ Lambda      │  │ WebSocket   │        │
│  │ Routes      │  │ Handlers    │  │ Handlers    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Use Cases   │  │ Services    │  │ Coordinators│        │
│  │ (Business   │  │             │  │             │        │
│  │ Logic)      │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Domain Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Integration │  │ Entities    │  │ Value       │        │
│  │ Aggregates  │  │             │  │ Objects     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Outbound Adapters                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Database    │  │ API Modules │  │ Event       │        │
│  │ Repositories│  │             │  │ Publishers  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @friggframework/core
# or
yarn add @friggframework/core
```

### Prerequisites

- Node.js 16+ 
- MongoDB 4.4+ (for data persistence)
- AWS credentials (for SQS, KMS, Lambda deployment)

### Environment Variables

```bash
# Database
MONGO_URI=mongodb://localhost:27017/frigg
FRIGG_ENCRYPTION_KEY=your-256-bit-encryption-key

# AWS (Optional - for production deployments)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Logging
DEBUG=frigg:*
LOG_LEVEL=info
```

## Core Components

### 1. Integrations (`/integrations`)

The heart of the framework - manages integration lifecycle and business logic.

**Key Classes:**
- `IntegrationBase` - Base class for all integrations
- `Integration` - Domain aggregate using Proxy pattern
- Use cases: `CreateIntegration`, `UpdateIntegration`, `DeleteIntegration`

**Usage:**
```javascript
const { IntegrationBase } = require('@friggframework/core');

class SlackHubSpotSync extends IntegrationBase {
    static Definition = {
        name: 'slack-hubspot-sync',
        version: '2.1.0',
        modules: {
            slack: 'slack',
            hubspot: 'hubspot'
        }
    };

    async onCreate({ integrationId }) {
        // Setup webhooks, initial sync, etc.
        await this.slack.createWebhook(process.env.WEBHOOK_URL);
        await this.hubspot.setupContactSync();
        await super.onCreate({ integrationId });
    }
}
```

### 3. Database (`/database`)

MongoDB integration with Mongoose ODM.

**Key Components:**
- Connection management
- Pre-built models (User, Integration, Credential, etc.)
- Schema definitions

**Usage:**
```javascript
const { 
    connectToDatabase, 
    IntegrationModel, 
    UserModel 
} = require('@friggframework/core');

await connectToDatabase();

// Query integrations
const userIntegrations = await IntegrationModel.find({ 
    userId: 'user-123',
    status: 'ENABLED' 
});

// Create user
const user = new UserModel({
    email: 'user@example.com',
    name: 'John Doe'
});
await user.save();
```

### 4. Encryption (`/encrypt`)

AES-256-GCM encryption for sensitive data.

**Usage:**
```javascript
const { Encrypt, Cryptor } = require('@friggframework/core');

// Simple encryption
const encrypted = Encrypt.encrypt('sensitive-data');
const decrypted = Encrypt.decrypt(encrypted);

// Advanced encryption with custom key
const cryptor = new Cryptor(process.env.CUSTOM_KEY);
const secureData = cryptor.encrypt(JSON.stringify({
    accessToken: 'oauth-token',
    refreshToken: 'refresh-token'
}));
```

### 5. Error Handling (`/errors`)

Standardized error types with proper HTTP status codes.

**Usage:**
```javascript
const { 
    BaseError, 
    RequiredPropertyError, 
    FetchError 
} = require('@friggframework/core');

// Custom business logic error
throw new RequiredPropertyError('userId is required');

// API communication error
throw new FetchError('Failed to fetch data from external API', {
    statusCode: 404,
    response: errorResponse
});

// Base error with custom properties
throw new BaseError('Integration failed', {
    integrationId: 'int-123',
    errorCode: 'SYNC_FAILED'
});
```

### 6. Logging (`/logs`)

Structured logging with debug capabilities.

**Usage:**
```javascript
const { debug, initDebugLog, flushDebugLog } = require('@friggframework/core');

// Initialize debug logging
initDebugLog('integration:slack');

// Log debug information
debug('Processing webhook payload', { 
    eventType: 'contact.created',
    payload: webhookData 
});

// Flush logs (useful in serverless environments)
await flushDebugLog();
```

### 7. User Management (`/user`)

Comprehensive user authentication and authorization system supporting both individual and organizational users.

**Key Classes:**
- `User` - Domain aggregate for user entities
- `UserRepository` - Data access for user operations
- Use cases: `LoginUser`, `CreateIndividualUser`, `CreateOrganizationUser`, `GetUserFromBearerToken`

**User Types:**
- **Individual Users**: Personal accounts with email/username authentication
- **Organization Users**: Business accounts with organization-level access
- **Hybrid Mode**: Support for both user types simultaneously

**Authentication Methods:**
- **Password-based**: Traditional username/password authentication
- **Token-based**: Bearer token authentication with session management
- **App-based**: External app user ID authentication (passwordless)

**Usage:**
```javascript
const { 
    LoginUser, 
    CreateIndividualUser, 
    GetUserFromBearerToken,
    UserRepository 
} = require('@friggframework/core');

// Configure user behavior in app definition
const userConfig = {
    usePassword: true,
    primary: 'individual', // or 'organization'
    individualUserRequired: true,
    organizationUserRequired: false
};

const userRepository = new UserRepository({ userConfig });

// Create individual user
const createUser = new CreateIndividualUser({ userRepository, userConfig });
const user = await createUser.execute({
    email: 'user@example.com',
    username: 'john_doe',
    password: 'secure_password',
    appUserId: 'external_user_123' // Optional external reference
});

// Login user
const loginUser = new LoginUser({ userRepository, userConfig });
const authenticatedUser = await loginUser.execute({
    username: 'john_doe',
    password: 'secure_password'
});

// Token-based authentication
const getUserFromToken = new GetUserFromBearerToken({ userRepository, userConfig });
const user = await getUserFromToken.execute('Bearer eyJhbGciOiJIUzI1NiIs...');

// Access user properties
console.log('User ID:', user.getId());
console.log('Primary user:', user.getPrimaryUser());
console.log('Individual user:', user.getIndividualUser());
console.log('Organization user:', user.getOrganizationUser());
```

### 8. Lambda Utilities (`/lambda`)

AWS Lambda-specific utilities and helpers.

**Usage:**
```javascript
const { TimeoutCatcher } = require('@friggframework/core');

exports.handler = async (event, context) => {
    const timeoutCatcher = new TimeoutCatcher(context);
    
    try {
        // Long-running integration process
        const result = await processIntegrationSync(event);
        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        if (timeoutCatcher.isNearTimeout()) {
            // Handle graceful shutdown
            await saveProgressState(event);
            return { statusCode: 202, body: 'Processing continues...' };
        }
        throw error;
    }
};
```

## User Management & Behavior

Frigg Core provides a flexible user management system that supports various authentication patterns and user types. The system is designed around the concept of **Individual Users** (personal accounts) and **Organization Users** (business accounts), with configurable authentication methods.

### User Configuration

User behavior is configured in the app definition, allowing you to customize authentication requirements:

```javascript
// App Definition with User Configuration
const appDefinition = {
    integrations: [HubSpotIntegration],
    user: {
        usePassword: true,                    // Enable password authentication
        primary: 'individual',               // Primary user type: 'individual' or 'organization'
        organizationUserRequired: true,      // Require organization user
        individualUserRequired: true,        // Require individual user
    }
};
```

### User Domain Model

The `User` class provides a rich domain model with behavior:

```javascript
const { User } = require('@friggframework/core');

// User instance methods
const user = new User(individualUser, organizationUser, usePassword, primary);

// Access methods
user.getId()                    // Get primary user ID
user.getPrimaryUser()          // Get primary user based on config
user.getIndividualUser()       // Get individual user
user.getOrganizationUser()     // Get organization user

// Validation methods
user.isPasswordRequired()      // Check if password is required
user.isPasswordValid(password) // Validate password
user.isIndividualUserRequired() // Check individual user requirement
user.isOrganizationUserRequired() // Check organization user requirement

// Configuration methods
user.setIndividualUser(individualUser)
user.setOrganizationUser(organizationUser)
```

### Database Models

The user system uses MongoDB with Mongoose for data persistence:

```javascript
// Individual User Schema
{
    email: String,
    username: { type: String, unique: true },
    hashword: String,           // Encrypted password
    appUserId: String,          // External app reference
    organizationUser: ObjectId  // Reference to organization
}

// Organization User Schema
{
    name: String,
    appOrgId: String,          // External organization reference
    domain: String,
    settings: Object
}

// Session Token Schema
{
    user: ObjectId,            // Reference to user
    token: String,             // Encrypted token
    expires: Date,
    created: Date
}
```

### Security Features

- **Password Hashing**: Uses bcrypt with configurable salt rounds
- **Token Management**: Secure session tokens with expiration
- **Unique Constraints**: Enforced username and email uniqueness
- **External References**: Support for external app user/org IDs
- **Flexible Authentication**: Multiple authentication methods

## Hexagonal Architecture

### Use Case Pattern

Each business operation is encapsulated in a use case class:

```javascript
class UpdateIntegrationStatus {
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    async execute(integrationId, newStatus) {
        // Business logic validation
        if (!['ENABLED', 'DISABLED', 'ERROR'].includes(newStatus)) {
            throw new Error('Invalid status');
        }

        // Domain operation
        const integration = await this.integrationRepository.findById(integrationId);
        if (!integration) {
            throw new Error('Integration not found');
        }

        // Update and persist
        integration.status = newStatus;
        integration.updatedAt = new Date();
        
        return await this.integrationRepository.save(integration);
    }
}
```

### Repository Pattern

Data access is abstracted through repositories:

```javascript
class IntegrationRepository {
    async findById(id) {
        return await IntegrationModel.findById(id);
    }

    async findByUserId(userId) {
        return await IntegrationModel.find({ userId, deletedAt: null });
    }

    async save(integration) {
        return await integration.save();
    }

    async createIntegration(entities, userId, config) {
        const integration = new IntegrationModel({
            entitiesIds: entities,
            userId,
            config,
            status: 'NEW',
            createdAt: new Date()
        });
        return await integration.save();
    }
}
```

### Domain Aggregates

Complex business objects with behavior:

```javascript
const Integration = new Proxy(class {}, {
    construct(target, args) {
        const [params] = args;
        const instance = new params.integrationClass(params);
        
        // Attach domain properties
        Object.assign(instance, {
            id: params.id,
            userId: params.userId,
            entities: params.entities,
            config: params.config,
            status: params.status,
            modules: params.modules
        });

        return instance;
    }
});
```

## Usage Examples

### Real-World HubSpot Integration Example

Here's a complete, production-ready HubSpot integration that demonstrates advanced Frigg features:

```javascript
const {
    get,
    IntegrationBase,
    WebsocketConnection,
} = require('@friggframework/core');
const FriggConstants = require('../utils/constants');
const hubspot = require('@friggframework/api-module-hubspot');
const testRouter = require('../testRouter');
const extensions = require('../extensions');

class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        hasUserConfig: true,

        display: {
            label: 'HubSpot',
            description: hubspot.Config.description,
            category: 'Sales & CRM, Marketing',
            detailsUrl: 'https://hubspot.com',
            icon: hubspot.Config.logoUrl,
        },
        modules: {
            hubspot: {
                definition: hubspot.Definition,
            },
        },
        // Express routes for webhook endpoints and custom APIs
        routes: [
            {
                path: '/hubspot/webhooks',
                method: 'POST',
                event: 'HUBSPOT_WEBHOOK',
            },
            testRouter,
        ],
    };

    constructor() {
        super();
        
        // Define event handlers for various integration actions
        this.events = {
            // Webhook handler with real-time WebSocket broadcasting
            HUBSPOT_WEBHOOK: {
                handler: async ({ data, context }) => {
                    console.log('Received HubSpot webhook:', data);

                    // Broadcast to all connected WebSocket clients
                    const activeConnections = await WebsocketConnection.getActiveConnections();
                    const message = JSON.stringify({
                        type: 'HUBSPOT_WEBHOOK',
                        data,
                    });

                    activeConnections.forEach((connection) => {
                        connection.send(message);
                    });
                },
            },
            
            // User action: Get sample data with formatted table output
            [FriggConstants.defaultEvents.GET_SAMPLE_DATA]: {
                type: FriggConstants.eventTypes.USER_ACTION,
                handler: this.getSampleData,
                title: 'Get Sample Data',
                description: 'Get sample data from HubSpot and display in a formatted table',
                userActionType: 'QUICK_ACTION',
            },
            
            // User action: List available objects
            GET_OBJECT_LIST: {
                type: FriggConstants.eventTypes.USER_ACTION,
                handler: this.getObjectList,
                title: 'Get Object List',
                description: 'Get list of available HubSpot objects',
                userActionType: 'DATA',
            },
            
            // User action: Create records with dynamic forms
            CREATE_RECORD: {
                type: FriggConstants.eventTypes.USER_ACTION,
                handler: this.createRecord,
                title: 'Create Record',
                description: 'Create a new record in HubSpot',
                userActionType: 'DATA',
            },
        };
        
        // Extension system for modular functionality
        this.extensions = {
            hubspotWebhooks: {
                extension: extensions.hubspotWebhooks,
                handlers: {
                    WEBHOOK_EVENT: this.handleWebhookEvent,
                },
            },
        };
    }

    // Business logic: Fetch and format sample data
    async getSampleData({ objectName }) {
        let res;
        switch (objectName) {
            case 'deals':
                res = await this.hubspot.api.searchDeals({
                    properties: ['dealname,amount,closedate'],
                });
                break;
            case 'contacts':
                res = await this.hubspot.api.listContacts({
                    after: 0,
                    properties: 'firstname,lastname,email',
                });
                break;
            case 'companies':
                res = await this.hubspot.api.searchCompanies({
                    properties: ['name,website,email'],
                    limit: 100,
                });
                break;
            default:
                throw new Error(`Unsupported object type: ${objectName}`);
        }

        const portalId = this.hubspot.entity.externalId;

        // Format data with HubSpot record links
        const formatted = res.results.map((item) => {
            const formattedItem = {
                linkToRecord: `https://app.hubspot.com/contacts/${portalId}/${objectName}/${item.id}/`,
                id: item.id,
            };

            // Clean and format properties
            for (const [key, value] of Object.entries(item.properties)) {
                if (value !== null && value !== undefined && value !== '') {
                    formattedItem[key] = value;
                }
            }
            delete formattedItem.hs_object_id;

            return formattedItem;
        });

        return { label: objectName, data: formatted };
    }

    // Return available HubSpot object types
    async getObjectList() {
        return [
            { key: 'deals', label: 'Deals' },
            { key: 'contacts', label: 'Contacts' },
            { key: 'companies', label: 'Companies' },
        ];
    }

    // Create records based on object type
    async createRecord(args) {
        let res;
        const objectType = args.objectType;
        delete args.objectType;
        
        switch (objectType.toLowerCase()) {
            case 'deal':
                res = await this.hubspot.api.createDeal({ ...args });
                break;
            case 'company':
                res = await this.hubspot.api.createCompany({ ...args });
                break;
            case 'contact':
                res = await this.hubspot.api.createContact({ ...args });
                break;
            default:
                throw new Error(`Unsupported object type: ${objectType}`);
        }
        return { data: res };
    }

    // Dynamic form generation based on action and context
    async getActionOptions({ actionId, data }) {
        switch (actionId) {
            case 'CREATE_RECORD':
                let jsonSchema = {
                    type: 'object',
                    properties: {
                        objectType: {
                            type: 'string',
                            title: 'Object Type',
                        },
                    },
                    required: [],
                };
                
                let uiSchema = {
                    type: 'HorizontalLayout',
                    elements: [
                        {
                            type: 'Control',
                            scope: '#/properties/objectType',
                            rule: { effect: 'HIDE', condition: {} },
                        },
                    ],
                };

                // Generate form fields based on object type
                switch (data.name.toLowerCase()) {
                    case 'deal':
                        jsonSchema.properties = {
                            ...jsonSchema.properties,
                            dealname: { type: 'string', title: 'Deal Name' },
                            amount: { type: 'number', title: 'Amount' },
                        };
                        jsonSchema.required = ['dealname', 'amount'];
                        uiSchema.elements.push(
                            { type: 'Control', scope: '#/properties/dealname' },
                            { type: 'Control', scope: '#/properties/amount' }
                        );
                        break;
                        
                    case 'company':
                        jsonSchema.properties = {
                            ...jsonSchema.properties,
                            name: { type: 'string', title: 'Company Name' },
                            website: { type: 'string', title: 'Website URL' },
                        };
                        jsonSchema.required = ['name', 'website'];
                        uiSchema.elements.push(
                            { type: 'Control', scope: '#/properties/name' },
                            { type: 'Control', scope: '#/properties/website' }
                        );
                        break;
                        
                    case 'contact':
                        jsonSchema.properties = {
                            ...jsonSchema.properties,
                            firstname: { type: 'string', title: 'First Name' },
                            lastname: { type: 'string', title: 'Last Name' },
                            email: { type: 'string', title: 'Email Address' },
                        };
                        jsonSchema.required = ['firstname', 'lastname', 'email'];
                        uiSchema.elements.push(
                            { type: 'Control', scope: '#/properties/firstname' },
                            { type: 'Control', scope: '#/properties/lastname' },
                            { type: 'Control', scope: '#/properties/email' }
                        );
                        break;
                        
                    default:
                        throw new Error(`Unsupported object type: ${data.name}`);
                }

                return {
                    jsonSchema,
                    uiSchema,
                    data: { objectType: data.name },
                };
        }
        return null;
    }

    async getConfigOptions() {
        // Return configuration options for the integration
        return {};
    }
}

module.exports = HubSpotIntegration;
```

index.js
```js
const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');

const appDefinition = {
    integrations: [
        HubSpotIntegration,
    ],
    user: {
        usePassword: true,
        primary: 'individual',
        organizationUserRequired: true,
        individualUserRequired: true,
    }
}

module.exports = {
    Definition: appDefinition,
}

```


### Key Features Demonstrated

This real-world example showcases:

**🔄 Webhook Integration**: Real-time event processing with WebSocket broadcasting
**📊 User Actions**: Interactive data operations with dynamic form generation  
**🎯 API Module Integration**: Direct use of `@friggframework/api-module-hubspot`
**🛠 Extension System**: Modular functionality through extensions
**📝 Dynamic Forms**: JSON Schema-based form generation for different object types
**🔗 Deep Linking**: Direct links to HubSpot records in formatted data
**⚡ Real-time Updates**: WebSocket connections for live data streaming


## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern="integration.test.js"
```

### Test Structure

The core package uses a comprehensive testing approach:

```javascript
// Example test structure
describe('CreateIntegration Use-Case', () => {
    let integrationRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new CreateIntegration({
            integrationRepository,
            integrationClasses: [TestIntegration],
            moduleFactory
        });
    });

    describe('happy path', () => {
        it('creates an integration and returns DTO', async () => {
            const result = await useCase.execute(['entity-1'], 'user-1', { type: 'test' });
            expect(result.id).toBeDefined();
            expect(result.status).toBe('NEW');
        });
    });

    describe('error cases', () => {
        it('throws error for unknown integration type', async () => {
            await expect(useCase.execute(['entity-1'], 'user-1', { type: 'unknown' }))
                .rejects.toThrow('No integration class found for type: unknown');
        });
    });
});
```

### Test Doubles

The framework provides test doubles for external dependencies:

```javascript
const { TestIntegrationRepository, TestModuleFactory } = require('@friggframework/core/test');

// Mock repository for testing
const testRepo = new TestIntegrationRepository();
testRepo.addMockIntegration({ id: 'test-123', userId: 'user-1' });

// Mock module factory
const testFactory = new TestModuleFactory();
testFactory.addMockModule('hubspot', mockHubSpotModule);
```

## Development

### Project Structure

```
packages/core/
├── integrations/           # Integration domain logic
│   ├── use-cases/         # Business use cases
│   ├── tests/             # Integration tests
│   └── integration-base.js # Base integration class
├── modules/               # API module system
│   ├── requester/         # HTTP clients
│   └── use-cases/         # Module management
├── database/              # Data persistence
├── encrypt/               # Encryption utilities
├── errors/                # Error definitions
├── logs/                  # Logging system
└── lambda/                # Serverless utilities
```

### Adding New Components

1. **Create the component**: Follow the established patterns
2. **Add tests**: Comprehensive test coverage required
3. **Export from index.js**: Make it available to consumers
4. **Update documentation**: Keep README current

### Code Style

```bash
# Format code
npm run lint:fix

# Check linting
npm run lint
```

## API Reference

### Core Exports

```javascript
const {
    // Integrations
    IntegrationBase,
    IntegrationModel,
    CreateIntegration,
    UpdateIntegration,
    DeleteIntegration,
    
    // Modules
    OAuth2Requester,
    ApiKeyRequester,
    Credential,
    Entity,
    // Database
    connectToDatabase,
    mongoose,
    UserModel,
    
    // Utilities
    Encrypt,
    Cryptor,
    BaseError,
    debug,
    TimeoutCatcher
} = require('@friggframework/core');
```

### Environment Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `FRIGG_ENCRYPTION_KEY` | Yes | 256-bit encryption key |
| `AWS_REGION` | No | AWS region for services |
| `DEBUG` | No | Debug logging pattern |
| `LOG_LEVEL` | No | Logging level (debug, info, warn, error) |

## License

This project is licensed under the MIT License - see the [LICENSE.md](../../LICENSE.md) file for details.

---

## Support

- 📖 [Documentation](https://docs.friggframework.org)
- 💬 [Community Slack](https://friggframework.slack.com)  
- 🐛 [Issue Tracker](https://github.com/friggframework/frigg/issues)
- 📧 [Email Support](mailto:support@friggframework.org)

Built with ❤️ by the Frigg Framework team.
