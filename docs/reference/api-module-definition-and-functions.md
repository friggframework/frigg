# API Module Definition

An API module is the connection layer between Frigg and an external API. This page is the field reference for a module `Definition` object.

For contributing a module to the public library, see [Contribute an API Module](../api-module-library/building-your-own-module.md).

## Schema Reference

Canonical JSON Schema (frigg `next`):

[`packages/schemas/schemas/api-module-definition.schema.json`](https://github.com/friggframework/frigg/blob/next/packages/schemas/schemas/api-module-definition.schema.json)

Real v1-ready examples (api-module-library `next`):

- [Fathom](https://github.com/friggframework/api-module-library/blob/next/packages/v1-ready/fathom/definition.js) — form-based (API key is the common case)
- [HubSpot](https://github.com/friggframework/api-module-library/blob/next/packages/v1-ready/hubspot/definition.js) — redirect + code (webhooks live under `extensions/`, not on `Definition`)

## Required Properties

The schema requires these three top-level keys:

| Property | Type | Description |
|----------|------|-------------|
| `moduleName` | string | Module identifier (`^[a-zA-Z][a-zA-Z0-9_-]*$`, 1–100 chars) |
| `getName` | function | Returns the module name |
| `requiredAuthMethods` | object | Auth method implementations (see below) |

Runtime structural checks (used when an app lists the module under an integration) also expect an `API` class and, inside `requiredAuthMethods`, `getEntityDetails`, `getCredentialDetails`, `testAuthRequest`, and `apiPropertiesToPersist`. Redirect + code flows (OAuth-style requesters) also need `getToken`.

## Optional Properties Allowed by the Schema

| Property | Type | Description |
|----------|------|-------------|
| `API` | class / object | Requester class for the module |
| `env` | object | Environment mapping (snake_case keys; see below) |
| `config` | object | Module metadata (`name`, `version`, `authType`, `baseURL`, `rateLimit`, `timeout`, `retries`, …) |
| `manager` | object | Legacy manager configuration |
| `webhooks` | object | Schema-level webhook config (`enabled`, `endpoints`) |
| `encryption` | object | Extra credential fields to encrypt beyond the core schema |

`config.authType` enum: `oauth2` | `api-key` | `basic` | `bearer` | `custom`.

> **HubSpot webhooks today** ship as a Tier 3 integration extension (`hubspot.extensions.webhooks`), not as `Definition.webhooks`. Prefer that pattern when copying HubSpot; see the [HubSpot module README](https://github.com/friggframework/api-module-library/blob/next/packages/v1-ready/hubspot/README.md).

## Common Library Fields Not Yet in the Schema

v1-ready modules on api-module-library `next` routinely set fields the schema does not yet list. Schema allowance for them is tracked in open PR [#701](https://github.com/friggframework/frigg/pull/701) (**In review** — do not treat as merged):

| Field | Where | Role |
|-------|-------|------|
| `modelName` | top-level | Entity/credential model label used by the Module runtime (e.g. `'Fathom'`). Optional in practice; distinct from `moduleName`. |
| `getAuthorizationRequirements` | `requiredAuthMethods` | Form-based auth: returns the credential form (`type`, `jsonSchema` / `uiSchema`) |
| `setAuthParams` | `requiredAuthMethods` | Form-based auth: applies submitted params onto the API instance |

Until #701 lands, `frigg validate` does **not** schema-validate those keys on a standalone module package. They remain the correct patterns for form-based modules (see Fathom).

There is no `Definition.mappings` property. Keep mapping helpers as files if you need them; `extensions.mapping` is out of scope for a minimal first contribution.

## Complete Definition Shape

```javascript
const { Api } = require('./api');

const Definition = {
    API: Api,
    moduleName: 'my-module',
    getName: () => 'my-module',
    // Optional (common in the library; schema allowance in review — #701):
    // modelName: 'MyModule',

    requiredAuthMethods: {
        // Redirect + code: include getToken (+ redirect_uri ternary in env).
        // Form-based: include getAuthorizationRequirements + setAuthParams
        // (schema allowance for those two is in review — #701).
        // Hybrid (form then redirect): include both sets.
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => { /* ... */ },
        getCredentialDetails: async (api, userId) => { /* ... */ },
        testAuthRequest: async (api) => { /* ... */ },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
        },
    },

    env: {
        client_id: process.env.MY_CLIENT_ID,
        client_secret: process.env.MY_CLIENT_SECRET,
        scope: process.env.MY_SCOPE,
        redirect_uri: process.env.REDIRECT_URI
            ? `${process.env.REDIRECT_URI}/my-module`
            : undefined,
    },

    encryption: {
        // Only for credential fields outside the core encryption schema
        credentialFields: ['webhook_secret'],
    },
};

module.exports = { Definition };
```

## Required Auth Methods

### getToken (redirect + code)

For redirect flows: exchange an authorization code (or similar) for tokens after the user returns:

```javascript
getToken: async (api, params) => {
    const code = params.data?.code ?? params.code;
    return api.getTokenFromCode(code);
}
```

Omit this for form-only modules. Hybrid modules (form then redirect) include `getToken` as well as the form methods below.

### getEntityDetails

Returns identifiers for uniqueness and details for display:

```javascript
getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
    const userDetails = await api.getUserDetails();
    return {
        identifiers: {
            externalId: userDetails.id,
            user: userId,
        },
        details: {
            name: userDetails.name,
        },
    };
}
```

### getCredentialDetails

Same shape as entity details, used for credential lookup:

```javascript
getCredentialDetails: async (api, userId) => {
    const userDetails = await api.getUserDetails();
    return {
        identifiers: { externalId: userDetails.id, user: userId },
        details: {},
    };
}
```

### testAuthRequest

Any authenticated call that proves credentials work:

```javascript
testAuthRequest: async (api) => api.getUserDetails()
```

### apiPropertiesToPersist

Which API properties to save after auth and rehydrate onto the API class:

```javascript
apiPropertiesToPersist: {
    credential: ['access_token', 'refresh_token'], // or ['api_key']
    entity: [],
}
```

Those properties are:

1. Saved after authentication
2. Passed back into the API class on instantiation
3. Available as `api.propertyName`

### getAuthorizationRequirements + setAuthParams (form-based)

Used by form-based modules (Fathom’s API-key form is the common example, not the only shape). Schema allowance is **In review** (#701); the library pattern is:

```javascript
getAuthorizationRequirements: () => ({
    type: 'apiKey',
    data: {
        jsonSchema: {
            title: 'Service Authentication',
            type: 'object',
            required: ['api_key'],
            properties: {
                api_key: { type: 'string', title: 'API Key' },
            },
        },
        uiSchema: {
            api_key: {
                'ui:widget': 'password',
                'ui:help': 'Generate an API key in the service settings.',
            },
        },
    },
}),

setAuthParams: async (api, params) => {
    api.setApiKey(params.api_key);
},
```

## Environment Configuration (`env`)

Use **snake_case** keys. Schema-allowed properties:

| Key | Purpose |
|-----|---------|
| `client_id`, `client_secret` | OAuth client credentials |
| `scope` | OAuth scopes |
| `redirect_uri` | OAuth callback URL |
| `api_key` | API key |
| `base_url` | Base API URL |
| `UPPER_SNAKE_CASE` | Custom env vars (pattern property) |

For redirect flows, prefer a ternary on `redirect_uri` so a missing `REDIRECT_URI` does not bake a broken string:

```javascript
redirect_uri: process.env.REDIRECT_URI
    ? `${process.env.REDIRECT_URI}/my-module`
    : undefined,
```

Some library modules (including HubSpot on `next`) still use an always-on template string. Teach and land the ternary on new modules.

## Encryption Configuration

Declare credential fields that need encryption **beyond** the core schema:

```javascript
encryption: {
    credentialFields: ['webhook_secret', 'signing_key'],
}
```

**Core Credential fields (auto-encrypted, no module config):**

- `access_token`, `refresh_token`, `id_token`
- `api_key`, `apiKey`, `API_KEY_VALUE`
- `password`, `client_secret`

Prefer snake_case names in `apiPropertiesToPersist.credential` so they match the core list. See [Encryption and Security](encryption-and-security.md) and the [encryption README](https://github.com/friggframework/frigg/blob/next/packages/core/database/encryption/README.md).

## Redirect + Code Example (HubSpot-shaped)

```javascript
const { Api } = require('./api');
const config = require('./defaultConfig.json');

const Definition = {
    API: Api,
    getName: () => config.name,
    moduleName: config.name,
    requiredAuthMethods: {
        getToken: async (api, params) => {
            const code = params.code ?? params.data?.code;
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: {
                    externalId: String(userDetails.portalId),
                    user: userId,
                },
                details: { name: userDetails.hub_domain },
            };
        },
        getCredentialDetails: async (api, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: {
                    externalId: String(userDetails.portalId),
                    userId,
                },
                details: {},
            };
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
        },
        testAuthRequest: async (api) => api.getUserDetails(),
    },
    env: {
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        scope: process.env.HUBSPOT_SCOPE,
        redirect_uri: process.env.REDIRECT_URI
            ? `${process.env.REDIRECT_URI}/hubspot`
            : undefined,
    },
};

module.exports = { Definition };
```

## Form-Based Example (Fathom-shaped)

```javascript
const { Api } = require('./api');
const config = require('./defaultConfig.json');

const Definition = {
    API: Api,
    getName: () => config.name,
    moduleName: config.name,
    requiredAuthMethods: {
        getAuthorizationRequirements: () => ({
            type: 'apiKey',
            data: {
                jsonSchema: {
                    title: 'Fathom Authentication',
                    type: 'object',
                    required: ['api_key'],
                    properties: {
                        api_key: { type: 'string', title: 'API Key' },
                    },
                },
                uiSchema: {
                    api_key: { 'ui:widget': 'password' },
                },
            },
        }),
        setAuthParams: async (api, params) => {
            api.setApiKey(params.api_key);
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            // Resolve a stable externalId for the account…
            return {
                identifiers: { externalId: '…', userId },
                details: { name: 'Fathom' },
            };
        },
        getCredentialDetails: async (api, userId) => ({
            identifiers: { externalId: '…', userId },
            details: {},
        }),
        apiPropertiesToPersist: {
            credential: ['api_key'],
            entity: [],
        },
        testAuthRequest: async (api) => api.listMeetings({}),
    },
    env: {
        api_key: process.env.FATHOM_API_KEY,
    },
};

module.exports = { Definition };
```

## Validation (`frigg validate`)

On frigg `next` today (`#666`), `frigg validate` validates an **app** definition (`index.js`), not a standalone API module package.

It checks:

1. App-definition JSON Schema (keys, types, enums)
2. Semantic checks the schema cannot express, including each listed integration’s `Definition` and nested API module definitions via structural checks (`moduleName`, `API`, required auth methods, `apiPropertiesToPersist`)

```bash
frigg validate
frigg validate --stage prod
frigg validate --json
```

`frigg build` / `frigg deploy` run the same validation and stop on errors (`--skip-validate` bypasses with a warning). `frigg start` warns only.

Standalone module-package schema validation (for example `frigg validate --module`) is **In review** (#701). Until that lands, validate a new module with `npm test` in the package and optionally `frigg auth test .` — see [Contribute an API Module](../api-module-library/building-your-own-module.md).

## Best Practices

1. Keep `moduleName` lowercase with hyphens when that matches the package slug
2. Persist only what you need to re-authenticate
3. Prefer core-encrypted credential field names (`api_key`, `access_token`, …); declare extras in `encryption.credentialFields`
4. Use a cheap authenticated call for `testAuthRequest`
5. Do not add `Definition.mappings`

## Related Documentation

- [Contribute an API Module](../api-module-library/building-your-own-module.md)
- [API Module Library overview](../api-module-library/overview.md)
- [Integration Patterns](../guides/INTEGRATION-PATTERNS.md)
- [Encryption and Security](encryption-and-security.md)
- [JSON Schema on GitHub](https://github.com/friggframework/frigg/blob/next/packages/schemas/schemas/api-module-definition.schema.json)
