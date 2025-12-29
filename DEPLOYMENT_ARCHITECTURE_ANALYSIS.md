# Frigg Deployment Architecture Analysis

## Executive Summary

**Question**: Should you deploy 3 separate Frigg instances for different integration scenarios, or can a unified deployment with global entities and integration types work?

**Answer**: It depends on your user architecture.

| Scenario | Deployments | Approach |
|----------|-------------|----------|
| Separate user tables (current) | 2 | Customer portal + Employee intranet |
| Namespaced user IDs | 1 | Unified with Capability Context |

**Recommendation**: Add **Capability Context** to Frigg core. This enables:
- Single deployment with namespaced user IDs (if desired)
- Integration visibility control (beta releases, premium tiers)
- Feature flag integration out of the box
- RBAC-ready architecture

---

## Option A: Two Deployments (Separate User Tables)

If `app.lefthook.com` and `admin.lefthook.com` maintain completely separate user databases:

```
┌─────────────────────────────────────────────────────────────────┐
│               FRIGG DEPLOYMENT A: Customer Portal                │
├─────────────────────────────────────────────────────────────────┤
│   Database A: Customers                                          │
│   Global Entities: Twilio, SendGrid (platform services)         │
│   APIs: /api/v2/* (customers), /api/admin/* (your team)         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              FRIGG DEPLOYMENT B: Employee Intranet               │
├─────────────────────────────────────────────────────────────────┤
│   Database B: LH Employees (SEPARATE)                            │
│   Global Entities: Company Zendesk, Slack, internal APIs        │
│   APIs: /api/v2/* (employees), /api/admin/* (IT team)           │
└─────────────────────────────────────────────────────────────────┘
```

**Why 2 not 3?** Platform integrations (Twilio, SendGrid) are global entities in Deployment A, not a separate deployment.

---

## Option B: Unified Deployment (Namespaced User IDs)

If you namespace user IDs to avoid collisions, a single deployment works:

```javascript
// Customer portal issues tokens with:
{ appUserId: "customer:u_12345", appOrgId: "customer:org_abc" }

// Employee intranet issues tokens with:
{ appUserId: "employee:e_67890", appOrgId: "employee:team_xyz" }
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED FRIGG DEPLOYMENT                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Single Database                                                │
│   ├── Users: customer:*, employee:*, partner:*, ...             │
│   ├── Global Entities: Shared across all audiences              │
│   └── Integrations: Filtered by Capability Context              │
│                                                                  │
│   Both apps hit same Frigg backend                               │
│   └── Capability Context controls what each user sees           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**This requires**: Capability Context in Frigg core (proposed below).

---

## Proposed Frigg Enhancement: Capability Context

### Why This Matters Beyond Multi-Audience

Even for a single customer-facing deployment, Capability Context enables:

| Use Case | Example |
|----------|---------|
| **Beta releases** | New HubSpot integration visible only to beta users |
| **Premium tiers** | Salesforce integration requires `plan: premium` |
| **Feature flags** | Roll out Slack integration to 10% of users |
| **Gradual rollout** | Enable integration for specific organizations first |
| **Partner access** | Partners see different integrations than customers |

### The Pattern

A unified context object that serves three purposes:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPABILITY CONTEXT                           │
│  { userId, roles, scopes, attributes }                          │
├─────────────────────────────────────────────────────────────────┤
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    RBAC     │  │  Visibility │  │Feature Flags│             │
│  │             │  │   Filter    │  │             │             │
│  │ roles →     │  │ requires →  │  │ attributes →│             │
│  │ permissions │  │ show/hide   │  │ flag eval   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  Same context works for all three concerns                       │
└─────────────────────────────────────────────────────────────────┘
```

### Integration Definition with `requires`

