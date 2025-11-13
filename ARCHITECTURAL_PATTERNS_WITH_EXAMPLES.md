# FRIGG FRAMEWORK - ARCHITECTURAL PATTERNS WITH CODE EXAMPLES

## 1. DELEGATE PATTERN (Observer-like)

**Purpose**: Enable loose coupling and event notification between components.

### Base Implementation
```javascript
// File: packages/core/core/Delegate.js
class Delegate {
    constructor(params) {
        this.delegate = get(params, 'delegate', null);
        this.delegateTypes = [];
    }

    async notify(delegateString, object = null) {
        if (!this.delegateTypes.includes(delegateString)) {
            throw new Error(`delegateString:${delegateString} is not defined`);
        }
        if (this.delegate) {
            return this.delegate.receiveNotification(this, delegateString, object);
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        // Override in child classes
    }
}
```

### Usage Example: OAuth2 Token Update
```javascript
// File: packages/core/module-plugin/requester/oauth-2.js
class OAuth2Requester extends Requester {
    constructor(params) {
        super(params);
        this.delegateTypes.push('TOKEN_UPDATE');
        this.delegateTypes.push('TOKEN_DEAUTHORIZED');
    }

    async setTokens(params) {
        this.access_token = get(params, 'access_token');
        this.refresh_token = get(params, 'refresh_token', null);
        this.accessTokenExpire = new Date(Date.now() + accessExpiresIn * 1000);
        
        // Notify observers of token update
        await this.notify('TOKEN_UPDATE');
    }
}
```

### Benefits
- Components don't need direct references to each other
- Easy to add new listeners without modifying existing code
- Clear event flow

---

## 2. FACTORY PATTERN

**Purpose**: Centralize object creation logic with proper dependency injection.

### Integration Factory Example
```javascript
// File: packages/core/integrations/integration-factory.js
class IntegrationFactory {
    constructor(integrationClasses = []) {
        this.integrationClasses = integrationClasses;
        this.moduleFactory = new ModuleFactory(...this.getModules());
        this.integrationTypes = this.integrationClasses.map(
            IntegrationClass => IntegrationClass.getName()
        );
    }

    // Create instance from stored integration ID
    async getInstanceFromIntegrationId(params) {
        const { integrationId, userId } = params;
        
        // Fetch integration from database
        const integrationRecord = await IntegrationHelper.getIntegrationById(
            integrationId
        );

        // Get the appropriate integration class
        const integrationClassDef = this.getIntegrationClassDefByType(
            integrationRecord.config.type
        );

        // Create instance with dependencies
        const instance = new integrationClassDef({ userId, integrationId });
        instance.record = integrationRecord;
        
        // Inject module instances
        instance.primary = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[0],
            instance.record.user
        );
        instance.target = await this.moduleFactory.getModuleInstanceFromEntityId(
            instance.record.entities[1],
            instance.record.user
        );

        return instance;
    }

    // Create new integration
    async createIntegration(entities, userId, config) {
        const integrationRecord = await IntegrationModel.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });
        return await this.getInstanceFromIntegrationId({
            integrationId: integrationRecord.id,
            userId
        });
    }
}
```

### Benefits
- Encapsulates creation complexity
- Easy to swap implementations
- Dependency injection handled in one place

---

## 3. PLUGIN ARCHITECTURE

**Purpose**: Enable dynamic module discovery without hardcoding dependencies.

### Module Discovery
```javascript
// File: packages/core/core/load-installed-modules.js
const loadInstalledModules = () => {
    // Read package.json from current working directory
    const pathToPackage = join(process.cwd(), 'package.json');
    const contents = readFileSync(pathToPackage);
    const pkg = JSON.parse(contents);
    
    // Find all dependencies matching 'frigg-module-*' pattern
    const dependencyNames = pkg.dependencies 
        ? Object.keys(pkg.dependencies) 
        : [];
    
    const installedNames = dependencyNames.filter((name) => {
        const withoutOrganization = name.split('/').pop();
        return withoutOrganization.startsWith('frigg-module-');
    });

    // Load module manifests (package.json files)
    const manifests = installedNames.map((name) => {
        const pathToManifest = join(process.cwd(), 'node_modules', name);
        const manifestContents = readFileSync(pathToManifest);
        return JSON.parse(manifestContents);
    });

    return manifests;
};
```

