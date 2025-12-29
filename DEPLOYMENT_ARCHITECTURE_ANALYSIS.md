# Frigg Deployment Architecture Analysis

## Executive Summary

**Question**: Should you deploy 3 separate Frigg instances for different integration scenarios, or can a unified deployment with global entities and integration types work?

**Updated Answer (v2 Branch)**: The `feature/integration-router-v2-drop-modules-router` branch already provides most of what's needed for a unified deployment. Global entities, admin API, and dual-UI patterns are implemented.

---

## v2 Router Branch: Current Capabilities

### What Already Exists in v2

| Feature | Status | Location |
|---------|--------|----------|
| v2 API routes (`/api/v2/*`) | ✅ Complete | `integration-router.js` |
| Admin router (`/api/admin/*`) | ✅ Complete | `handlers/routers/admin.js` |
| Global entities (`isGlobal` flag) | ✅ Complete | Entity model + admin endpoints |
| User impersonation | ✅ Complete | `POST /api/admin/users/:id/impersonate` |
| Multi-step authorization | ✅ Complete | Authorization flow |
| Credential management | ✅ Complete | `/api/credentials/*` |
| Proxy endpoints for MCP | ✅ Complete | `/api/entities/:id/proxy` |
| UI v2 API client | ✅ Complete | `packages/ui/lib/api/api.js` |

### Global Entities Implementation

Global entities use `isGlobal: true` flag (not an ownership type):

```javascript
// Entity model (Prisma)
model Entity {
  id           String   @id
  userId       String?  // NULL for global entities
  moduleName   String?
  isGlobal     Boolean  @default(false)  // KEY: marks as global
  credentialId String?
}

// Integration Definition - declare global entity requirement
static Definition = {
    entities: {
        sharedSms: {
            type: 'twilio-api',
            global: true,      // Auto-included from global entities
            required: true     // Fail if not found
        }
    }
};

// CreateIntegration use case auto-includes global entities
if (entityConfig.global === true) {
    const globalEntity = await moduleRepository.findEntity({
        moduleName: entityConfig.type,
        isGlobal: true,
    });
    if (globalEntity?.credential?.authIsValid) {
        allEntities.push(globalEntity.id);
    }
}
```

---

## Your 3 Deployment Scenarios: How They Map to v2

| Your Scenario | v2 Pattern | Global Entities | User Context |
|--------------|------------|-----------------|--------------|
| External integrations (customers) | User entities | No | `OrganizationUser` + `IndividualUser` |
| Platform integrations (Twilio/SendGrid) | Global entities | Yes | Admin creates, users auto-inherit |
| Internal automations | All global entities | Yes | Internal users/service accounts |

---

## Gap Analysis: Dual-UI Architecture (Admin + Customer)

### What v2 Already Provides

