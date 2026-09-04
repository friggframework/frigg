# API Module Definition

This document describes the API module definition structure used by the Frigg Framework. API modules provide the connection layer between Frigg and external APIs.

## Schema Reference

The canonical JSON Schema is at `packages/schemas/schemas/api-module-definition.schema.json`.

## Required Properties

Every API module definition must include these three properties:

| Property | Type | Description |
|----------|------|-------------|
| `moduleName` | string | Unique identifier for the module (pattern: `^[a-zA-Z][a-zA-Z0-9_-]*$`) |
| `getName` | function | Returns the module name |
| `requiredAuthMethods` | object | Authentication method implementations |

## Complete Definition Structure

```javascript
const { MyApi } = require('./api');

const Definition = {
    // Required: API class
    API: MyApi,

    // Required: Module identifier
    moduleName: 'my-module',

    // Required: Function returning module name
    getName: () => 'my-module',

    // Required: Authentication methods
    requiredAuthMethods: {
        getToken: async (api, params) => { /* ... */ },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => { /* ... */ },
        getCredentialDetails: async (api, userId) => { /* ... */ },
        testAuthRequest: async (api) => { /* ... */ },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: ['tenantId']
        }
    },

    // Optional: Environment configuration
    env: {
        client_id: process.env.MY_CLIENT_ID,
        client_secret: process.env.MY_CLIENT_SECRET,
        scope: 'read write',
        redirect_uri: process.env.MY_REDIRECT_URI,
        base_url: process.env.MY_BASE_URL  // Note: snake_case
    },

    // Optional: Module-level encryption for custom credential fields
    encryption: {
        credentialFields: ['api_key', 'webhook_secret']
    }
};

module.exports = { Definition, MyApi };
```

## Required Auth Methods

### getToken

Retrieves and sets authentication tokens. For OAuth2, this typically exchanges an authorization code for tokens:

```javascript
getToken: async (api, params) => {
    const code = params.data?.code;
    return api.getTokenFromCode(code);
}
```

For session-based auth:

```javascript
getToken: async (api, params) => {
    const { email, password } = params.data || {};
    const response = await api.login(email, password);
    return {
        authentication_token: response.token,
        user_id: response.userId
    };
}
```

### getEntityDetails

Retrieves details about the authorized user/organization. Returns identifiers for uniqueness and details for display:

```javascript
getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
    const userDetails = await api.getUserDetails();

    return {
        identifiers: {
            externalId: userDetails.id,      // Unique ID in external system
            user: userId                      // Frigg user ID
        },
        details: {
            name: userDetails.name,
            email: userDetails.email,
            tenantId: userDetails.tenantId
        }
    };
}
```

### getCredentialDetails

Similar to `getEntityDetails`, but for credential lookup:

```javascript
getCredentialDetails: async (api, userId) => {
    const userDetails = await api.getUserDetails();
    return {
        identifiers: {
            externalId: userDetails.id,
            user: userId
        },
        details: {}
    };
}
```

### testAuthRequest

A simple request to verify authentication is working:

```javascript
testAuthRequest: async (api) => {
    return api.getCurrentUser();  // Any authenticated API call
}
```

### apiPropertiesToPersist

Defines which API properties to save to the database:

```javascript
apiPropertiesToPersist: {
    // Credential: OAuth tokens, API keys, session tokens
    credential: ['access_token', 'refresh_token', 'accessTokenExpire'],

    // Entity: Connection-specific identifiers
    entity: ['tenantId', 'organizationId']
}
```

These properties are:
1. Saved to the database after authentication
2. Passed back to the API class on instantiation
3. Available via `api.propertyName`

## Environment Configuration

The `env` object maps environment variables to API configuration. Use **snake_case** for property names:

```javascript
env: {
    // Standard OAuth properties
    client_id: process.env.XERO_CLIENT_ID,
    client_secret: process.env.XERO_CLIENT_SECRET,
    scope: 'openid profile email offline_access',
    redirect_uri: process.env.XERO_REDIRECT_URI,

    // API configuration
    base_url: process.env.XERO_BASE_URL,
    api_key: process.env.XERO_API_KEY
}
```

**Allowed properties:**
- `client_id`, `client_secret` - OAuth credentials
- `scope` - OAuth scopes
- `redirect_uri` - OAuth callback URL
- `api_key` - API key authentication
- `base_url` - Base URL for API requests
- Custom: `UPPER_SNAKE_CASE` pattern (e.g., `CUSTOM_HEADER`)

## Encryption Configuration

Declare which credential fields need encryption beyond the core schema:

```javascript
encryption: {
    credentialFields: ['api_key', 'webhook_secret', 'signing_key']
}
```