### Usage
```javascript
// File: packages/core/module-plugin/entity-manager.js
class EntityManager {
    static entityManagerClasses = loadInstalledModules().map(
        (m) => m.EntityManager
    );

    static async getEntitiesForUser(userId) {
        const results = [];
        for (const Manager of this.entityManagerClasses) {
            results.push(...(await Manager.getEntitiesForUserId(userId)));
        }
        return results;
    }
}
```

### Benefits
- No hardcoded module imports
- New modules automatically discovered
- Supports third-party module development

---

## 4. REPOSITORY PATTERN

**Purpose**: Encapsulate data access logic with standard CRUD operations.

### IntegrationMapping Example
```javascript
// File: packages/core/integrations/integration-mapping.js
const schema = new mongoose.Schema({
    integration: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Integration',
        required: true,
    },
    sourceId: { type: String },
    mapping: {}
}, { timestamps: true });

schema.static({
    // Find mapping by integration ID and source ID
    findBy: async function (integrationId, sourceId) {
        const mappings = await this.find({ 
            integration: integrationId, 
            sourceId 
        });
        
        if (mappings.length === 0) {
            return null;
        } else if (mappings.length === 1) {
            return mappings[0].mapping;
        } else {
            throw new Error('Multiple mappings with same sourceId');
        }
    },

    // Create or update mapping
    upsert: async function (integrationId, sourceId, mapping) {
        return this.findOneAndUpdate(
            { integration: integrationId, sourceId },
            { mapping },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }
});

schema.index({ integration: 1, sourceId: 1 });

const IntegrationMapping = mongoose.models.IntegrationMapping || 
    mongoose.model('IntegrationMapping', schema);
```

### Usage
```javascript
// In integration sync code
const mapping = await IntegrationMapping.findBy(integrationId, externalId);
if (!mapping) {
    await IntegrationMapping.upsert(integrationId, externalId, newMapping);
}
```

### Benefits
- Standardized data access
- Easy to test (mock the repository)
- Encapsulates query complexity

---

## 5. STRATEGY PATTERN - AUTHENTICATION

**Purpose**: Support multiple authentication mechanisms with pluggable strategies.

### Base Requester
```javascript
// File: packages/core/module-plugin/requester/requester.js
class Requester extends Delegate {
    async _request(url, options, i = 0) {
        // Build query string
        if (options.query) {
            // Encode query parameters
        }

        // Add auth headers using strategy
        options.headers = await this.addAuthHeaders(options.headers);

        // Make request with retry logic
        let response;
        try {
            response = await this.fetch(url, options);
        } catch (e) {
            if (e.code === 'ECONNRESET' && i < this.backOff.length) {
                // Exponential backoff retry
                const delay = this.backOff[i] * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this._request(url, options, i + 1);
            }
        }

        // Handle 401 with token refresh
        if (response.status === 401) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify('INVALID_AUTH');
            } else {
                this.refreshCount++;
                await this.refreshAuth();
                return this._request(url, options, i + 1);
            }
        }

        return response;
    }

    // Override in subclasses
    async addAuthHeaders(headers) {
        throw new Error('addAuthHeaders not implemented');
    }

    async refreshAuth() {
        throw new Error('refreshAuth not implemented');
    }
}
```

### OAuth2 Strategy
```javascript
// File: packages/core/module-plugin/requester/oauth-2.js
class OAuth2Requester extends Requester {
    async addAuthHeaders(headers) {
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }
        return headers;
    }

    async refreshAuth() {
        try {
            if (this.grant_type !== 'client_credentials') {
                await this.refreshAccessToken({
                    refresh_token: this.refresh_token
                });
            } else {
                await this.getTokenFromClientCredentials();
            }
        } catch {
            await this.notify('INVALID_AUTH');
        }
    }
}
```

