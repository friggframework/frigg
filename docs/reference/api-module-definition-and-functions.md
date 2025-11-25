# API Module Definition and Functions

#### Module Definition

```javascript
const API = require('./api');
const authDef = {
    API: API,
    getName: function() {return config.name},
	   moduleName: config.name,
    requiredAuthMethods: {
        // oauth methods
        getToken: async function(api, params) {},
        // for all Auth methods
	 apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: []
        },
        getCredentialDetails: async function(api) {}, 
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {},
        testAuthRequest: async function() {}, // basic request to testAuth
    },
    env: {
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        scope: process.env.HUBSPOT_SCOPE,
        redirect_uri: `${process.env.REDIRECT_URI}/an-api`,
    }
};
```

#### getToken

For OAuth2, this function typically looks like this:

```javascript
const code = get(params.data, 'code'); 
 await api.getTokenFromCode(code);
```

The `getTokenFromCode` method will make the token request and set the token on the API class.

#### apiPropertiesToPersist

Named arrays of properties to persist on either the entity or credential. Upon API class instantiation, these will be retrieved from the entity/credential and passed into the API class. Typically, the entity won't need to store anything, and the credential will suffice to persist tokens and other connection metadata.

#### getEntityDetails

Retrieve and return details about the user/organization that is authorizing requests to this API. Should return something like:

```javascript
 const userDetails = await api.getUserDetails();
return {
        identifiers: { externalId: userDetails.portalId, user: api.userId },
        details: { name: userDetails.hub_domain },
}
```

The identifiers define the uniqueness of the entity and how it is looked up. It will automatically be linked to the created credential.

#### getCredentialDetails

Similar to `getEntityDetails`, returns:

```javascript
 const userDetails = await api.getUserDetails();
return {
        identifiers: { externalId: userDetails.portalId },
        details: {}
};
```

Generally, the entity is looked up first, and the credential is found through that reference.

***

{% hint style="info" %}
The entity and credential details functions require the most knowledge of Frigg Framework, and a deeper understanding of how authentication is handled by the external API. In the case where the external API has user accounts, and tokens per user (vs app or organization tokens), the `externalId` should likely be the user's id in that system (or their email, or whatever unique info can be retrieved).
{% endhint %}

#### encryption (Module-Level Encryption Configuration)

**NEW**: API modules can declare encryption requirements for credential fields:

```javascript
const authDef = {
    API: API,
    moduleName: config.name,

    // Declare which credential fields need encryption
    encryption: {
        credentialFields: ['api_key', 'webhook_secret']
    },

    requiredAuthMethods: {
        apiPropertiesToPersist: {
            credential: ['api_key', 'webhook_secret'],  // These will be auto-encrypted
            entity: []
        },
        // ... other methods
    }
};
```

**How It Works:**
1. Module declares `encryption.credentialFields` array with field names
2. Framework automatically adds `data.` prefix for database storage
3. Fields are merged with core encryption schema on app startup
4. All credential data is transparently encrypted/decrypted

**Common Authentication Patterns:**

```javascript
// OAuth Authentication (automatically encrypted)
apiPropertiesToPersist: {
    credential: ['access_token', 'refresh_token']  // Core schema - no config needed
}

// API Key Authentication
encryption: {
    credentialFields: ['api_key']  // Automatically encrypted as data.api_key
},
apiPropertiesToPersist: {
    credential: ['api_key']
}

// Basic Authentication (automatically encrypted)
apiPropertiesToPersist: {
    credential: ['username', 'password']  // Core schema - no config needed
}

// Custom Authentication
encryption: {
    credentialFields: ['signing_key', 'webhook_secret', 'custom_token']
},
apiPropertiesToPersist: {
    credential: ['signing_key', 'webhook_secret', 'custom_token']
}
```

**Best Practices:**
- Use **snake_case** for credential field names (e.g., `api_key` not `apiKey`)
- Only declare custom fields not in core schema (OAuth tokens, passwords already encrypted)
- Fields in `encryption.credentialFields` should match `apiPropertiesToPersist.credential`

See `packages/core/database/encryption/README.md` for complete encryption documentation.
