# SubType-Based OAuth Configuration Analysis

## Summary

**Current State**: Our type↔subType mapping fix is correct and doesn't break existing functionality.

**Gap Identified**: The current authorization flow does NOT support using different OAuth credentials (client_id, client_secret) for different instances of the same module type (distinguished by subType).

## Current Authorization Flow

### GET /api/authorize?entityType=hubspot

**Flow** (`integration-router.js:501-519`):
```
1. Extract entityType from query params
2. Call getModuleInstanceFromType.execute(userId, entityType)
   → Finds module definition by def.getName() === entityType
   → Creates Module with that definition
3. Module.getAuthorizationRequirements()
   → Returns OAuth config from API class (authorizationUri, client_id, client_secret)
```

**Issue**: No `subType` parameter accepted or used.

### POST /api/authorize (OAuth Callback)

**Flow** (`integration-router.js:522-538` → `process-authorization-callback.js:17-80`):
```
1. Extract entityType and data from request body
2. Find module definition by entityType === def.moduleName  (line 19)
3. Create Module instance with that definition
4. Exchange OAuth code for tokens using module's OAuth config
5. Create entity with moduleName, but NOT subType:

   createEntity({
       ...identifiers,
       ...details,
       moduleName: moduleName,  // ✅ Set
       credential: credentialId,
       // ❌ subType: NOT SET HERE
   })
```

**Issue**:
- No `subType` parameter extracted from request
- Entity created without `subType` field
- No mechanism to select different OAuth config based on subType

## The Use Case Gap

**Desired Scenario**:
```javascript
// Integration Definition with subType-specific OAuth configs
class MyIntegration extends IntegrationBase {
    static Definition = {
        modules: {
            hubspot: {
                moduleName: 'hubspot',
                // Default OAuth config
                client_id: process.env.HUBSPOT_CLIENT_ID,
                client_secret: process.env.HUBSPOT_CLIENT_SECRET,

                // Desired: subType-specific overrides
                subTypeConfigs: {
                    'hubspot-crm': {
                        client_id: process.env.HUBSPOT_CRM_CLIENT_ID,
                        client_secret: process.env.HUBSPOT_CRM_CLIENT_SECRET,
                    },
                    'hubspot-marketing': {
                        client_id: process.env.HUBSPOT_MARKETING_CLIENT_ID,
                        client_secret: process.env.HUBSPOT_MARKETING_CLIENT_SECRET,
                    }
                }
            }
        }
    };
}
```

**Desired Flow**:
```
GET /api/authorize?entityType=hubspot&subType=hubspot-crm
→ Use HUBSPOT_CRM_CLIENT_ID and HUBSPOT_CRM_CLIENT_SECRET

POST /api/authorize
{
    entityType: 'hubspot',
    subType: 'hubspot-crm',  // ❌ NOT CURRENTLY SUPPORTED
    data: { code: '...' }
}
→ Create entity with both moduleName='hubspot' AND subType='hubspot-crm'
```

## Architecture Required for SubType OAuth Support

### 1. Router Changes (`integration-router.js`)

**GET /api/authorize**:
```javascript
router.route('/api/authorize').get(
    catchAsyncError(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const userId = user.getId();
        const params = checkRequiredParams(req.query, ['entityType']);
        const subType = req.query.subType; // NEW: Accept optional subType

        const module = await getModuleInstanceFromType.execute(
            userId,
            params.entityType,
            subType  // NEW: Pass subType to module creation
        );

        res.json(module.getAuthorizationRequirements());
    })
);
```

**POST /api/authorize**:
```javascript
router.route('/api/authorize').post(
    catchAsyncError(async (req, res) => {
        const user = await authenticateUser.execute(req);
        const userId = user.getId();
        const params = checkRequiredParams(req.body, ['entityType', 'data']);

        const entityDetails = await processAuthorizationCallback.execute(
            userId,
            params.entityType,
            params.data,
            params.subType  // NEW: Pass subType to callback processing
        );

        res.json(entityDetails);
    })
);
```

### 2. Use Case Changes

