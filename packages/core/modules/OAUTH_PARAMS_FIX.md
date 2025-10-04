# OAuth Parameters Fix - Hexagonal Architecture Implementation

## Problem Summary

HubSpot (and all v1 OAuth modules) were failing with error:
```
Key "code" is a required parameter
```

**Root Cause**: Parameter structure mismatch
- **OAuth callback provides**: `{ code: '...', state: '...' }`
- **v1 modules expect**: `params.data.code` (wrapped in data property)
- **HubSpot definition** (`api-module-library/packages/v1-ready/hubspot/definition.js:15`):
  ```javascript
  const code = get(params.data, 'code');  // Expects params.data.code
  ```

## Solution: Hexagonal Architecture with Adapter Pattern

### Architecture Components

```
┌─────────────────────────────────────────────────────┐
│ HTTP Handler (auth.js)                              │
│  - Receives OAuth callback                          │
│  - Extracts code & state from query params          │
└────────────────┬────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────┐
│ Use Case (ProcessAuthorizationCallback)            │
│  - Business logic orchestration                     │
│  - Uses OAuthParamsAdapter (injected)              │
└────────────────┬────────────────────────────────────┘
                 │ uses
┌────────────────▼────────────────────────────────────┐
│ Adapter (OAuthParamsAdapter)                        │
│  - Transforms params to module-expected format      │
│  - V1: wraps in data property                       │
│  - V2: passes through directly                      │
└────────────────┬────────────────────────────────────┘
                 │ adapted params
┌────────────────▼────────────────────────────────────┐
│ Module Definition (HubSpot getToken)                │
│  - Receives params in expected format               │
│  - get(params.data, 'code') works correctly        │
└─────────────────────────────────────────────────────┘
```

### Files Created

1. **Adapter (Port)**: `packages/core/modules/adapters/oauth-params-adapter.js`
   - Interface: `OAuthParamsAdapterInterface`
   - V1 Implementation: `V1OAuthParamsAdapter` (wraps in data)
   - V2 Implementation: `V2OAuthParamsAdapter` (pass-through)
   - Factory: `OAuthParamsAdapterFactory`

2. **Tests**:
   - `packages/core/modules/adapters/__tests__/oauth-params-adapter.test.js` (adapter tests)
   - `packages/core/modules/__tests__/unit/use-cases/oauth-param-bug-simple.test.js` (bug reproduction)
   - `packages/core/modules/__tests__/unit/use-cases/process-authorization-callback-di.test.js` (DI tests)

### Code Changes

**Use Case** (`process-authorization-callback.js`):
```javascript
// ✅ Dependency Injection in constructor
constructor({ moduleRepository, credentialRepository, moduleDefinitions, oauthParamsAdapter = null }) {
    this.oauthParamsAdapter = oauthParamsAdapter || OAuthParamsAdapterFactory.create('v1');
}

// ✅ Use adapter to transform params
if (module.apiClass.requesterType === ModuleConstants.authType.oauth2) {
    const adaptedParams = this.oauthParamsAdapter.transform(params);
    tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
        module.api,
        adaptedParams
    );
}
```

**Adapter Implementation**:
```javascript
class V1OAuthParamsAdapter {
  transform(params) {
    // v1 modules expect: get(params.data, 'code')
    return { data: params };
  }
}

class V2OAuthParamsAdapter {
  transform(params) {
    // v2 modules expect params directly
    return params;
  }
}
```

## Benefits of This Architecture

### 1. **Testability**
- Each component tested in isolation
- No complex mocks needed
- Adapter tests: 6 simple tests
- DI tests: 3 simple tests

### 2. **Maintainability**
- Clear separation of concerns
- Easy to add new module versions (v3, v4, etc.)
- Adapter logic centralized in one place

### 3. **Flexibility**
- Different modules can use different adapters
- Easy to swap adapters via DI
- Backward compatible (defaults to V1)

### 4. **Domain-Driven Design Compliance**
- Use Case: Business logic (orchestration)
- Adapter: Infrastructure concern (transformation)
- Repository: Data access
- Clear boundaries between layers

## Testing

All tests pass:
```bash
✓ OAuth param bug reproduction (2 tests)
✓ Adapter functionality (6 tests)
✓ Dependency injection (3 tests)
```

## How to Use

### Default Behavior (v1 modules)
```javascript
// Auto-uses V1 adapter (backward compatible)
const useCase = new ProcessAuthorizationCallback({
    moduleRepository,
    credentialRepository,
    moduleDefinitions
});
```

### Custom Adapter (v2 modules)
```javascript
// Inject custom adapter
const useCase = new ProcessAuthorizationCallback({
    moduleRepository,
    credentialRepository,
    moduleDefinitions,
    oauthParamsAdapter: new V2OAuthParamsAdapter()
});
```

### Testing with Mock
```javascript
// Easy to mock
const mockAdapter = { transform: jest.fn((p) => p) };
const useCase = new ProcessAuthorizationCallback({
    moduleRepository,
    credentialRepository,
    moduleDefinitions,
    oauthParamsAdapter: mockAdapter
});
```

## Migration Path

**Current**: All v1 modules (HubSpot, Salesforce, etc.) automatically use V1 adapter
**Future**: New v2 modules can use V2 adapter (or create custom adapters)

No breaking changes - fully backward compatible.