```javascript
class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot-sync',

        // NEW: Visibility requirements
        requires: {
            // Audience-based (for multi-app scenarios)
            audience: ['customer', 'partner'],

            // Scope-based (for RBAC)
            scopes: ['integrations:hubspot'],

            // Feature flag (for gradual rollout)
            featureFlag: 'hubspot-integration-enabled',

            // Attribute-based (for premium tiers)
            attributes: { plan: ['premium', 'enterprise'] },

            // Custom predicate (for complex logic)
            predicate: (ctx) => ctx.attributes.organization_size > 100
        },

        entities: {
            hubspot: { type: 'hubspot-api', global: false, required: true }
        }
    };
}
```

### Core Implementation

```javascript
// packages/core/integrations/capability-context.js

class CapabilityContext {
    constructor({ userId, roles = [], scopes = [], attributes = {} }) {
        this.userId = userId;
        this.roles = roles;
        this.scopes = scopes;
        this.attributes = attributes;
    }

    // Scope checking with wildcard support
    hasScope(scope) {
        return this.scopes.some(s =>
            s === scope ||
            (s.endsWith(':*') && scope.startsWith(s.slice(0, -1)))
        );
    }

    hasRole(role) {
        return this.roles.includes(role);
    }

    hasAudience(audiences) {
        if (!audiences || audiences.length === 0) return true;
        return audiences.includes(this.attributes.audience);
    }

    hasAttributes(required) {
        if (!required) return true;
        return Object.entries(required).every(([key, values]) => {
            const userValue = this.attributes[key];
            return Array.isArray(values)
                ? values.includes(userValue)
                : userValue === values;
        });
    }

    // For feature flag SDKs - matches LaunchDarkly/Unleash/Flagsmith context shape
    toFlagContext() {
        return {
            kind: 'user',
            key: this.userId,
            custom: {
                roles: this.roles,
                scopes: this.scopes,
                ...this.attributes
            }
        };
    }

    // Evaluate requires block from Integration Definition
    async meetsRequirements(requires, flagClient = null) {
        if (!requires) return true;

        // Audience check
        if (requires.audience && !this.hasAudience(requires.audience)) {
            return false;
        }

        // Scope check
        if (requires.scopes) {
            const hasAll = requires.scopes.every(s => this.hasScope(s));
            if (!hasAll) return false;
        }

        // Attribute check
        if (requires.attributes && !this.hasAttributes(requires.attributes)) {
            return false;
        }

        // Feature flag check (integrates with any flag SDK)
        if (requires.featureFlag && flagClient) {
            const enabled = await flagClient.isEnabled(
                requires.featureFlag,
                this.toFlagContext()
            );
            if (!enabled) return false;
        }

        // Custom predicate
        if (requires.predicate && !requires.predicate(this)) {
            return false;
        }

        return true;
    }

    // Factory method from JWT claims
    static fromToken(token) {
        const claims = decodeToken(token);
        return new CapabilityContext({
            userId: claims.appUserId,
            roles: claims.roles || [],
            scopes: claims.scopes || [],
            attributes: claims.attributes || {}
        });
    }
}

module.exports = { CapabilityContext };
```

### Router Integration

```javascript
// In createIntegrationRouter or middleware

async function enrichCapabilityContext(req, res, next) {
    try {
        req.capabilityContext = CapabilityContext.fromToken(req.token);
        next();
    } catch (e) {
        next(e);
    }
}

// Filter integration options by visibility
async function getVisibleIntegrations(ctx, integrationClasses, flagClient) {
    const visible = [];

    for (const IntegrationClass of integrationClasses) {
        const { requires } = IntegrationClass.Definition || {};

        if (await ctx.meetsRequirements(requires, flagClient)) {
            visible.push(IntegrationClass.Options.get());
        }
    }

    return visible;
}
```

### Feature Flag SDK Integration

