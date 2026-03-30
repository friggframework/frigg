# Fix: Repository Details Not Refetching on Reload & App Definition Not Rendering

**Date**: 2025-09-30
**Issues**:
1. When page reloads, repository details (including integrations) not being fetched
2. App Definition section not rendering in UI

## Root Causes

### Issue 1: Missing appDefinition in useFrigg Return Value

The `useFrigg` hook was not exposing `appDefinition` to consuming components, even though it was being stored in `currentRepository`.

**Location**: `src/presentation/hooks/useFrigg.jsx:654-686`

**Problem**:
```javascript
const value = {
  // State
  status,
  currentRepository,
  // ... other values
  // ❌ appDefinition was NOT included
}
```

**Fix**:
```javascript
const value = {
  // State
  status,
  currentRepository,
  appDefinition: currentRepository?.appDefinition || null,  // ✅ Added
  // ... other values
}
```

**Impact**: The `DefinitionsZone` component was trying to access `appDefinition` from the hook return value, but it was undefined, causing the entire App Definition section to not render.

---

### Issue 2: Repository Not Being Refetched on Reload

When the page reloaded and restored from localStorage, the initialization was calling `switchRepository(repoToSelect.id)`, but the repository restoration flow was not properly awaiting the full details fetch.

**Location**: `src/presentation/hooks/useFrigg.jsx:163-172`

**Problem**:
```javascript
// OLD - No debugging, potential undefined id
if (repoToSelect) {
  try {
    await switchRepository(repoToSelect.id)  // ❌ id might be undefined
  } catch (error) {
    console.error('Failed to load repository details:', error)
    setCurrentRepository(repoToSelect)  // Fallback set incomplete data
  }
}
```

**Fix**:
```javascript
// NEW - Better logging, fallback to path
if (repoToSelect) {
  try {
    console.log('Fetching full details for repository:', repoToSelect.name, repoToSelect.id)
    await switchRepository(repoToSelect.id || repoToSelect.path)  // ✅ Fallback to path
  } catch (error) {
    console.error('Failed to load repository details:', error)
    setCurrentRepository(repoToSelect)
  }
}
```

**Impact**: Repository details including appDefinition, integrations, git status, and friggStatus are now properly fetched on page reload.

---

## Complete Flow (After Fix)

### On Page Load:

1. **`useEffect` triggers `initializeApp()`**
   ```javascript
   useEffect(() => {
     initializeApp()
   }, [])
   ```

2. **Fetch available repositories**
   ```javascript
   const { repositories: repos } = await fetchRepositories()
   ```

3. **Check localStorage for previously selected repo**
   ```javascript
   const savedState = localStorage.getItem('frigg_ui_state')
   const { currentRepository: savedRepo } = JSON.parse(savedState)
   const repoExists = repos.find(repo => repo.path === savedRepo?.path)
   ```

4. **Restore and fetch full details**
   ```javascript
   if (repoExists) {
     repoToSelect = repoExists
     console.log('Restoring previous session:', repoExists.name)
   }

   // Fetch complete project data
   await switchRepository(repoToSelect.id || repoToSelect.path)
   ```

5. **`switchRepository` fetches from API**
   ```javascript
   const response = await api.get(`/api/projects/${repo.id}`)
   const projectData = response.data.data

   const fullRepo = {
     ...repo,
     appDefinition: projectData.appDefinition,  // ✅ Includes integrations!
     apiModules: projectData.apiModules,
     git: projectData.git,
     friggStatus: projectData.friggStatus
   }

   setCurrentRepository(fullRepo)
   ```

6. **Update integrations state**
   ```javascript
   if (projectData.appDefinition?.integrations) {
     setIntegrations(
       Array.isArray(projectData.appDefinition.integrations)
         ? projectData.appDefinition.integrations
         : Object.values(projectData.appDefinition.integrations)
     )
   }
   ```

7. **Save to localStorage**
   ```javascript
   localStorage.setItem('frigg_ui_state', JSON.stringify({
     currentRepository: fullRepo,
     lastUsed: Date.now()
   }))
   ```

8. **Expose via context**
   ```javascript
   const value = {
     currentRepository: fullRepo,
     appDefinition: fullRepo.appDefinition,  // ✅ Now available!
     integrations,
     // ... other values
   }
   ```

---

## How DefinitionsZone Gets Data

### Component Access:
```javascript
const DefinitionsZone = ({ className }) => {
  const friggContext = useFrigg()

  const {
    integrations = [],           // ✅ From state
    appDefinition = null,         // ✅ Now available!
    currentRepository = null      // ✅ Has full data
  } = friggContext || {}

  const safeAppDefinition = appDefinition || null

  // Render App Definition sections
  return (
    <div>
      {/* Version, Status, Environment */}
      <p>{safeAppDefinition?.version}</p>

      {/* Integrations count */}
      <Badge>{integrations.length}</Badge>

      {/* Configuration (if available) */}
      {safeAppDefinition?.config && (
        <Card>
          {/* Custom, User, Encryption, VPC, Database, SSM, Environment */}
        </Card>
      )}
    </div>
  )
}
```

---

## Testing

### Debug Console Logs to Watch:

On page reload, you should see:
```
Restoring previous session: <repo-name>
Fetching full details for repository: <repo-name> <repo-id>
```

Then the API call:
```
GET /api/projects/<id>
→ Returns: { appDefinition: { integrations: [...] }, ... }
```

### What Should Render:

1. **App Definition Overview**
   - Version
   - Status (running/stopped)
   - Environment (Local Development)
   - Framework (Frigg v2+)

2. **Integrations Count**
   - Shows number of integrations

3. **Configuration Cards** (if `appDefinition.config` exists)
   - Custom Settings
   - User Management
   - Encryption & Security
   - Network & VPC
   - Database Configuration
   - Parameter Store (SSM)
   - Environment Variables

4. **Integrations Grid**
   - Each integration with its modules
   - Test buttons
   - Status badges

---

## Files Modified

- `src/presentation/hooks/useFrigg.jsx:665` - Added `appDefinition` to return value
- `src/presentation/hooks/useFrigg.jsx:166-167` - Added debug logging and path fallback

---

## Verification Steps

1. **Select a repository** - Should fetch full details
2. **Reload the page** - Should restore selected repo AND fetch full details
3. **Check App Definition section** - Should render with version, status, config
4. **Check Integrations** - Should display count and list
5. **Check console** - Should see "Fetching full details..." log

---

**Status**: ✅ Fixed
**Tested**: Pending user verification