**Admin API** (`/api/admin/*`) - Protected by `requireAdmin` middleware:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/users` | List all users with pagination |
| `POST /api/admin/users` | Create users (admin-specific features) |
| `GET /api/admin/users/:id` | Get specific user |
| `POST /api/admin/users/:id/impersonate` | Generate token for user impersonation |
| `DELETE /api/admin/users/:id` | Delete user |
| `GET /api/admin/entities` | List all global entities |
| `POST /api/admin/entities` | Create global entity |
| `PUT /api/admin/entities/:id` | Update global entity |
| `DELETE /api/admin/entities/:id` | Delete global entity |
| `POST /api/admin/entities/:id/test` | Test global entity connection |

**User API** (`/api/v2/*`) - Normal user endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v2/integrations` | User's integrations only |
| `GET /api/v2/entities` | User's entities only |
| `GET /api/v2/credentials` | User's credentials only |
| All CRUD operations | Scoped to authenticated user |

### Remaining Gaps for Dual-UI

| Gap | Current State | Needed For | Priority |
|-----|---------------|------------|----------|
| Scope/visibility on integrations | ❌ Not present | Filter integrations by public/platform/internal | Medium |
| Integration options filtering | ❌ All returned | Show only relevant integrations per UI context | Medium |
| Audit logging | ❌ Not present | Track admin actions | Low |
| Rate limiting per scope | ❌ Not present | Noisy neighbor protection | Low |

---

## Recommended Architecture: Dual-UI with v2

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frigg Application (Unified)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │   Admin Dashboard    │    │   Customer Portal    │           │
│  │   (Your Internal)    │    │   (End User Facing)  │           │
│  └──────────┬───────────┘    └──────────┬───────────┘           │
│             │                           │                        │
│  ┌──────────▼───────────┐    ┌──────────▼───────────┐           │
│  │  /api/admin/*        │    │  /api/v2/*           │           │
│  │  - requireAdmin      │    │  - User auth         │           │
│  │  - Global entities   │    │  - User entities     │           │
│  │  - User management   │    │  - User integrations │           │
│  │  - Impersonation     │    │                      │           │
│  └──────────────────────┘    └──────────────────────┘           │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Entity Layer                            │  │
│  │                                                            │  │
│  │   User Entities          │     Global Entities             │  │
│  │   (userId = user-id)     │     (isGlobal = true)          │  │
│  │   - Per-user accounts    │     - Platform services         │  │
│  │   - OAuth per user       │     - Admin-managed             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### UI Embedding Patterns

**Admin Dashboard:**
```jsx
// Admin view - uses admin API with admin API key
const adminApi = new AdminAPI(baseUrl, adminApiKey);

// Global entity management
const globalEntities = await adminApi.listGlobalEntities();

// User management
const users = await adminApi.listUsers();

// Impersonate user for debugging
const userToken = await adminApi.impersonateUser(userId);
```

**Customer Portal:**
```jsx
// Customer view - uses v2 API with user JWT
const userApi = new API(baseUrl, userJWT);

// Only see user's own integrations
const myIntegrations = await userApi.listIntegrations();

// Connect accounts (user entities, not global)
const authReqs = await userApi.getAuthorizationRequirements('hubspot');
```

---

## Platform Integrations: Where They Fit

Platform integrations (Twilio, SendGrid) are **global entities** managed via Admin Dashboard:

```
Admin Dashboard
├── Users                          ← /api/admin/users
│   └── List, create, impersonate
├── Global Entities                ← /api/admin/entities
│   ├── Twilio (Platform SMS)
│   ├── SendGrid (Platform Email)
│   └── Stripe (Platform Payments)
└── Customer Integrations          ← View via admin
    └── Support/debugging view
```

**How Platform Integrations Work:**

1. Admin creates global entity via `/api/admin/entities`
2. Integration Definition marks entity as `global: true`
3. When user creates integration, framework auto-includes global entity
4. User never sees/manages global entity credentials

```javascript
// Integration that uses global + user entities
static Definition = {
    name: 'sms-notifications',
    entities: {
        userAccount: {
            type: 'your-platform',
            global: false,        // User connects their account
            required: true
        },
        smsService: {
            type: 'twilio-api',
            global: true,         // Admin's Twilio (auto-included)
            required: true
        }
    }
};
```

---

## Remaining Work for Full Dual-UI Support

### Optional: Add Scope Field (Medium Priority)

To filter which integrations appear in which UI context:

```javascript
// Add to IntegrationBase.Config
static Config = {
    name: 'Integration Name',
    scope: 'public',  // 'public' | 'platform' | 'internal'
    // ...
}

// Filter in GetPossibleIntegrations use case
getPossibleIntegrations(scope = null) {
    return this.integrationClasses
        .filter(cls => !scope || cls.Config.scope === scope)
        .map(cls => cls.Options.get());
}
```

### Optional: Scope Query Parameter (Low Priority)

Add scope filtering to integration options endpoint:

```javascript
// GET /api/v2/integrations/options?scope=public
router.route('/api/v2/integrations/options').get(async (req, res) => {
    const { scope } = req.query;
    const options = await getPossibleIntegrations.execute(scope);
    res.json({ integrations: options });
});
```

---

## Conclusion: Do We Still Need 3 Deployments?

**No.** The v2 router branch provides:

1. ✅ **Admin API** for internal management (`/api/admin/*`)
2. ✅ **User API** for customer-facing integrations (`/api/v2/*`)
3. ✅ **Global entities** for platform services (Twilio, SendGrid)
4. ✅ **User impersonation** for debugging
5. ✅ **Separate auth middleware** (admin vs user)

**What you need to do:**

1. Deploy on `feature/integration-router-v2-drop-modules-router` branch (or merge to main)
2. Build Admin Dashboard UI using `/api/admin/*` endpoints
3. Build Customer Portal UI using `/api/v2/*` endpoints
4. Create global entities for platform services via admin API
5. Define integrations with `global: true` for platform entity requirements

**Optional enhancements:**

1. Add `scope` field to integration Config for UI filtering
2. Add audit logging for admin actions
3. Add rate limiting per scope

---

## References

- Branch: `feature/integration-router-v2-drop-modules-router`
- Admin Router: `packages/core/handlers/routers/admin.js`
- Integration Router (v2): `packages/core/integrations/integration-router.js`
- Global Entities Guide: `docs/guides/GLOBAL-ENTITIES-GUIDE.md`
- Global Entities ADR: `docs/architecture/ADR-GLOBAL-ENTITIES.md`
- UI API Client (v2): `packages/ui/lib/api/api.js`
- Create Integration Use Case: `packages/core/integrations/use-cases/create-integration.js`
- Module Repository: `packages/core/modules/repositories/module-repository.js`