**How it works:**
1. Module declares `encryption.credentialFields` array
2. Framework adds `data.` prefix for database storage
3. Fields merge with core encryption schema on startup
4. All credential data transparently encrypted/decrypted

**Core schema (auto-encrypted, no config needed):**
- `access_token`, `refresh_token`, `id_token`
- `username`, `password`
- `domain`

**Common patterns:**

```javascript
// OAuth (no encryption config needed - uses core schema)
apiPropertiesToPersist: {
    credential: ['access_token', 'refresh_token']
}

// API Key
encryption: { credentialFields: ['api_key'] },
apiPropertiesToPersist: { credential: ['api_key'] }

// Custom tokens
encryption: { credentialFields: ['signing_key', 'webhook_secret'] },
apiPropertiesToPersist: { credential: ['signing_key', 'webhook_secret'] }
```

## Complete OAuth2 Example

```javascript
const { XeroApi } = require('./api');

const Definition = {
    API: XeroApi,
    moduleName: 'xero',
    getName: () => 'xero',

    requiredAuthMethods: {
        getToken: async (api, params) => {
            const code = params.data?.code;
            return api.getTokenFromCode(code);
        },

        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const tenants = await api.getTenants();
            const selectedTenant = callbackParams?.tenantId
                ? tenants.find(t => t.tenantId === callbackParams.tenantId)
                : tenants[0];

            if (selectedTenant) {
                api.setTenant(selectedTenant.tenantId);
            }

            const org = await api.getOrganisation();

            return {
                identifiers: {
                    externalId: org.id,
                    user: userId
                },
                details: {
                    name: org.name,
                    tenantId: selectedTenant?.tenantId,
                    tenantType: selectedTenant?.tenantType
                }
            };
        },

        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token', 'accessTokenExpire'],
            entity: ['tenantId']
        },

        getCredentialDetails: async (api, userId) => {
            const org = await api.getOrganisation();
            return {
                identifiers: { externalId: org.id, user: userId },
                details: {}
            };
        },

        testAuthRequest: async (api) => {
            return api.getOrganisation();
        }
    },

    env: {
        client_id: process.env.XERO_CLIENT_ID,
        client_secret: process.env.XERO_CLIENT_SECRET,
        redirect_uri: process.env.XERO_REDIRECT_URI,
        scope: 'openid profile email accounting.transactions offline_access'
    }
};

module.exports = { Definition, XeroApi };
```

## Session-Based Auth Example

```javascript
const { ProcurementExpressApi } = require('./api');

const Definition = {
    API: ProcurementExpressApi,
    moduleName: 'procurement-express',
    getName: () => 'procurement-express',

    requiredAuthMethods: {
        getToken: async (api, params) => {
            const { email, password } = params.data || {};

            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            const response = await api.login(email, password);

            return {
                authentication_token: response.authentication_token,
                employer_id: response.employer_id,
                user_id: response.id
            };
        },

        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const user = await api.getCurrentUser();
            const company = user.companies?.[0];

            return {
                identifiers: {
                    externalId: String(user.id),
                    user: userId
                },
                details: {
                    name: user.name,
                    email: user.email,
                    companyId: company?.id,
                    companyName: company?.name
                }
            };
        },

        apiPropertiesToPersist: {
            credential: ['authenticationToken', 'companyId'],
            entity: ['companyId']
        },

        getCredentialDetails: async (api, userId) => {
            const user = await api.getCurrentUser();
            return {
                identifiers: { externalId: String(user.id), user: userId },
                details: {}
            };
        },

        testAuthRequest: async (api) => {
            return api.getCurrentUser();
        }
    },

    env: {
        base_url: process.env.PROCUREMENT_EXPRESS_BASE_URL || 'https://app.example.com/api/v1'
    }
};

module.exports = { Definition, ProcurementExpressApi };
```

## Validation

Use `frigg validate` to check your module definition against the schema:

```bash
frigg validate
```

The validator checks:
- Required properties are present
- Property types match schema
- `env` properties use correct naming (snake_case)
- No additional properties on strict objects

## Best Practices

1. **Use snake_case for `env` properties** - The schema enforces this pattern
2. **Keep `moduleName` simple** - Use lowercase with hyphens (e.g., `my-module`)
3. **Persist minimal data** - Only store what's needed for re-authentication
4. **Use core encryption** - OAuth tokens are auto-encrypted; declare custom fields explicitly
5. **Test auth requests** - Use a simple, fast endpoint for `testAuthRequest`

## Related Documentation

- [JSON Schema](/packages/schemas/schemas/api-module-definition.schema.json) - Canonical schema definition
- [Integration Patterns Guide](/docs/guides/INTEGRATION-PATTERNS.md) - Sync, queue, and webhook patterns
- [Encryption README](/packages/core/database/encryption/README.md) - Field-level encryption details
