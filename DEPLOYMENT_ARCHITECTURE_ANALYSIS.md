# Frigg Deployment Architecture Analysis

## Executive Summary

**Question**: Should you deploy 3 separate Frigg instances for different integration scenarios, or can a unified deployment with global entities and integration types work?

**Answer**: You need **2 deployments minimum** for your scenario.

| App | Users | Frigg Deployment |
|-----|-------|------------------|
| **app.lefthook.com** (Customer Portal) | Customers (external) | **Deployment A** |
| Platform integrations (Twilio, SendGrid) | N/A - global entities | **Deployment A** (same) |
| **admin.lefthook.com** (Employee Intranet) | LH Employees (internal) | **Deployment B** |

**Why?** Frigg is a single-database-per-deployment framework. When your apps have **different user tables**, you need separate Frigg deployments. The customer portal and employee intranet cannot share a single Frigg instance because users in each system are fundamentally different entities.

---

## The Key Architecture Constraint

### Frigg = One Database = One User Table

```
┌─────────────────────────────────────────────────────────────────┐
│                    Single Frigg Deployment                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Database                                                       │
│   ├── User table (ONE)                                          │
│   │   └── All users in this deployment                          │
│   ├── Credential table                                          │
│   │   └── Foreign key to User                                   │
│   ├── Entity table                                              │
│   │   └── Foreign key to User (or null for global)              │
│   └── Integration table                                         │
│       └── Foreign key to User                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implication**: If your customer portal and employee intranet have separate user databases, they **cannot** share a Frigg deployment.

---

## Your Actual Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEFT HOOK INFRASTRUCTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   app.lefthook.com (Customer Portal)                            │
│   ├── User Table: Customers                                     │
│   ├── Use Case: Native integrations for customers               │
│   └── Example: Customer connects HubSpot, Salesforce            │
│                                                                  │
│   Platform Services (Twilio, SendGrid, etc.)                    │
│   ├── No user context - service accounts                        │
│   └── Used BY customer portal as features                       │
│                                                                  │
│   admin.lefthook.com (Employee Intranet)                        │
│   ├── User Table: LH Employees (DIFFERENT from customers)       │
│   ├── Use Case: Internal team integrations                      │
│   └── Example: Employee sets up Zendesk + Slack automation      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Recommended: Two-Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│               FRIGG DEPLOYMENT A: Customer Portal                │
│                    (app.lefthook.com)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Database A                                                     │
│   ├── User table: Customers                                     │
│   ├── Credentials: Customer OAuth tokens                        │
│   ├── Entities: Customer accounts + Global entities             │
│   └── Integrations: Customer integrations                       │
│                                                                  │
│   APIs:                                                          │
│   ├── /api/v2/*          Customer-facing integration API        │
│   └── /api/admin/*       Your team manages global entities      │
│                                                                  │
│   Global Entities (isGlobal: true):                             │
│   ├── Twilio (Company's SMS account)                            │
│   ├── SendGrid (Company's email)                                │
│   └── OpenAI (Company's API key for features)                   │
│                                                                  │
│   UI: Customer Integration Manager                               │
│   └── Uses /api/v2/* with customer JWT                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              FRIGG DEPLOYMENT B: Employee Intranet               │
│                   (admin.lefthook.com)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Database B (SEPARATE)                                          │
│   ├── User table: LH Employees                                  │
│   ├── Credentials: Employee OAuth tokens                        │
│   ├── Entities: Employee-owned accounts                         │
│   └── Integrations: Internal team integrations                  │
│                                                                  │
│   APIs:                                                          │
│   ├── /api/v2/*          Employee integration API               │
│   └── /api/admin/*       IT/Admin manages global entities       │
│                                                                  │
│   Global Entities (optional):                                    │
│   ├── Company Zendesk (shared support platform)                 │
│   ├── Company Slack (shared workspace)                          │
│   └── Internal APIs (shared service accounts)                   │
│                                                                  │
│   UI: Employee Integration Manager                               │
│   └── Uses /api/v2/* with employee JWT                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Not 3 Deployments?

The original question asked about 3 scenarios:

1. External integrations for product's end users
2. Internal product integrations (Twilio/SendGrid)
3. Company internal automations

**Scenarios 1 and 2 collapse into one deployment** because:

- Platform integrations (Twilio, SendGrid) are **global entities** in the customer deployment
- They have no user context - they're service accounts managed by admins
- They're consumed by integrations in the customer portal

```javascript
// In Deployment A: Customer portal integration using global entity
static Definition = {
    name: 'customer-sms-notifications',
    entities: {
        customerAccount: {
            type: 'your-platform',
            global: false,        // Customer connects their own
            required: true
        },
        smsService: {
            type: 'twilio-api',
            global: true,         // YOUR Twilio (auto-included)
            required: true
        }
    }
};
```

**Scenario 3 requires separate deployment** because:

- Employees are a completely different user population
- Different user table, different identity provider
- Employees need their own credential/entity ownership

---

## Code Sharing: One Codebase, Two Deployments

Although you need 2 deployments, you can share code:

```
frigg-monorepo/
├── packages/
│   ├── api-modules/                    # SHARED: API modules
│   │   ├── twilio/
│   │   ├── hubspot/
│   │   ├── salesforce/
│   │   └── zendesk/
│   │
│   ├── integrations-customer/           # Deployment A specific
│   │   ├── hubspot-sync/
│   │   └── sms-notifications/           # Uses global Twilio
│   │
│   ├── integrations-internal/           # Deployment B specific
│   │   ├── zendesk-slack/
│   │   └── customer-success-workflow/
│   │
│   ├── app-customer/                    # Deployment A entry point
│   │   └── frigg.config.js
│   │
│   └── app-internal/                    # Deployment B entry point
│       └── frigg.config.js
```

**Key Point**: API modules (HubSpot, Twilio, etc.) are npm packages that can be installed in both deployments. You don't duplicate module code.

---

## v2 Router Branch Capabilities (Both Deployments)

The `feature/integration-router-v2-drop-modules-router` branch provides everything needed for both deployments:

| Feature | Status | Purpose |
|---------|--------|---------|
| v2 API routes (`/api/v2/*`) | ✅ | User-facing integration API |
| Admin router (`/api/admin/*`) | ✅ | Global entity & user management |
| Global entities (`isGlobal` flag) | ✅ | Shared service accounts |
| User impersonation | ✅ | Support/debugging |
| Multi-step authorization | ✅ | Complex OAuth flows |
| Proxy endpoints for MCP | ✅ | AI tool calling |

---

## Deployment A: Customer Portal Details

### Global Entities for Platform Features

```bash
# Admin creates global Twilio entity via API
curl -X POST https://frigg-customer.lefthook.com/api/admin/entities \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "twilio-api",
    "name": "LH Platform SMS",
    "credentials": {
      "account_sid": "AC...",
      "auth_token": "..."
    }
  }'
```

### Customer Integrations Auto-Include Global Entities

When a customer creates an integration that needs SMS:

1. Integration Definition has `global: true` for SMS entity
2. Frigg automatically includes the global Twilio entity
3. Customer never sees Twilio credentials
4. SMS appears as a "feature" not an "integration"

### UI Context

```jsx
// Customer portal UI - uses user JWT, sees only their integrations
const api = new FriggAPI(baseUrl, customerJWT);
const integrations = await api.listIntegrations();
// Returns only this customer's integrations
```

---

## Deployment B: Employee Intranet Details

### Independent User Management

```javascript
// Deployment B has its own users table
// Employees authenticate via your SSO/identity provider
// JWTs issued by your auth system, validated by Frigg
```

### Employee-Owned Entities

Unlike Deployment A where customers connect external accounts, Deployment B might have more global entities (shared company accounts) with employees creating integrations between them:

```javascript
// Employee creates automation connecting company Zendesk to Slack
static Definition = {
    name: 'ticket-to-slack',
    entities: {
        zendesk: {
            type: 'zendesk-api',
            global: true,         // Company's Zendesk (shared)
            required: true
        },
        slack: {
            type: 'slack-api',
            global: false,        // Employee's own Slack (or global)
            required: true
        }
    }
};
```

---

## What About Multi-Tenancy in the Future?

If you wanted a single Frigg deployment serving multiple user populations, you'd need to add:

1. **Tenant/Realm field** on all models (User, Credential, Entity, Integration)
2. **Tenant-aware queries** in all repositories
3. **Tenant isolation middleware** to scope all requests
4. **Cross-tenant global entities** concept

This is a significant architectural change and may not be worth the complexity for 2 deployments.

---

## Summary: Final Recommendations

### Immediate Actions

1. **Deploy Frigg twice** - once for customer portal, once for employee intranet
2. **Share API modules** via npm packages between deployments
3. **Use global entities** in customer deployment for platform services
4. **Use v2 router branch** for both deployments

### Architecture Clarity

| Concern | Resolution |
|---------|------------|
| Different user tables | Separate deployments |
| Platform services (Twilio) | Global entities in Deployment A |
| Shared API module code | npm packages, single source |
| Admin management UI | `/api/admin/*` in each deployment |

### Not Needed

- Multi-tenancy in Frigg core (unnecessary complexity for 2 deployments)
- `ownershipType` field on entities (v2's `isGlobal` boolean is sufficient)
- Scope/visibility field on integrations (UI can filter client-side if needed)

---

## References

- Branch: `feature/integration-router-v2-drop-modules-router`
- Admin Router: `packages/core/handlers/routers/admin.js`
- Integration Router (v2): `packages/core/integrations/integration-router.js`
- Global Entities Guide: `docs/guides/GLOBAL-ENTITIES-GUIDE.md`
- Create Integration Use Case: `packages/core/integrations/use-cases/create-integration.js`
- UI API Client (v2): `packages/ui/lib/api/api.js`