```javascript
// Works with any feature flag provider

// LaunchDarkly
const ldClient = LaunchDarkly.init(process.env.LD_SDK_KEY);
const flagClient = {
    async isEnabled(flag, ctx) {
        return ldClient.variation(flag, ctx, false);
    }
};

// Unleash
const unleash = new Unleash({ url, appName, customHeaders });
const flagClient = {
    async isEnabled(flag, ctx) {
        return unleash.isEnabled(flag, { userId: ctx.key, properties: ctx.custom });
    }
};

// Flagsmith
const flagsmith = new Flagsmith({ environmentKey });
const flagClient = {
    async isEnabled(flag, ctx) {
        const flags = await flagsmith.getIdentityFlags(ctx.key, ctx.custom);
        return flags.isFeatureEnabled(flag);
    }
};

// Pass to router
createIntegrationRouter({ ..., flagClient });
```

---

## Real-World Examples

### Example 1: Beta Integration Rollout

```javascript
static Definition = {
    name: 'notion-sync',
    requires: {
        featureFlag: 'notion-integration-beta'  // LaunchDarkly controls rollout
    },
    entities: { ... }
};

// In LaunchDarkly: enable for 5% of users, then 25%, then 100%
```

### Example 2: Premium Tier Integration

```javascript
static Definition = {
    name: 'salesforce-enterprise',
    requires: {
        attributes: { plan: ['enterprise'] },
        scopes: ['integrations:salesforce']
    },
    entities: { ... }
};
```

### Example 3: Multi-Audience with Namespaced Users

```javascript
// Customer-only integration
static Definition = {
    name: 'hubspot-crm',
    requires: {
        audience: ['customer']
    },
    entities: { ... }
};

// Employee-only integration
static Definition = {
    name: 'zendesk-internal',
    requires: {
        audience: ['employee']
    },
    entities: { ... }
};

// Both can use
static Definition = {
    name: 'slack-notifications',
    requires: {
        audience: ['customer', 'employee']
    },
    entities: { ... }
};
```

### Example 4: Organization-Specific Early Access

```javascript
static Definition = {
    name: 'new-feature-integration',
    requires: {
        predicate: (ctx) =>
            ctx.attributes.organization_id === 'org_beta_partner' ||
            ctx.hasRole('beta_tester')
    },
    entities: { ... }
};
```

---

## Implementation Phases

### Phase 1: Core Capability Context
- Add `CapabilityContext` class to `packages/core`
- Add `requires` field to Integration Definition schema
- Add filtering to `getIntegrationOptions` endpoint

### Phase 2: Middleware Integration
- Add context enrichment middleware
- Support JWT claims for roles/scopes/attributes
- Document token structure requirements

### Phase 3: Feature Flag Support
- Add pluggable `flagClient` interface
- Provide examples for LaunchDarkly, Unleash, Flagsmith
- Add async evaluation in visibility filter

### Phase 4: Documentation & Examples
- Update Integration authoring guide
- Add visibility patterns cookbook
- Provide migration guide for existing integrations

---

## Decision Matrix: 1 vs 2 Deployments

| Factor | 2 Deployments | 1 Deployment + Capability Context |
|--------|---------------|-----------------------------------|
| **Separate user tables** | Required | Need to namespace IDs |
| **Separate auth systems** | Works naturally | Need unified token validation |
| **Isolation requirements** | Strong isolation | Logical isolation via context |
| **Infrastructure cost** | 2x databases, 2x deployments | Single deployment |
| **Shared global entities** | Separate per deployment | Truly shared |
| **Admin visibility** | Per-deployment admin | Unified admin view |
| **Integration code sharing** | Via npm packages | Same deployment |

---

## Summary

### For Your Immediate Needs (2+ Audiences)

**If keeping separate user tables**: Deploy twice, share API modules via npm.

**If willing to namespace user IDs**: Single deployment with Capability Context.

### For Frigg Core (Recommended Enhancement)

Add Capability Context regardless of deployment count. It enables:

1. **Beta releases** - Feature flag new integrations
2. **Premium tiers** - Gate integrations by plan
3. **Gradual rollout** - % rollout via feature flags
4. **Multi-audience** - Customer vs employee vs partner
5. **RBAC ready** - Scopes integrate with existing auth

