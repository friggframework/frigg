# Frigg Deployment Architecture Analysis

## Executive Summary

**Question**: Should you deploy 3 separate Frigg instances for different integration scenarios, or can a unified deployment with global entities and integration types work?

**Short Answer**: Both approaches are viable. The current documentation recommends 3 separate deployments, but the architecture has foundational support for a unified approach. The right choice depends on your risk tolerance, operational complexity preferences, and the maturity of your integration needs.

---

## Current Frigg Documentation Position

The Frigg docs explicitly address this in the [README FAQ](docs/README.md:70-90):

> "There are three potential use cases for Frigg:
> 1. **Internal Business Process Automation** - notifications, cron jobs, backoffice workflows
> 2. **Product and Productized Service Automation** - Twilio, SendGrid, service integrations
> 3. **End User Integration Enablement** - customer-facing integrations (tech partnerships)
>
> **Should you desire to use Frigg for each of these, we recommend creating 3 separate Frigg applications, as each one has a different user base, compute needs, and risk profile.**"

---

## Your 3 Deployment Scenarios Mapped

| Your Scenario | Frigg Category | User Context |
|--------------|----------------|--------------|
| External integrations for end users | End User Integration Enablement | `OrganizationUser` + `IndividualUser` |
| Internal product integrations (Twilio/SendGrid) | Product Automation | System/Service account |
| Company internal automations | Internal Business Process | Internal team users |

---

## Analysis: Why 3 Deployments Were Recommended

### 1. User Model Variance
The `createFriggBackend()` function allows configuring the primary user type:

```javascript
createFriggBackend({
  user: {
    primary: 'organization' | 'individual',
    usePassword: boolean,
    individualUserRequired: boolean,
    organizationUserRequired: boolean
  }
});
```

**The Problem**: This is a static configuration per deployment. You can't dynamically switch user contexts per integration type within a single deployment.

### 2. Risk Isolation
- **Customer-facing integrations**: Security breach exposes customer data
- **Internal product integrations**: Security breach affects service delivery
- **Internal automations**: Security breach affects internal operations

Separate deployments = separate blast radius.

### 3. Compute & Scaling Needs
- Customer integrations: Variable load, scales with customer count
- Product integrations: Predictable load, scales with product usage
- Internal automations: Low, predictable load

Separate deployments = independent scaling policies.

### 4. Credential Scoping
Entities and Credentials are scoped to a `User` in the database:

```javascript
// From entity.js
user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
}
```

There's no built-in "shared" or "global" credential concept.

---

## Analysis: Case for Unified Deployment

### Current Architectural Support

The framework already has foundational support for categorization:

1. **Integration Config Type Field**
   ```javascript
   // integration-model.js
   config: {}  // Can include a 'type' or 'scope' field
   ```

2. **Options Display Metadata**
   ```javascript
   display: {
     name: 'Integration Name',
     description: 'Description',
     category: 'could-add-here',  // Not formalized but extensible
     icon: 'https://...'
   }
   ```

3. **Dual User Model Already Exists**
   - `IndividualUser`: For end-user context
   - `OrganizationUser`: For org/team context
   - Relationship: `IndividualUser.organizationUser` links to parent org

4. **Entity Discriminators**
   Mongoose discriminators already support type-specific entity storage.

### What a Unified Approach Would Need

#### Option A: Integration Scope Field (Minimal Change)

Add a `scope` or `visibility` field to integrations:

```javascript
// Proposed addition to integration-model.js
const schema = new mongoose.Schema({
    scope: {
        type: String,
        enum: ['public', 'private', 'platform', 'internal'],
        default: 'public'
    },
    // ... existing fields
});
```

| Scope | Description | Example |
|-------|-------------|---------|
| `public` | Customer-facing, self-serve | HubSpot, Salesforce |
| `platform` | Powers the product, not user-visible | Twilio, SendGrid |
| `private` | Internal team use only | Slack notifications |
| `internal` | Company internal APIs | Customer Success API |

#### Option B: Global Entities (Medium Change)

Enable credential sharing across user contexts:

```javascript
// Proposed: Add ownership model to Entity
const schema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User' },
    ownershipType: {
        type: String,
        enum: ['user', 'organization', 'system', 'global'],
        default: 'user'
    },
    sharedWith: [{
        type: ObjectId,
        ref: 'User'
    }]
});
```

This enables:
- `user`: Current behavior, entity owned by specific user
- `organization`: Entity shared across org users
- `system`: Platform-level credentials (Twilio, etc.)
- `global`: Admin-managed credentials accessible to all

#### Option C: Multi-Tenant Context (Larger Change)

Introduce a `Tenant` model above User:

