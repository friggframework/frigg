# Installation Wizard Implementation

## Overview

The installation wizard has been successfully refactored to provide a comprehensive, guided flow for installing integrations. The new implementation follows DDD and hexagonal architecture patterns.

## What Changed

### Before
- Clicking "Install" on an integration card would directly call `/api/authorize`
- No entity selection or management flow
- Limited to OAuth or basic auth without proper UI flow

### After
- Clicking "Install" opens the **Installation Wizard Modal**
- Guided multi-step flow:
  1. **Entity Selection**: Choose which accounts (entities) to use
  2. **Entity Connection**: If missing entities, connect new ones via OAuth or form-based auth
  3. **Authorization**: Handle OAuth redirects or JSON schema forms for credentials
  4. **Installation**: Create the integration with selected entities

## Architecture

### Hexagonal/DDD Layers

```
presentation/
├── components/
│   ├── InstallationWizardModal.jsx (NEW)
│   ├── EntityConnectionModal.jsx (UPDATED - JSON schema support)
│   ├── EntitySelector.jsx (existing)
│   └── EntityCard.jsx (existing)
└── flows/
    ├── IntegrationInstallFlow.jsx (existing)
    └── EntitySelectionFlow.jsx (existing)

application/
├── services/
│   ├── IntegrationService.js (existing)
│   └── EntityService.js (existing)
└── use-cases/
    ├── InstallIntegrationUseCase.js (existing)
    ├── SelectEntitiesUseCase.js (existing)
    └── ConnectEntityUseCase.js (existing)

domain/
├── Integration.js (existing)
├── Entity.js (existing)
└── IntegrationOption.js (existing)

infrastructure/
└── adapters/
    ├── IntegrationRepositoryAdapter.js (NEW)
    └── EntityRepositoryAdapter.js (NEW)
```

## Key Components

### InstallationWizardModal
**Location**: `packages/ui/lib/integration/presentation/components/InstallationWizardModal.jsx`

Main orchestrator that:
- Initializes services and use cases
- Manages wizard state (entity selection → connection → installation)
- Handles navigation between steps
- Triggers refresh on completion

**Props**:
- `isOpen`: boolean - Control modal visibility
- `onClose`: function - Close callback
- `integrationType`: string - Type of integration to install
- `integrationDisplayName`: string - Display name
- `friggBaseUrl`: string - API base URL
- `authToken`: string - JWT token
- `onSuccess`: function - Success callback with installed integration

### EntityConnectionModal
**Location**: `packages/ui/lib/integration/presentation/components/EntityConnectionModal.jsx`

Updated to support:
- **OAuth flows**: Redirect to provider authorization URL
- **Form-based auth**: Render JSON schema forms for credentials
- **Error handling**: Display connection errors
- **Loading states**: Show spinners during authorization

**Props**:
- `isOpen`: boolean - Control modal visibility
- `entityType`: string - Type of entity to connect
- `friggBaseUrl`: string - API base URL
- `authToken`: string - JWT token
- `onSuccess`: function - Success callback with created entity
- `onCancel`: function - Cancel callback

### useIntegrationLogic Hook
**Location**: `packages/ui/lib/integration/hooks/useIntegrationLogic.js`

Updated to:
- Add `isInstallWizardOpen` state
- Add `openInstallWizard()`, `closeInstallWizard()`, `handleInstallSuccess()` methods
- Make `getAuthorizeRequirements()` open wizard instead of direct authorization (backward compatible)

### IntegrationHorizontal Component
**Location**: `packages/ui/lib/integration/IntegrationHorizontal.jsx`

Updated to:
- Import and render `InstallationWizardModal`
- Wire up wizard open/close/success handlers
- Maintain backward compatibility with legacy modals

## Integration Flow

1. **User clicks "Install"** on integration card
2. **IntegrationHorizontalLayout** calls `getAuthorizeRequirements()` from `useIntegrationLogic`
3. **useIntegrationLogic** sets `isInstallWizardOpen = true`
4. **InstallationWizardModal** renders and:
   - Initializes `InstallIntegrationUseCase`, `SelectEntitiesUseCase`, `ConnectEntityUseCase`
   - Renders **IntegrationInstallFlow**