This is valuable even for single-audience customer deployments.

---

## How to Load Capability Context

The host application controls user identity and permissions. Frigg needs a way to receive capability context. Three approaches, used in priority order:

### Option 1: JWT Claims (Recommended for Adopter JWT)

Host app embeds capabilities in JWT:

```javascript
// Host app mints JWT
const token = jwt.sign({
    sub: 'customer:u_12345',
    org_id: 'customer:org_abc',

    // Capability claims (standard names)
    roles: ['user', 'premium'],
    scopes: ['integrations:read', 'integrations:create'],

    // Custom attributes (namespaced under 'attributes' or flat)
    audience: 'customer',
    plan: 'premium',
    organization_size: 50
}, secret);
```

Frigg extracts in `GetUserFromAdopterJwt`:

```javascript
async execute(jwtToken) {
    const decoded = jwt.verify(jwtToken, this.jwtConfig.secret);
    const user = await this.findOrCreateUser(decoded);

    user.capabilityContext = new CapabilityContext({
        userId: user.getId(),
        roles: decoded.roles || [],
        scopes: decoded.scopes || [],
        attributes: {
            audience: decoded.audience,
            plan: decoded.plan,
            ...decoded.attributes
        }
    });

    return user;
}
```

### Option 2: Callback Function (Most Flexible)

For custom logic or when capabilities come from external systems:

```javascript
// frigg.config.js
module.exports = {
    integrations: [...],
    userConfig: { ... },

    // Optional: Custom capability loader
    async getCapabilityContext(req, user) {
        // Query your auth service, database, or session
        const perms = await authService.getPermissions(user.getId());

        return {
            roles: perms.roles,
            scopes: perms.scopes,
            attributes: {
                audience: user.getId().startsWith('customer:') ? 'customer' : 'employee',
                plan: perms.plan
            }
        };
    }
};
```

### Option 3: x-frigg Headers (Backend-to-Backend)

For shared secret auth mode:

```javascript
fetch('/api/v2/integrations', {
    headers: {
        'x-frigg-api-key': API_KEY,
        'x-frigg-appuserid': 'customer:u_12345',
        // Capability headers
        'x-frigg-roles': 'user,premium',
        'x-frigg-scopes': 'integrations:read,integrations:create',
        'x-frigg-audience': 'customer'
    }
});
```

### Resolution Order

```javascript
async function resolveCapabilityContext(req, user, config) {
    // 1. Callback (if provided)
    if (config.getCapabilityContext) {
        const ctx = await config.getCapabilityContext(req, user);
        return new CapabilityContext({ userId: user.getId(), ...ctx });
    }

    // 2. Already on user (from JWT parsing)
    if (user.capabilityContext) {
        return user.capabilityContext;
    }

    // 3. x-frigg headers
    if (req.headers['x-frigg-roles'] || req.headers['x-frigg-scopes']) {
        return CapabilityContext.fromHeaders(req.headers, user.getId());
    }

    // 4. Default: empty (no restrictions)
    return new CapabilityContext({ userId: user.getId() });
}
```

---

## Concrete Implementation Plan

### Files to Create

| File | Purpose |
|------|---------|
| `packages/core/integrations/capability-context.js` | CapabilityContext class |
| `packages/core/integrations/capability-context.test.js` | Unit tests |

### Files to Modify

| File | Change |
|------|--------|
| `packages/core/user/use-cases/get-user-from-adopter-jwt.js` | Implement JWT parsing, extract capability claims |
| `packages/core/user/use-cases/authenticate-user.js` | Pass through capability context from user |
| `packages/core/integrations/integration-router.js` | Add `resolveCapabilityContext` middleware |
| `packages/core/integrations/use-cases/get-possible-integrations.js` | Filter by `requires` |
| `packages/core/handlers/app-definition-loader.js` | Support `getCapabilityContext` callback |
| `packages/core/index.js` | Export CapabilityContext |

### Minimal MVP (Phase 1)

