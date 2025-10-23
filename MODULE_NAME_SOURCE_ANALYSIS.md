# How moduleName Is Determined

## TL;DR

**The `moduleName` comes from INSIDE the module definition object, NOT from the property key.**

The property key in `modules: { 'key-here': ... }` is **completely ignored**.

## Code Flow

### 1. Integration Definition Structure

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'MyIntegration',
        modules: {
            // ❌ This key 'any-key-works' is IGNORED
            'any-key-works': {
                definition: {
                    moduleName: 'hubspot-crm',  // ✅ THIS is what matters
                    modelName: 'HubspotCRM',
                    getName: () => 'hubspot-crm',
                    API: HubspotApi,
                    env: {
                        client_id: process.env.HUBSPOT_CRM_CLIENT_ID,
                        client_secret: process.env.HUBSPOT_CRM_CLIENT_SECRET,
                    },
                    // ... other fields
                }
            },
            // The key could be different from moduleName
            'different-key': {
                definition: {
                    moduleName: 'hubspot-marketing',  // ✅ moduleName inside definition
                    // ...
                }
            }
        }
    };
}
```

### 2. Module Extraction (`map-integration-dto.js:22-34`)

```javascript
const getModulesDefinitionFromIntegrationClasses = (integrationClasses) => {
    return [
        ...new Set(
            integrationClasses
                .map((integration) =>
                    Object.values(integration.Definition.modules).map(
                        // ^^^^^^^ Using Object.values() - IGNORES the keys!
                        (module) => module.definition
                        // ^^^^^^^^^^^^^^^^^^^ Extracts the definition object
                    )
                )
                .flat()
        ),
    ];
};
```

**What this does:**
1. Takes `integration.Definition.modules` object
2. Uses `Object.values()` to get just the values (ignores keys)
3. For each module value, extracts `module.definition`
4. Returns array of definition objects

**Example transformation:**
```javascript
// Input:
modules: {
    'ignored-key-1': { definition: { moduleName: 'hubspot-crm', ... } },
    'ignored-key-2': { definition: { moduleName: 'hubspot-marketing', ... } }
}

// Output:
[
    { moduleName: 'hubspot-crm', ... },
    { moduleName: 'hubspot-marketing', ... }
]
```

### 3. Module Lookup (`process-authorization-callback.js:18-20`)

```javascript
const moduleDefinition = this.moduleDefinitions.find((def) => {
    return entityType === def.moduleName;
    // Comparing to the moduleName field INSIDE the definition
});
```

## Real Example from Codebase

From `packages/core/modules/test/mock-api/definition.js:6-13`:

```javascript
const config = { name: 'anapi' }

const Definition = {
    API: Api,
    getName: function () { return config.name },
    moduleName: config.name,  // ✅ moduleName is 'anapi'
    modelName: 'AnApi',
    // ...
};
```

This definition would be used like:
```javascript
modules: {
    'any-key-here': {  // ❌ Key doesn't matter
        definition: Definition  // The Definition object contains moduleName: 'anapi'
    }
}
```

## Another Example from Tests

From `packages/core/integrations/tests/doubles/dummy-integration-class.js:3-14`:

```javascript
class DummyModule {
    static definition = {
        getName: () => 'dummy',
        moduleName: 'dummy',  // ✅ moduleName inside definition
        // ... (implicitly defined)
    };
}

class DummyIntegration extends IntegrationBase {
    static Definition = {
        modules: {
            dummy: DummyModule  // ❌ Key 'dummy' is ignored
            // Only DummyModule.definition is extracted
        }
    };
}
```

## Important Implications

### ✅ These Would Work:

**Option A - Matching keys (conventional):**
```javascript
modules: {
    'hubspot-crm': {
        definition: { moduleName: 'hubspot-crm', ... }
    },
    'hubspot-marketing': {
        definition: { moduleName: 'hubspot-marketing', ... }
    }
}
```

**Option B - Non-matching keys (unconventional but works):**
```javascript
modules: {
    'first-module': {
        definition: { moduleName: 'hubspot-crm', ... }  // Uses 'hubspot-crm'
    },
    'second-module': {
        definition: { moduleName: 'hubspot-marketing', ... }  // Uses 'hubspot-marketing'
    }
}
```

**Option C - Short keys (works fine):**
```javascript
modules: {
    'a': {
        definition: { moduleName: 'hubspot-crm', ... }
    },
    'b': {
        definition: { moduleName: 'hubspot-marketing', ... }
    }
}
```

### ❌ These Would Break:

**Duplicate moduleName values (even with different keys):**
```javascript
modules: {
    'key1': {
        definition: { moduleName: 'hubspot', ... }  // ❌ Duplicate moduleName
    },
    'key2': {
        definition: { moduleName: 'hubspot', ... }  // ❌ Same moduleName!
    }
}
```

This would break because `ProcessAuthorizationCallback` does:
```javascript
moduleDefinitions.find((def) => entityType === def.moduleName)
```

With duplicate `moduleName` values, `.find()` would always return the first match, making the second module unreachable.

## Best Practice Recommendation

**Use matching keys for clarity:**
```javascript
modules: {
    'hubspot-crm': {  // Key matches moduleName for clarity
        definition: {
            moduleName: 'hubspot-crm',  // Actual value used for lookups
            // ...
        }
    }
}
```

**Why?**
- Makes code more readable
- Prevents confusion
- Documents intent clearly
- Easier to debug

But technically, the keys could be anything - only `moduleName` inside the definition matters for functionality.

## Summary

| Location | Purpose | Used For Lookup? |
|----------|---------|------------------|
| `modules: { 'KEY': ... }` | Developer organization only | ❌ No - ignored |
| `definition.moduleName` | Module type identifier | ✅ YES - this is matched |
| `definition.getName()` | Display name | Sometimes |
| `definition.modelName` | Database model name | For model matching |

**The property key is purely for developer convenience and organization - it has zero runtime impact.**
