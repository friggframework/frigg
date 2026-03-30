# Critical Files for Management UI End-to-End Flows

## Absolute File Paths

### Authentication & State Management
- `/home/user/frigg/packages/devtools/management-ui/src/infrastructure/http/api-client.js`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/hooks/useFrigg.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/hooks/useSocket.jsx`

### User Selection & Login
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaUserSelection.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/admin/UserManagement.jsx`

### Testing Zone & Integration Testing
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestingZone.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaContainer.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaWelcome.jsx`

### Admin View
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/admin/AdminViewContainer.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/admin/GlobalEntityManagement.jsx`

### Repositories & Services
- `/home/user/frigg/packages/devtools/management-ui/src/infrastructure/adapters/AdminRepositoryAdapter.js`
- `/home/user/frigg/packages/devtools/management-ui/src/application/services/AdminService.js`
- `/home/user/frigg/packages/devtools/management-ui/src/infrastructure/adapters/UserRepositoryAdapter.js`

### Definitions Zone
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/DefinitionsZone.jsx`

### Main App Structure
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/App.jsx`
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/layout/AppRouter.jsx`

---

## By Issue Type

### AUTHENTICATION ISSUES
**Files to Fix:**
1. `/home/user/frigg/packages/devtools/management-ui/src/infrastructure/http/api-client.js` - Add token interceptor
2. `/home/user/frigg/packages/devtools/management-ui/src/presentation/hooks/useFrigg.jsx` - Token persistence
3. `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaUserSelection.jsx` - OAuth support

### ENTITY LOADING ISSUES
**Files to Fix:**
1. `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestingZone.jsx` - Add entity load
2. `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaContainer.jsx` - Pass entity context

### STATE MANAGEMENT ISSUES
**Files to Fix:**
1. `/home/user/frigg/packages/devtools/management-ui/src/presentation/hooks/useFrigg.jsx` - Centralize state
2. `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestingZone.jsx` - Single source of truth

### CONFIGURATION ISSUES
**Files to Fix:**
1. `/home/user/frigg/packages/devtools/management-ui/src/presentation/hooks/useSocket.jsx` - Configurable socket URL

---

## Critical Code Sections

### 1. Token Injection (30 min fix)
**File:** `/home/user/frigg/packages/devtools/management-ui/src/infrastructure/http/api-client.js`
**Lines:** 10-18
**Current Code:** Empty interceptor
**Action:** Implement Authorization header injection

### 2. Entity Loading (2 hour fix)
**Files:** 
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestingZone.jsx` (lines 168-198)
- `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaContainer.jsx` (lines 406-416)
**Action:** Add entity fetch and pass to IntegrationHub

### 3. OAuth Support (4 hour fix)
**File:** `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaUserSelection.jsx`
**Action:** Implement OAuth initiation and callback handling

### 4. Token Persistence (1 hour fix)
**File:** `/home/user/frigg/packages/devtools/management-ui/src/presentation/components/zones/TestAreaUserSelection.jsx` (lines 124-127)
**Action:** Store token in localStorage with TTL

---

## Testing Points

**After each fix, test:**

### Basic Auth
- [ ] Load Management UI → Select repository
- [ ] Frigg starts → User selection appears
- [ ] Select user → Token obtained
- [ ] Refresh page → Session persists (after fix 4)
- [ ] Logout → Session cleared

### Integration Testing
- [ ] User selected → Entities list appears (after fix 2)
- [ ] Entity visible → Test button available
- [ ] Click test → Action executes (with Frigg support)
- [ ] See results → Displayed in UI (with Frigg support)

### Admin Functions
- [ ] Admin view → Users list loads
- [ ] Create user → User appears in list
- [ ] Switch user → Token refreshed (after fix 1)
- [ ] Global entities → Test connection works (after fix 1)

### Real-Time
- [ ] WebSocket logs → Appear in real-time
- [ ] Integration logs → Filter by integration (future)
- [ ] User action logs → Correlation ID tracked (future)

---

## Key Insights

1. **Test Area is View-Only Right Now**
   - Can see integrations
   - Cannot see entities
   - Cannot execute actions
   - Cannot see results

2. **Authentication is Partial**
   - User selection works
   - Token obtained
   - But token not used in API calls
   - And token lost on refresh

3. **State Management is Scattered**
   - useFrigg.jsx has some state
   - TestingZone.jsx has other state
   - localStorage has session state
   - No single source of truth

4. **OAuth is Missing Entirely**
   - Only supports impersonation
   - No OAuth flows
   - No multi-step auth
   - No credential management

5. **Entity Context is Missing**
   - No entity list loading
   - No entity passing to IntegrationHub
   - No entity caching
   - No entity filtering