```javascript
// capability-context.js - MINIMAL VERSION
class CapabilityContext {
    constructor({ userId, roles = [], scopes = [], attributes = {} }) {
        this.userId = userId;
        this.roles = roles;
        this.scopes = scopes;
        this.attributes = attributes;
    }

    hasAudience(audiences) {
        if (!audiences?.length) return true;
        return audiences.includes(this.attributes.audience);
    }

    hasAttributes(required) {
        if (!required) return true;
        return Object.entries(required).every(([key, vals]) =>
            Array.isArray(vals)
                ? vals.includes(this.attributes[key])
                : this.attributes[key] === vals
        );
    }

    async meetsRequirements(requires) {
        if (!requires) return true;
        if (requires.audience && !this.hasAudience(requires.audience)) return false;
        if (requires.attributes && !this.hasAttributes(requires.attributes)) return false;
        return true;
    }

    static fromHeaders(headers, userId) {
        return new CapabilityContext({
            userId,
            roles: headers['x-frigg-roles']?.split(',') || [],
            scopes: headers['x-frigg-scopes']?.split(',') || [],
            attributes: {
                audience: headers['x-frigg-audience'],
                plan: headers['x-frigg-plan']
            }
        });
    }
}
```

### What We're NOT Doing (Avoid Over-Engineering)

- ❌ No database storage for capabilities (host app owns this)
- ❌ No built-in RBAC enforcement (just visibility filtering)
- ❌ No feature flag SDK bundled (pluggable interface only)
- ❌ No capability caching in Frigg (stateless per-request)
- ❌ No admin UI for capability management (host app's job)

---

## Related Problem: Org/Individual Entity Ownership

### Current State

Entities are owned by either:
- `userId` (IndividualUser) - personal OAuth tokens
- `userId` (OrganizationUser) - org-level OAuth tokens
- `userId: null, isGlobal: true` - admin-managed global entities

### The Gap

What about integrations where:
- **Org owns** the Salesforce connection (shared CRM)
- **Individual owns** their Slack account (personal notifications)

```javascript
static Definition = {
    name: 'salesforce-to-slack',
    entities: {
        salesforce: {
            type: 'salesforce-api',
            ownership: 'organization',  // Org-level entity
            global: false,
            required: true
        },
        slack: {
            type: 'slack-api',
            ownership: 'individual',    // Per-user entity
            global: false,
            required: true
        }
    }
};
```

### Questions to Resolve

1. Can an IndividualUser create an integration using an OrganizationUser's entity?
2. Who "owns" the integration - the individual or the org?
3. What happens when individual leaves org - does integration survive?
4. Can multiple individuals share the org's Salesforce entity with their own Slack?

### Possible Approaches

**A. Integration owned by Individual, references Org entity**
```
Integration: userId = individual_123
  └── entities: [org_salesforce_entity, individual_slack_entity]
```

**B. Integration owned by Org, individual provides their entity**
```
Integration: userId = org_abc
  └── entities: [org_salesforce_entity]
  └── individualEntities: { user_123: slack_entity }
```

**C. Two-level integration (Org template + Individual instance)**
```
OrgIntegrationTemplate: userId = org_abc
  └── entities: [org_salesforce_entity]
  └── config: { ... }

IndividualIntegration: userId = individual_123, templateId = template_1
  └── entities: [individual_slack_entity]
```

This is a separate but related concern to Capability Context. Should be addressed in a follow-up.

---

## References

- Branch: `feature/integration-router-v2-drop-modules-router`
- Admin Router: `packages/core/handlers/routers/admin.js`
- Integration Router: `packages/core/integrations/integration-router.js`
- Global Entities Guide: `docs/guides/GLOBAL-ENTITIES-GUIDE.md`
- Feature Flag Context Patterns:
  - LaunchDarkly: https://launchdarkly.com/docs/home/flags/context-attributes
  - Unleash: https://docs.getunleash.io/
  - Flagsmith: https://docs.flagsmith.com/