### API Key Strategy
```javascript
// File: packages/core/module-plugin/requester/api-key.js
class ApiKeyRequester extends Requester {
    async addAuthHeaders(headers) {
        if (this.API_KEY_VALUE) {
            headers[this.API_KEY_NAME] = this.API_KEY_VALUE;
        }
        return headers;
    }

    isAuthenticated() {
        return this.API_KEY_VALUE !== null && 
               this.API_KEY_VALUE !== undefined;
    }
}
```

### Benefits
- Each auth type isolated in its own class
- Easy to add new auth methods
- Consistent interface for all auth types

---

## 6. ENCRYPTION AS A PLUGIN

**Purpose**: Transparent field-level encryption using Mongoose plugins.

### Encryption Plugin
```javascript
// File: packages/core/encrypt/encrypt.js
function Encrypt(schema, options) {
    const { STAGE, KMS_KEY_ARN, AES_KEY_ID } = process.env;

    // Skip in dev/test environments
    if (shouldBypassEncryption(STAGE)) {
        return;
    }

    // Find all fields marked for encryption
    const fields = Object.values(schema.paths)
        .map(({ path, options }) => 
            options.lhEncrypt === true ? path : ''
        )
        .filter(Boolean);

    const cryptor = new Cryptor({
        shouldUseAws: !!KMS_KEY_ARN,
        fields: fields,
    });

    // Pre-save hook: encrypt fields before save
    schema.pre('save', async function encryptionPreSave() {
        await cryptor.encryptFieldsInDocuments([this]);
    });

    // Pre-update hooks: encrypt before update operations
    schema.pre('updateOne', async function encryptionPreUpdateOne() {
        const update = this.getUpdate();
        await cryptor.encryptFieldsInDocuments([update]);
    });

    // Post-retrieval hooks: decrypt after fetch
    schema.post('findOne', async function decryptionPostFindOne(doc) {
        if (doc) {
            await cryptor.decryptFieldsInDocuments([doc]);
        }
    });
}
```

### Usage in Schema
```javascript
// File: packages/core/module-plugin/credential.js
const schema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    subType: { type: String },
    auth_is_valid: { type: Boolean },
    externalId: { type: String }, // Will be encrypted
});

schema.plugin(Encrypt); // Apply encryption plugin

const Credential = mongoose.models.Credential || 
    mongoose.model('Credential', schema);
```

### Benefits
- Encryption transparent to business logic
- Works with all query operations (save, update, find, etc.)
- Easy to enable/disable per environment

---

## 7. ERROR HANDLING WITH CUSTOM HIERARCHY

**Purpose**: Structured error handling with recovery strategies.

### Custom Error Base
```javascript
// File: packages/core/errors/base-error.js
class BaseError extends Error {
    constructor(message, options, ...moreOptions) {
        super(message, options, ...moreOptions);

        if (options?.cause) {
            this.cause = options.cause;
        }

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BaseError);
        }

        this.name = this.constructor?.name;
    }
}
```

### HTTP Error with Context
```javascript
// File: packages/core/errors/fetch-error.js
class FetchError extends BaseError {
    response = null;

    constructor(options = {}) {
        const { resource, init, response, responseBody } = options;

        const messageParts = [
            `An error occurred while fetching: ${method} ${resource}`,
            `Request: ${JSON.stringify(init, null, 2)}`,
            `Response: ${response?.status} ${response?.statusText}`,
            responseBodyText
        ];

        super(messageParts.filter(Boolean).join('\n'));
        this.response = response;
    }

    static async create(options = {}) {
        const { response } = options;
        let responseBody = response?.bodyUsed 
            ? null 
            : await response?.text();
        return new FetchError({ ...options, responseBody });
    }
}
```

### Non-Retry Error
```javascript
// File: packages/core/errors/halt-error.js
class HaltError extends BaseError {
    constructor(message, options) {
        super(message, options);
        this.isHaltError = true;
    }
}
```