5. **IntegrationInstallFlow** manages wizard steps:
   - Shows **EntitySelectionFlow** first
   - If user needs to create entity, shows **EntityConnectionModal**
   - Once entities selected, calls `InstallIntegrationUseCase.execute()`
6. **On success**:
   - Wizard calls `onSuccess` callback
   - `useIntegrationLogic` refreshes integrations
   - Modal closes

## Entity Connection Sub-Flow

When user needs to connect a new entity:

1. **EntitySelectionFlow** detects missing required entity
2. Shows "Connect [Entity Type]" button
3. On click, renders **EntityConnectionModal**
4. **EntityConnectionModal**:
   - Calls `api.getAuthorizeRequirements(entityType)`
   - If OAuth: Shows "Connect with [Provider]" button → redirects to OAuth URL
   - If Form-based: Renders JSON schema form using `<Form>` component
5. **On submit** (form-based):
   - Calls `api.authorize(entityType, formData)`
   - Returns created entity
   - Calls `onSuccess(entity)`
6. **EntitySelectionFlow** refreshes and shows new entity in selection list

## Infrastructure Adapters

### IntegrationRepositoryAdapter
**Location**: `packages/ui/lib/integration/infrastructure/adapters/IntegrationRepositoryAdapter.js`

Implements:
- `getAvailableIntegrations()`: Fetch integration options
- `getInstalledIntegrations()`: Fetch user's integrations
- `isIntegrationInstalled(type)`: Check if type installed
- `createIntegration(type, entityIds, config)`: Install integration
- `updateIntegration(id, updates)`: Update integration
- `deleteIntegration(id)`: Remove integration

### EntityRepositoryAdapter
**Location**: `packages/ui/lib/integration/infrastructure/adapters/EntityRepositoryAdapter.js`

Implements:
- `getUserEntities()`: Fetch user's entities
- `getEntitiesByType()`: Fetch entities grouped by type
- `getAuthorizationRequirements(entityType)`: Get auth requirements
- `createEntityWithCredentials(entityType, credentials)`: Create via form auth
- `completeOAuthFlow(entityType, code, state)`: Create via OAuth

## Testing Checklist

- [ ] Install integration with OAuth entity (e.g., Salesforce)
- [ ] Install integration with form-based auth entity (e.g., Basic Auth)
- [ ] Install integration with multiple required entities
- [ ] Install integration when entities already exist (selection only)
- [ ] Install integration when entities need to be created
- [ ] Cancel wizard at each step
- [ ] Error handling for failed authorization
- [ ] Error handling for failed integration creation
- [ ] Refresh integration list after successful install
- [ ] Proper status updates on integration cards

## Files Modified

1. `packages/ui/lib/integration/hooks/useIntegrationLogic.js` - Added wizard state
2. `packages/ui/lib/integration/IntegrationHorizontal.jsx` - Added wizard modal
3. `packages/ui/lib/integration/presentation/components/EntityConnectionModal.jsx` - JSON schema support
4. `packages/ui/lib/integration/presentation/index.js` - Export new components
5. `packages/ui/lib/integration/infrastructure/index.js` - Export new adapters

## Files Created

1. `packages/ui/lib/integration/presentation/components/InstallationWizardModal.jsx`
2. `packages/ui/lib/integration/infrastructure/adapters/IntegrationRepositoryAdapter.js`
3. `packages/ui/lib/integration/infrastructure/adapters/EntityRepositoryAdapter.js`

## Next Steps

### For Testing
1. Build the management UI or consuming app
2. Test with real Frigg backend
3. Verify OAuth flow with actual providers
4. Test form-based auth with various JSON schemas

### Future Enhancements
1. Add progress indicators in wizard
2. Add "Skip" option for optional entities
3. Add entity configuration step after creation
4. Support multi-account selection for same entity type
5. Add integration preview before final installation
6. Persist wizard state for OAuth redirects
7. Add integration installation templates/presets

## Notes

- Backward compatibility maintained with legacy `FormBasedAuthModal`
- All existing integration cards continue to work
- DDD architecture makes it easy to add new features
- Repository adapters abstract API implementation details
- Use cases encapsulate business logic