```
Tenant (Company)
├── Context: customer-facing
│   ├── OrganizationUser (customer org)
│   └── IndividualUser (customer user)
├── Context: platform
│   └── ServiceAccount (system user)
└── Context: internal
    └── InternalUser (team member)
```

---

## Decision Framework: Adversarial Sub-Agent Consensus

### Pro-Unified Agent Arguments

1. **Operational Simplicity**: One codebase, one deployment, one database
2. **Entity Reuse**: Platform credentials (Twilio) could be shared across contexts
3. **Unified Analytics**: Single view of all integration activity
4. **Faster Development**: No need to maintain 3 separate apps
5. **Modern Multi-Tenant Patterns**: Most SaaS platforms handle this with scoping

### Pro-Separate Agent Arguments

1. **Security Isolation**: Compromised customer integration can't access internal systems
2. **Independent Scaling**: Customer-facing can scale without affecting internal
3. **Deployment Independence**: Ship internal changes without customer regression testing
4. **Simpler Mental Model**: Each app has a single purpose
5. **Framework Designed for This**: Current architecture assumes single-tenant per deploy

### Consensus Path

**Hybrid Approach**: Start with unified, plan for separation if needed

1. **Phase 1**: Single deployment with `scope` field on integrations
2. **Phase 2**: Add `ownershipType` to entities for credential sharing
3. **Phase 3**: If scale/security demands, split into separate deployments using the same codebase with different configurations

---

## Recommended Architecture

### Unified Deployment with Integration Scoping

```
┌─────────────────────────────────────────────────────────────┐
│                    Frigg Application                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Public    │  │  Platform   │  │  Internal   │          │
│  │ Integrations│  │ Integrations│  │ Integrations│          │
│  │             │  │             │  │             │          │
│  │ - HubSpot   │  │ - Twilio    │  │ - Slack     │          │
│  │ - Salesforce│  │ - SendGrid  │  │ - Internal  │          │
│  │ - Stripe    │  │ - Analytics │  │   APIs      │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐          │
│  │    User     │  │   System    │  │  Internal   │          │
│  │  Entities   │  │  Entities   │  │  Entities   │          │
│  │ (per org)   │  │  (global)   │  │ (per team)  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    Shared MongoDB                            │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Additions

```javascript
// 1. Add to IntegrationBase.Config
static Config = {
    name: 'Integration Name',
    scope: 'public', // 'public' | 'platform' | 'internal'
    // ...
}

// 2. Add to Options class
class Options {
    constructor(params) {
        this.scope = get(params, 'scope', 'public');
        // ...
    }
}

// 3. Add filtering in IntegrationFactory
getIntegrationOptions(scope = null) {
    let options = this.integrationClasses.map(/* ... */);
    if (scope) {
        options = options.filter(opt => opt.scope === scope);
    }
    return options;
}

// 4. Add global entity support
const entitySchema = new mongoose.Schema({
    ownershipType: {
        type: String,
        enum: ['user', 'organization', 'system'],
        default: 'user'
    },
    // ...
});
```

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Security: Cross-context access | RBAC on integration routes by scope |
| Credential leakage | Encryption + scope-based access control |
| Noisy neighbor (customer load affects internal) | Rate limiting per scope |
| Complexity creep | Clear boundaries, good testing |
| Migration difficulty | Start with scope field, iterate |

---

## Conclusion & Recommendations

### For Your Situation

Given you're planning 3 deployment scenarios, I recommend:

1. **Start Unified** with a scope classification system
2. **Add to Entity/Integration models** a `scope` or `visibility` field
3. **Implement route-level access control** based on scope
4. **Monitor** for security, scaling, or operational issues
5. **Split later** if complexity or risk justifies it

### Changes Needed in Frigg

To properly support this, consider contributing:

1. `scope` field on `IntegrationBase.Config` and `Options`
2. `ownershipType` on Entity model for global credentials
3. Scope-based filtering in `IntegrationFactory.getIntegrationOptions()`
4. Route middleware for scope-based access control
5. Documentation on multi-context deployment patterns

### The Answer to "Do We Still Need 3 Deployments?"

**No, not necessarily.** With a robust app definition including scope/visibility classification and global entity support, a unified deployment can work. However, the current Frigg architecture doesn't have this out-of-the-box. You'd need to extend it.

The tradeoff:
- **3 Deployments**: Works today, simpler per-app, better isolation
- **1 Unified**: More initial work, but simpler operations long-term

Choose based on your team's capacity to extend the framework vs. operate multiple deployments.

---

## References

- Issue/PR #522: Integration Router v2 & Management UI Enhancements
- `packages/core/integrations/create-frigg-backend.js`
- `packages/core/integrations/integration-model.js`
- `packages/core/integrations/options.js`
- `packages/core/module-plugin/entity.js`
- `docs/README.md` - FAQ on integration types
