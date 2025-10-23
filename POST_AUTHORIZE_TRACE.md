# POST /api/authorize Flow Trace

## Question
If `entityType` in the body is `"hubspot-crm"`, would it grab the right module from the right integration?

## Short Answer
**YES** ✅ - It SHOULD work correctly, BUT only if you structure your module definitions as separate modules (not using `subType`).

## Detailed Flow Trace

### Request
```http
POST /api/authorize
{
  "entityType": "hubspot-crm",
  "data": { "code": "oauth_code_here" }
}
```

### Step 1: Router (`integration-router.js:522-538`)
```javascript
router.route('/api/authorize').post(
    catchAsyncError(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const userId = user.getId();
        const params = checkRequiredParams(req.body, ['entityType', 'data']);
        // params.entityType = "hubspot-crm"

        const entityDetails = await processAuthorizationCallback.execute(
            userId,
            params.entityType,  // "hubspot-crm"
            params.data
        );

        res.json(entityDetails);
    })
);
```

### Step 2: ProcessAuthorizationCallback.execute (`process-authorization-callback.js:17-26`)
```javascript
async execute(userId, entityType, params) {
    // entityType = "hubspot-crm"

    // CRITICAL LINE 19: Searches for module definition by moduleName
    const moduleDefinition = this.moduleDefinitions.find((def) => {
        return entityType === def.moduleName;
        // Looking for: def.moduleName === "hubspot-crm"
    });

    if (!moduleDefinition) {
        throw new Error(
            `Module definition not found for entity type: ${entityType}`
        );
    }
    // ... continues
}
```

### Step 3: Module Definitions Source (`integration-router.js:191-196`)
```javascript
const processAuthorizationCallback = new ProcessAuthorizationCallback({
    moduleRepository,
    credentialRepository,
    moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    // ^^^^^^^^^ Where do moduleDefinitions come from?
});
```

### Step 4: Module Definitions Extraction (`map-integration-dto.js:22-34`)
```javascript
const getModulesDefinitionFromIntegrationClasses = (integrationClasses) => {
    return [
        ...new Set(
            integrationClasses
                .map((integration) =>
                    Object.values(integration.Definition.modules).map(
                        (module) => module.definition
                        // ^^^^^^^^^ Extracts each module's definition object
                    )
                )
                .flat()
        ),
    ];
};
```

### Step 5: Module Definition Structure (`modules/test/mock-api/definition.js` example)
```javascript
const Definition = {
    API: Api,
    moduleName: 'hubspot-crm',  // ✅ THIS is what gets matched!
    modelName: 'HubspotCRM',
    getName: function () { return 'hubspot-crm' },
    requiredAuthMethods: {
        getToken: async function (api, params) { /* ... */ },
        getEntityDetails: async function (api, callbackParams, tokenResponse, userId) { /* ... */ },
        // ...
    },
    env: {
        client_id: process.env.HUBSPOT_CRM_CLIENT_ID,     // ✅ Different per module!
        client_secret: process.env.HUBSPOT_CRM_CLIENT_SECRET,  // ✅ Different per module!
        scope: 'contacts companies deals',
        redirect_uri: 'https://yourapp.com/redirect/hubspot-crm',
    }
};
```

### Step 6: Module Creation (`process-authorization-callback.js:31-35`)
```javascript
const module = new Module({
    userId,
    entity: null,
    definition: moduleDefinition,  // The "hubspot-crm" definition with its specific env vars
});
```

### Step 7: Module Constructor (`module.js:27-48`)
```javascript
constructor(userId, entityObj, definition) {
    this.definition = definition;
    this.name = this.definition.moduleName;  // "hubspot-crm"

    const apiParams = {
        ...this.definition.env,  // ✅ Uses hubspot-crm's client_id, client_secret
        delegate: this,
        ...(this.credential?.data ? this.apiParamsFromCredential(this.credential.data) : {}),
        ...this.apiParamsFromEntity(this.entity),
    };
    this.api = new this.apiClass(apiParams);  // ✅ API instance created with correct credentials
}
```

### Step 8: Entity Creation (`process-authorization-callback.js:100-118`)
```javascript
async findOrCreateEntity(entityDetails, moduleName, credentialId) {
    // moduleName = "hubspot-crm" (passed from execute())

    const existingEntity = await this.moduleRepository.findEntity({
        externalId: identifiers.externalId,
        user: identifiers.user,
        moduleName: moduleName,  // "hubspot-crm"
    });

    if (existingEntity) {
        return existingEntity;
    }

    return await this.moduleRepository.createEntity({
        ...identifiers,
        ...details,
        moduleName: moduleName,  // ✅ Entity created with moduleName="hubspot-crm"
        credential: credentialId,
        // Note: subType is NOT set here (would be undefined/null)
    });
}
```

