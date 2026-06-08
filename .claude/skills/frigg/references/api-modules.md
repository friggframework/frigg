# API Modules Reference

API Modules are reusable connector packages defining how to connect to a third-party system and what APIs are available. Accessed in integrations via `this.{moduleName}.api.{method}()`.

## Table of Contents

- [Module Structure](#module-structure)
- [Authentication Requester Base Classes](#authentication-requester-base-classes)
- [Required Module Structure for Definitions](#required-module-structure-for-definitions)
- [JSON Schema Form for API-Key Modules](#json-schema-form-for-api-key-modules)

## Module Structure

```javascript
module.exports = {
    moduleName: 'service-name',        // Unique identifier
    API: ServiceAPIClass,              // Main API class
    requiredAuthMethods: {             // Authentication methods
        getToken: function,
        getEntityDetails: function,
        getCredentialDetails: function,
        apiPropertiesToPersist: object,
        testAuthRequest: function
    },
    env: {},                          // Environment variables
    modelName: 'ServiceModel'         // Optional model name
};
```

Why API modules matter: eliminate redundant per-API work, standardize auth/error-handling/data-formats, centralize updates and version management, and provide built-in token refresh, rate limiting, and logging.

> Anti-pattern: do NOT override api-modules or wrap them unless explicitly asked. The standard api-module must remain the source of truth.

## Authentication Requester Base Classes

The API class extends the matching requester base class.

**1. OAuth2 (`OAuth2Requester`)**

```javascript
const { OAuth2Requester } = require("@friggframework/core");

class MyApi extends OAuth2Requester {
  constructor(params) {
    super(params);
    this.baseUrl = "https://api.example.com";
    this.authorizationUri = "https://api.example.com/oauth/authorize";
    this.tokenUri = "https://api.example.com/oauth/token";
    this.client_id = process.env.CLIENT_ID;
    this.client_secret = process.env.CLIENT_SECRET;
    this.redirect_uri = process.env.REDIRECT_URI;
    this.scopes = ["read", "write"];
  }
}
```

**2. API Key (`ApiKeyRequester`)**

```javascript
const { ApiKeyRequester } = require("@friggframework/core");

class QuoApi extends ApiKeyRequester {
  constructor(params) {
    super(params);
    this.baseUrl = "https://dev-public-api.openphone.dev";
    this.API_KEY_NAME = "Authorization";       // header name
    const apiKey = params.access_token || params.api_key;
    this.access_token = apiKey;
    if (this.access_token) this.setApiKey(this.access_token);
  }
}
```

**Other base classes**:
- `BasicAuthRequester` — HTTP Basic Authentication
- `Requester` — base class for custom authentication

## Required Module Structure for Definitions

For the framework (and the `frigg auth` tester) to work, a module definition must provide:

```javascript
// definition.js
require("dotenv").config();

const Definition = {
  API: Api,                  // extends OAuth2Requester or ApiKeyRequester
  moduleName: "my-module",
  requiredAuthMethods: {
    // API-Key modules: return JSON Schema form for interactive CLI (see below)
    getAuthorizationRequirements: (api) => ({ /* ... */ }),

    getToken: async (api, params) => {
      const code = params.code;            // OAuth2: exchange code for tokens
      return api.getTokenFromCode(code);
    },
    getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
      const userInfo = await api.getUserDetails();
      return {
        identifiers: { externalId: userInfo.id, user: userId },
        details: { name: userInfo.name },
      };
    },
    getCredentialDetails: async (api, userId) => {
      const userInfo = await api.getUserDetails();
      return { identifiers: { externalId: userInfo.id, user: userId }, details: {} };
    },
    testAuthRequest: async (api) => api.getUserDetails(),   // any authenticated call
    apiPropertiesToPersist: {
      credential: ["access_token", "refresh_token"],
      entity: [],
    },
  },
  env: {
    client_id: process.env.MY_MODULE_CLIENT_ID,
    client_secret: process.env.MY_MODULE_CLIENT_SECRET,
    scope: process.env.MY_MODULE_SCOPE,
    redirect_uri: process.env.REDIRECT_URI,
  },
};

module.exports = { Definition };
```

## JSON Schema Form for API-Key Modules

API-Key modules define `getAuthorizationRequirements` to render an interactive CLI form (and drive the hosted auth UI):

```javascript
getAuthorizationRequirements: (api) => ({
  type: "apiKey",
  data: {
    jsonSchema: {
      title: "ConnectWise Authentication",
      type: "object",
      required: ["companyId", "publicKey", "privateKey"],
      properties: {
        companyId: { type: "string", title: "Company ID" },
        publicKey: { type: "string", title: "Public Key" },
        privateKey: { type: "string", title: "Private Key" },
        siteUrl: { type: "string", title: "Site URL" },
      },
    },
    uiSchema: {
      companyId: { "ui:help": "The Company ID you use to login" },
      publicKey: { "ui:help": "Your public key from My Account > API Keys" },
      privateKey: { "ui:widget": "password", "ui:help": "Your private key" },
      siteUrl: { "ui:help": "e.g., https://na.myconnectwise.net" },
    },
  },
});
```

Supported UI schema options:
- `ui:widget: 'password'` — masks input with `*`
- `ui:help` — help text shown before the field prompt
