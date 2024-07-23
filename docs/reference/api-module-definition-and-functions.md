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
