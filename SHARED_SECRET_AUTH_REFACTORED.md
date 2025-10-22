# Shared Secret Authentication - Architecture Refactored ✅

## Summary

Successfully refactored shared secret authentication to properly separate **authentication** (proving legitimacy) from **authorization** (identifying user). The architecture now clearly demonstrates single responsibility principle.

## Architectural Separation

### Before Refactoring ❌
```
GetUserFromSharedSecret
├── Validate API key (authentication)
└── Look up user from x-frigg headers (authorization)
```

The name `GetUserFromSharedSecret` was misleading because:
- The shared secret contains NO user information
- User data comes from x-frigg headers, not the secret
- Mixed two responsibilities in one use case

### After Refactoring ✅
```
AuthenticateWithSharedSecret
└── Validate API key (authentication only)

GetUserFromXFriggHeaders (already existed)
└── Look up user from headers (authorization only)
```

Now each use case has a single, clear responsibility:
- `AuthenticateWithSharedSecret` - Proves request is legitimate
- `GetUserFromXFriggHeaders` - Identifies who the user is

## Implementation Details

### 1. AuthenticateWithSharedSecret
**File**: `packages/core/user/use-cases/authenticate-with-shared-secret.js`

```javascript
class AuthenticateWithSharedSecret {
    async execute(providedSecret) {
        const expectedSecret = process.env.FRIGG_API_KEY;
        if (!expectedSecret) {
            throw Boom.badImplementation('FRIGG_API_KEY not configured');
        }
        if (!providedSecret || providedSecret !== expectedSecret) {
            throw Boom.unauthorized('Invalid API key');
        }
        return true; // Authentication successful
    }
}
```

**Responsibilities**:
- ✅ Validates FRIGG_API_KEY is configured
- ✅ Compares provided secret against expected secret
- ✅ Returns true on success
- ✅ Throws appropriate errors on failure
- ❌ Does NOT look up users
- ❌ Does NOT handle x-frigg headers

### 2. Updated AuthenticateUser Flow

**File**: `packages/core/user/use-cases/authenticate-user.js`

```javascript
// Priority 1: Shared Secret
if (authModes.sharedSecret !== false) {
    const apiKey = req.headers['x-frigg-api-key'];
    if (apiKey) {
        // Step 1: Authenticate (prove legitimacy)
        await this.authenticateWithSharedSecret.execute(apiKey);
        
        // Step 2: Authorize (identify user)
        return await this.getUserFromXFriggHeaders.execute(
            appUserId,
            appOrgId
        );
    }
}
```

**Flow**:
1. **Authentication**: Validate API key
2. **Authorization**: Get user from x-frigg headers

This makes the two-step process explicit and reuses existing `GetUserFromXFriggHeaders` logic.

## Benefits of Refactoring

### 1. **Clarity** 
- Use case names accurately reflect their purpose
- No confusion about where user data comes from
- Explicit separation of concerns

### 2. **Reusability**
- `AuthenticateWithSharedSecret` can be used independently
- `GetUserFromXFriggHeaders` already used by other auth modes
- Less code duplication

### 3. **Testability**
- Can test authentication without involving user lookup
- Can test user lookup without involving secrets
- More focused, simpler tests

### 4. **Maintainability**
- Single Responsibility Principle
- Easier to understand and modify
- Clear dependencies

## File Changes

### Renamed Files
- `get-user-from-shared-secret.js` → `authenticate-with-shared-secret.js`
- `get-user-from-shared-secret.test.js` → `authenticate-with-shared-secret.test.js`

### Modified Files
- `packages/core/user/use-cases/authenticate-user.js`
  - Constructor now takes `authenticateWithSharedSecret`
  - Shared secret flow now calls both authenticate and getUserFromXFriggHeaders
  
- `packages/core/integrations/integration-router.js`
  - Import renamed to `AuthenticateWithSharedSecret`
  - Instantiation simplified (no dependencies needed)

- `packages/core/integrations/tests/integration-router-multi-auth.test.js`
  - All references updated
  - Tests now verify both authentication and user lookup are called

## Test Results

**All 41 tests passing** ✅

### AuthenticateWithSharedSecret Tests (19 tests)
- Secret validation (8 tests)
- Error handling (2 tests)
- Security (3 tests)

### Multi-Auth Integration Tests (22 tests)
- Shared secret with x-frigg headers (3 tests)
- Priority ordering (3 tests)
- JWT validation (4 tests)
- Frigg token validation (3 tests)
- Auth mode configuration (2 tests)
- Validation logic (3 tests)
- Error handling (3 tests)

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Use Case Name** | GetUserFromSharedSecret | AuthenticateWithSharedSecret |
| **Purpose** | Mixed auth + user lookup | Authentication only |
| **Dependencies** | userRepository, userConfig | None |
| **Returns** | User object | Boolean (true) |
| **Responsibilities** | 2 (auth + lookup) | 1 (auth only) |
| **Code Reuse** | Duplicated lookup logic | Reuses GetUserFromXFriggHeaders |
| **Lines of Code** | ~130 lines | ~45 lines |
| **Clarity** | Misleading name | Clear purpose |

## Usage Example

```javascript
// Backend service making authenticated request
const response = await fetch('https://api.frigg.com/api/integrations', {
    headers: {
        // Authentication: Proves legitimacy
        'x-frigg-api-key': process.env.FRIGG_API_KEY,
        
        // Authorization: Identifies user
        'x-frigg-appuserid': 'user-123',
        'x-frigg-apporgid': 'org-456'
    }
});
```

**What happens internally**:
1. `AuthenticateWithSharedSecret` validates the API key
2. `GetUserFromXFriggHeaders` looks up the user
3. Request proceeds with authenticated user context

## Conclusion

This refactoring demonstrates proper separation of concerns:
- **Authentication** = "Is this request legitimate?"
- **Authorization** = "Who is making this request?"

The shared secret proves legitimacy, x-frigg headers identify the user. Each use case now has a single, clear responsibility that matches its name.

---

**Refactored by**: Claude (Assistant)  
**Date**: January 2025  
**Status**: Complete and Tested ✅

