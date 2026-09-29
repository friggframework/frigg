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

## Rate Limits (`static rateLimit`)

An API module can tell the Requester how its provider limits calls, and how to
read a throttled response. Declare a static `rateLimit` on the API class. Every
key is optional. A module that declares nothing keeps the fixed backoff ladder
for a 429 (1, 3, 10, 30, 60 and 180 s), and reads `Retry-After` when the
response has one.

| Key | Meaning |
|---|---|
| `scope` | The key a limit counts against: `'entity'` (default), `'credential'`, `'app'`, or a function `(requester) => key`. The Requester puts it on `RateLimitError.scopeKey`. |
| `minRetryAfterMs` | A wait never shorter than this. Use it when the docs say "wait 60 seconds" and the response says nothing. |
| `maxInProcessWaitMs` | The most one request sleeps in process, in total. Default `300000` (5 minutes). `0` means never sleep: every hinted wait throws `RateLimitError`. |
| `parsers` | The header parsers to read, in order: `retryAfter`, `resetHeaders`, `ietf`. Default: all three. |
| `classify` | Recognises a limit that is not a plain 429, or names its reason. See below. |
| `windows`, `maxConcurrency` | The provider's limits, as documentation. A window named like the `reason` (`{ name: 'burst', perMs: 10000 }`) sets the wait when no header does. Pacing uses them later. |
| `userHints` | Links per `reason`, for example `{ daily: { links: [{ label, url }] } }`. They become the `LINK` actions of the warning the integration records for a long wait (see "The message for the user"). A `reason` with no hint gets no links. |

### What `classify` returns

`classify({ status, headers, body })` runs for a 429, and for any other 4xx or
5xx except 401. `body` is the parsed body of an `application/json`, `text/json`
or `+json` response (`application/problem+json`, for example), whatever the
case of the media type, or `undefined` for any other response. It returns
`null` when the response is not a limit, or a hint:

| Field | Meaning |
|---|---|
| `reason` | `'burst'`, `'daily'`, `'monthly'`, `'concurrency'` or `'unknown'` |
| `waitMs` or `retryAt` | When to call again. Leave both out to take the time from the parsers, then from the policy. With no time from either, the response follows the same ladder as a 429 with no hint, and the last error is a `FetchError` with `isRateLimited: true` and the `reason`. The queue worker does not halt it. |
| `policy` | The provider's own name for the limit, for logs and the UI |
| `remaining` | Calls left in the window, when the response says |
| `source` | `'header'`, `'body'` (default) or `'static'` |

A status other than 429 is a limit only when `classify` returns a hint for it.
A `classify` that throws is logged (`rate_limit_classify_failed`) and skipped.

```javascript
class Api extends OAuth2Requester {
    static rateLimit = {
        scope: 'entity',
        windows: [{ name: 'burst', limit: 100, perMs: 10_000 }],
        parsers: ['retryAfter', 'resetHeaders'],
        classify({ status, body }) {
            if (status !== 429) return null;
            if (body?.policyName === 'DAILY') return { reason: 'daily', waitMs: 3_600_000 };
            return { reason: 'burst', policy: body?.policyName };
        },
        userHints: {
            daily: { links: [{ label: 'API usage limits', url: 'https://example.com/limits' }] },
        },
    };
}
```

```javascript
class Api extends ApiKeyRequester {
    static rateLimit = { minRetryAfterMs: 60_000 };
}
```

### How the Requester waits

1. It looks for a hint in this order: `classify()`, the parsers, the policy
   (`minRetryAfterMs`, or the `perMs` of the window named by the reason).
2. With no hint, a 429 keeps the fixed ladder: the same calls, the same delays,
   then a plain `FetchError`. A 5xx keeps its ladder too.
3. With a hint, the wait is the largest of the hint, `minRetryAfterMs` and 1 s,
   plus at most 10 % jitter. The Requester sleeps when the wait fits the time
   this request may still sleep: `maxInProcessWaitMs` in total, and the time left
   in the Lambda invocation less one request timeout.
4. A wait that does not fit throws `RateLimitError`. It extends `FetchError`, so
   `statusCode` stays, and adds `isRateLimited`, `retryAt`, `waitMs`, `reason`,
   `policy`, `source`, `module` and `scopeKey`. The Requester tells its
   delegate (`RATE_LIMITED`) first, so the integration can warn its users.

`Retry-After` is read on a 429 only. The queue worker does not halt a
`RateLimitError`, even when its status is 403: the message goes back to SQS.

### The message for the user

When the Requester throws `RateLimitError`, the integration records one warning
for its users. It is one item in the stored `warnings`:

| Field | Value |
|---|---|
| `title`, `message` | Fixed text: "Rate limit reached", and one sentence with the module name and the reset time in UTC. Nothing from the request. |
| `code` | `'RATE_LIMITED'` |
| `module`, `reason` | The module name and the `reason` of the hint |
| `retryAt` | The reset time, ISO 8601 |
| `actions` | `{ type: 'RETRY_WHEN_READY' }`, then `{ type: 'LINK', label, url }` for each link in `userHints[reason]` |

A second report for the same module within 60 seconds of a stored reset time
is skipped. The warning changes no integration status. A failure to record it
is logged, and the request still throws `RateLimitError`.

### A client that is not the Requester

A module that drives another client (for example jsforce) calls
`classifyRateLimit` around its own calls and throws the error itself. The
Requester notifies its delegate only for the errors it throws, so the module
calls `_notifyRateLimited` before its own throw to give its users the same
warning. That call is best effort and never throws:

```javascript
const { classifyRateLimit, RateLimitError } = require('@friggframework/core');

async withLimits(call) {
    try {
        return await call();
    } catch (err) {
        const hint = classifyRateLimit(Api.rateLimit, {
            status: err.statusCode,
            headers: {},
            body: { errorCode: err.errorCode },
        });
        if (!hint) throw err;
        const error = new RateLimitError({ hint, module: this.name, cause: err });
        await this._notifyRateLimited(error);
        throw error;
    }
}
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