### Step 9: Return Value (`process-authorization-callback.js:76-80`)
```javascript
return {
    credential_id: module.credential.id,
    entity_id: persistedEntity.id,
    type: module.getName(),  // ✅ Returns "hubspot-crm"
};
```

## Integration Definition Structure

For this to work, your Integration would look like:

```javascript
class MyHubspotIntegration extends IntegrationBase {
    static Definition = {
        name: 'MyHubspotIntegration',
        modules: {
            'hubspot-crm': {
                definition: HubspotCRMDefinition  // moduleName: 'hubspot-crm'
            },
            'hubspot-marketing': {
                definition: HubspotMarketingDefinition  // moduleName: 'hubspot-marketing'
            }
        }
    };
}
```

Where each definition is a separate object:

```javascript
// HubspotCRMDefinition
const HubspotCRMDefinition = {
    API: HubspotApi,
    moduleName: 'hubspot-crm',  // ✅ Unique identifier
    modelName: 'HubspotCRM',
    getName: () => 'hubspot-crm',
    env: {
        client_id: process.env.HUBSPOT_CRM_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CRM_CLIENT_SECRET,
        // ...
    },
    // ...
};

// HubspotMarketingDefinition
const HubspotMarketingDefinition = {
    API: HubspotApi,
    moduleName: 'hubspot-marketing',  // ✅ Different identifier
    modelName: 'HubspotMarketing',
    getName: () => 'hubspot-marketing',
    env: {
        client_id: process.env.HUBSPOT_MARKETING_CLIENT_ID,
        client_secret: process.env.HUBSPOT_MARKETING_CLIENT_SECRET,
        // ...
    },
    // ...
};
```

## Database State After Authorization

**Entity record:**
```javascript
{
    id: "generated_id",
    userId: "user123",
    credentialId: "cred456",
    moduleName: "hubspot-crm",  // ✅ Identifies the module type
    subType: undefined,          // ⚠️ NOT set by current code
    name: "HubSpot CRM Account",
    externalId: "portal_12345",
    // ...
}
```

## Key Points

✅ **Works correctly** if you use separate `moduleName` values:
   - Each module definition has unique `moduleName`
   - Each has its own `env` with different OAuth credentials
   - Entity stored with correct `moduleName`

⚠️ **NOT using subType**:
   - This approach treats "hubspot-crm" and "hubspot-marketing" as **different module types**
   - They are NOT using `subType` to distinguish instances
   - `subType` field would be `null`/`undefined` on the entity

✅ **Retrieval works** because:
   - `ModuleFactory.createFromEntityId()` finds entity by `entity.moduleName`
   - Looks up module definition where `def.moduleName === entity.moduleName`
   - Creates Module with correct definition (including correct OAuth config)

## The SubType vs Separate Modules Pattern

### Pattern 1: Separate Modules (CURRENT CODE SUPPORTS THIS ✅)
```javascript
moduleName: "hubspot-crm"     → Uses HUBSPOT_CRM_CLIENT_ID
moduleName: "hubspot-marketing" → Uses HUBSPOT_MARKETING_CLIENT_ID
subType: undefined/null
```

**Use case**: Different products/APIs that happen to use the same API library

### Pattern 2: SubType-Based (NOT CURRENTLY SUPPORTED ❌)
```javascript
moduleName: "hubspot"         → Same module type
subType: "crm"                → Distinguishes instance
subType: "marketing"          → Distinguishes instance
```

**Use case**: Multiple accounts/instances of the exact same API with different OAuth apps

The current authorization flow does NOT support Pattern 2 (subType-based OAuth).

## Conclusion

**YES**, the current code would work correctly for:
```http
POST /api/authorize
{
  "entityType": "hubspot-crm",
  "data": { "code": "..." }
}
```

It would:
1. Find the module definition with `moduleName: "hubspot-crm"`
2. Use that definition's OAuth config (client_id, client_secret)
3. Create an entity with `moduleName: "hubspot-crm"`
4. Store and later retrieve using that `moduleName`

However, this is treating "hubspot-crm" and "hubspot-marketing" as **separate module types**, not as **subTypes of the same module**. This is semantically different but functionally works for the OAuth credential separation use case.