### Usage in Lambda Handler
```javascript
// File: packages/core/core/create-handler.js
const createHandler = (options) => {
    return async (event, context) => {
        try {
            // Handler logic
        } catch (error) {
            flushDebugLog(error);

            // Don't retry on halt errors
            if (error.isHaltError === true) {
                return; // AWS Lambda won't retry
            }

            // Let AWS retry on other errors
            throw error;
        }
    };
};
```

### Benefits
- Structured error information for debugging
- Clear error classification
- Automatic retry control

---

## 8. TIMEOUT MANAGEMENT FOR SERVERLESS

**Purpose**: Ensure cleanup tasks complete before Lambda timeout.

```javascript
// File: packages/core/lambda/TimeoutCatcher.js
class TimeoutCatcher {
    constructor({ work, timeout, cleanUp = () => {}, cleanUpTime = 2_000 }) {
        this.isFinished = false;
        this.work = work;
        this.cleanUp = cleanUp;
        this.waitTime = timeout - cleanUpTime; // Leave time for cleanup
    }

    async watch() {
        try {
            // Race: work vs timeout
            await Promise.race([
                this.doWork(),
                this.exitBeforeTimeout()
            ]);
            return true;
        } catch (error) {
            if (error.isSentinelTimeout) {
                return false; // Timed out, but cleanup completed
            }
            throw error;
        }
    }

    async doWork() {
        await this.work();
        this.isFinished = true;
    }

    async exitBeforeTimeout() {
        await sleep(this.waitTime);

        if (!this.isFinished) {
            // Execute cleanup before timeout
            await this.cleanUp();

            // Signal timeout with custom error
            const error = new Error("Timeout");
            error.isSentinelTimeout = true;
            throw error;
        }
    }
}

// Usage
const catcher = new TimeoutCatcher({
    work: async () => {
        // Main work
        await longRunningTask();
    },
    timeout: context.getRemainingTimeInMillis(),
    cleanUp: async () => {
        // Ensure cleanup completes
        await flushLogs();
        await closeConnections();
    },
    cleanUpTime: 2000
});

const success = await catcher.watch();
```

### Benefits
- Graceful shutdown in Lambda
- Ensures logs/data flushed before timeout
- Configurable cleanup grace period

---

## 9. ASSERTION/VALIDATION PATTERN

**Purpose**: Defensive programming with consistent validation.

```javascript
// File: packages/core/assertions/get.js
const get = (o, key, defaultValue) => {
    const value = lodashGet(o, key, defaultValue);

    if (value !== undefined) {
        return value;
    }

    if (defaultValue === undefined) {
        throw new RequiredPropertyError({
            parent: this,
            key,
        });
    }

    return defaultValue;
};

const getAndVerifyType = (params, key, classType, defaultValue) => {
    const val = get(params, key, defaultValue);

    if (Array.isArray(val)) {
        for (const index in val) {
            if (!(val[index] instanceof classType)) {
                throw new ParameterTypeError({
                    key: `${key}[${index}]`,
                    expectedType: classType.name
                });
            }
        }
    } else if (!(val instanceof classType)) {
        throw new ParameterTypeError({
            key: key,
            expectedType: classType.name
        });
    }

    return val;
};
```

### Usage
```javascript
// Safe parameter extraction
const userId = get(params, 'userId');              // Throws if missing
const config = get(params, 'config', {});          // Defaults to {}
const manager = getAndVerifyType(params, 'manager', ModuleManager);
```

### Benefits
- Consistent validation across codebase
- Clear error messages
- Fail-fast on invalid input

---

## Summary Table

| Pattern | File(s) | Use Case |
|---------|---------|----------|
| **Delegate** | Delegate.js | Event notification between components |
| **Factory** | IntegrationFactory.js | Complex object creation |
| **Plugin** | load-installed-modules.js | Dynamic module discovery |
| **Repository** | entity.js, mapping.js | Data access abstraction |
| **Strategy** | oauth-2.js, api-key.js | Multiple implementations |
| **Plugin (Encryption)** | encrypt.js | Cross-cutting concern |
| **Error Hierarchy** | errors/*.js | Structured exception handling |
| **Timeout Management** | TimeoutCatcher.js | Serverless cleanup |
| **Assertion** | assertions/get.js | Input validation |