**GetModuleInstanceFromType** (`get-module-instance-from-type.js:17-28`):
```javascript
async execute(userId, type, subType = null) {
    const moduleDefinition = this.moduleDefinitions.find(
        (def) => def.getName() === type
    );

    if (!moduleDefinition) {
        throw new Error(`Module definition not found for type: ${type}`);
    }

    // NEW: Apply subType-specific OAuth config if provided
    const effectiveDefinition = subType
        ? this._applySubTypeConfig(moduleDefinition, subType)
        : moduleDefinition;

    return new Module({
        userId,
        definition: effectiveDefinition,
        subType,  // NEW: Pass subType to Module
    });
}

_applySubTypeConfig(definition, subType) {
    const subTypeConfig = definition.subTypeConfigs?.[subType];
    if (!subTypeConfig) {
        return definition; // No override, use default
    }

    // Merge subType-specific OAuth config
    return {
        ...definition,
        // Override OAuth credentials
        client_id: subTypeConfig.client_id || definition.client_id,
        client_secret: subTypeConfig.client_secret || definition.client_secret,
        // ... other OAuth params
    };
}
```

**ProcessAuthorizationCallback** (`process-authorization-callback.js:17-80`):
```javascript
async execute(userId, entityType, params, subType = null) {  // NEW: Accept subType
    const moduleDefinition = this.moduleDefinitions.find((def) => {
        return entityType === def.moduleName;
    });

    // ... existing code ...

    const persistedEntity = await this.findOrCreateEntity(
        entityDetails,
        entityType,
        module.credential.id,
        subType  // NEW: Pass subType
    );

    return {
        credential_id: module.credential.id,
        entity_id: persistedEntity.id,
        type: module.getName(),
        subType: subType,  // NEW: Return subType
    };
}

async findOrCreateEntity(entityDetails, moduleName, credentialId, subType = null) {
    const { identifiers, details } = entityDetails;

    const filter = {
        externalId: identifiers.externalId,
        user: identifiers.user,
        moduleName: moduleName,
    };

    // NEW: Include subType in filter if provided
    if (subType) {
        filter.subType = subType;
    }

    const existingEntity = await this.moduleRepository.findEntity(filter);

    if (existingEntity) {
        return existingEntity;
    }

    return await this.moduleRepository.createEntity({
        ...identifiers,
        ...details,
        moduleName: moduleName,
        subType: subType,  // NEW: Set subType on entity
        credential: credentialId,
    });
}
```

### 3. Module/API Class Changes

**Module class** would need to:
1. Accept `subType` in constructor
2. Pass subType-specific OAuth config to API class
3. Store subType for entity persistence

**API class** would need to:
- Accept overridden client_id, client_secret in constructor
- Use the correct credentials for the specific subType instance

## Impact Assessment of Our Changes

✅ **Our fix is correct**: Using `moduleName` for module type identification is architecturally correct.

✅ **No breaking changes**: All existing flows that don't use subType continue to work.

⚠️ **Feature gap**: SubType-based OAuth configuration is NOT currently supported by the framework.

## Recommendations

### Option 1: Document as Known Limitation
Add to documentation:
> **SubType OAuth Configuration**: The framework currently does not support using different OAuth credentials for different subTypes of the same module. All instances of a module type (e.g., "hubspot") use the same OAuth configuration defined in the module definition.

### Option 2: Implement SubType OAuth Support
Follow the architecture outlined above to add full subType OAuth support. This would require:
- Router parameter changes (backward compatible)
- Use case signature changes (backward compatible with defaults)
- Module/API class enhancements
- Integration Definition schema extension

### Option 3: Workaround Pattern
Document a workaround pattern where adopters create separate module definitions:
```javascript
// Instead of one module with subTypes:
modules: {
    hubspot: { /* config */ }
}

// Create separate modules:
modules: {
    'hubspot-crm': {
        moduleName: 'hubspot-crm',
        client_id: process.env.HUBSPOT_CRM_CLIENT_ID,
        // ...
    },
    'hubspot-marketing': {
        moduleName: 'hubspot-marketing',
        client_id: process.env.HUBSPOT_MARKETING_CLIENT_ID,
        // ...
    }
}
```

This treats them as separate module types rather than subTypes of the same module.

## Conclusion

Our type↔subType mapping fix is **architecturally correct** and **does not break** the OAuth flow. However, it highlights a **feature gap**: the framework doesn't currently support subType-specific OAuth configurations.

The user's concern is valid for the use case of having multiple OAuth apps for the same API (e.g., different HubSpot OAuth apps for different departments), but this would require new features to support, not fixes to our changes.
