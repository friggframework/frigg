# Management UI - Gaps Quick Reference

## Critical Blockers (Fix First)

### 1. No Authentication Token in API Requests
**Status:** BROKEN  
**Files:**
- `/src/infrastructure/http/api-client.js` (lines 10-18)
- `/src/infrastructure/adapters/AdminRepositoryAdapter.js` (lines 29-122)

**Problem:** API calls don't include Authorization header  
**Result:** 401 errors on authenticated endpoints

**Quick Fix:** Add to api-client.js:
```javascript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('frigg_auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

---

### 2. No OAuth Support
**Status:** MISSING  
**Files:**
- `/src/presentation/components/zones/TestAreaUserSelection.jsx` (no OAuth)
- `/src/presentation/components/zones/TestAreaContainer.jsx` (no OAuth)

**Problem:** Can only use password/impersonation auth  
**Result:** Cannot test OAuth-based integrations (Slack, GitHub, etc.)

**Scope:** Needs new OAuth flow implementation

---

### 3. No Entity Loading After Authentication
**Status:** INCOMPLETE  
**Files:**
- `/src/presentation/components/zones/TestingZone.jsx` (lines 168-198)

**Problem:** After user selected, no entities/credentials are loaded  
**Result:** IntegrationHub has no data to display

**What's Missing:**
- `loadUserEntities()` function
- Entity fetch endpoint call
- Pass entity context to IntegrationHub

---

### 4. No Integration Action Testing
**Status:** MISSING  
**Files:**
- `/src/presentation/components/zones/TestAreaContainer.jsx` (lines 406-416)

**Problem:** IntegrationHub lacks test execution capability  
**Result:** "Test Area" is view-only, not executable

**What's Needed:**
- Action execution endpoints in Frigg app
- Result display in UI
- Error handling for action failures

---

## Medium Priority Issues

### 5. Hardcoded WebSocket URL
**Status:** CONFIG ISSUE  
**File:** `/src/presentation/hooks/useSocket.jsx` (line 24)

```javascript
const newSocket = io('http://localhost:3210', {  // ← Hardcoded
```

**Fix:** Use environment variable or config

---

### 6. Token Not Persisted
**Status:** INCOMPLETE  
**Files:**
- `/src/presentation/components/zones/TestAreaUserSelection.jsx` (lines 124-127)

**Problem:** Token only stored in memory  
**Result:** Page refresh = must re-login

**Quick Fix:** Store in localStorage with TTL

---

### 7. Session Functions Unused
**Status:** CODE DEBT  
**File:** `/src/presentation/hooks/useFrigg.jsx` (lines 509-711)

**Problem:** Session management functions defined but never called  
**Result:** No activity tracking, no session persistence

**Impact:** Medium - not blocking, but unused code bloat

---

### 8. Global Entity Sync Missing
**Status:** INCOMPLETE  
**Files:**
- `/src/presentation/components/admin/GlobalEntityManagement.jsx`
- `/src/presentation/components/zones/TestAreaContainer.jsx`

**Problem:** Admin creates entity, but user view doesn't see it  
**Result:** State sync issues, entities not available for testing

---

## Low Priority Issues

### 9. /api/test Endpoints Unclear
**Status:** UNCLEAR PURPOSE  
**File:** `/src/presentation/hooks/useFrigg.jsx` (lines 596-643)

**Problem:** Not clear if this is testing separate environment or Frigg execution  
**Result:** Confusion about test environment purpose

---

### 10. State Scattered Across Components
**Status:** ARCHITECTURE ISSUE  
**Files:**
- `/src/presentation/hooks/useFrigg.jsx`
- `/src/presentation/components/zones/TestingZone.jsx`
- Multiple component local states

**Problem:** Auth state in multiple places, can get out of sync  
**Result:** Consistency issues with no single source of truth

---

## Recommended Fix Order

1. **First (30 mins):** Fix api-client.js token injection
2. **Second (2 hours):** Implement entity loading pipeline
3. **Third (4 hours):** Add OAuth framework
4. **Fourth (1 hour):** Configure WebSocket, persist token
5. **Later:** Wire up session tracking, consolidate state

---

## Testing Checklist

- [ ] User can login and token persists after page refresh
- [ ] User can see their entities/connections after login
- [ ] Can trigger test action on integration
- [ ] See results of test in UI
- [ ] WebSocket logs appear in real-time
- [ ] OAuth flow initiates (once implemented)
- [ ] Can impersonate different users
- [ ] Admin can manage global entities
- [ ] Global entities available in user view
- [ ] Error states handled gracefully with retry

---

## File Summary

### Always Modified Together
- api-client.js ↔ AdminRepositoryAdapter.js (auth context)
- TestingZone.jsx ↔ TestAreaContainer.jsx (entity passing)
- TestAreaUserSelection.jsx ↔ useFrigg.jsx (token management)

### Independent
- GlobalEntityManagement.jsx (could work standalone)
- DefinitionsZone.jsx (always available, no auth)
- useSocket.jsx (just config)

---

## Architecture Notes

**Current Flow (Incomplete):**
```
Frigg starts (port 3000) ✓
    ↓
User selected ✓
    ↓
Token obtained ✓
    ↓
IntegrationHub rendered ✓
    ↓
NO ENTITIES LOADED ✗
    ↓
NO ACTION EXECUTION ✗
    ↓
NO RESULTS SHOWN ✗
```

**Expected Flow (Complete):**
```
Frigg starts (port 3000) ✓
    ↓
User selected ✓
    ↓
Token obtained ✓
    ↓
IntegrationHub rendered ✓
    ↓
User entities loaded ✓
    ↓
Action executed ✓
    ↓
Results displayed ✓
```

