# Architecture Decision Record: Global Entities

**Status**: Proposed
**Date**: 2024-12-18
**Author**: Claude Code

## Context

Frigg supports three distinct adoption patterns, each with different entity ownership models:

1. **User Integrations** - Traditional SaaS integration (user owns all entities)
2. **Feature-Powered Integrations** - Product features backed by global services
3. **Internal Automation** - Business process automation (mostly global entities)

This ADR documents the Global Entity feature: what it is, how it should work, current implementation status, and required changes.

## Problem Statement

Integration developers need a way to:
1. Configure **shared service accounts** (e.g., company Twilio for SMS)
2. Have integrations **automatically use global entities** without user configuration
3. Distinguish between **user-owned entities** and **app-owner-owned entities**

Currently, the code for this exists but is **non-functional** due to missing database schema fields.

---

## The Three Frigg Use Cases

### Use Case 1: User Integrations (Traditional)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRIGG ADOPTER (e.g., Quo)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User A                     User B                             │
│   ┌─────────────────┐       ┌─────────────────┐                │
│   │ HubSpot Entity  │       │ Salesforce Ent  │                │
│   │ (User A's acct) │       │ (User B's acct) │                │
│   └────────┬────────┘       └────────┬────────┘                │
│            │                         │                          │
│            ▼                         ▼                          │
│   ┌─────────────────┐       ┌─────────────────┐                │
│   │  Integration    │       │  Integration    │                │
│   │  (CRM Sync)     │       │  (CRM Sync)     │                │
│   └─────────────────┘       └─────────────────┘                │
│                                                                 │
│   Characteristics:                                              │
│   • Each user owns their entities                               │
│   • Each user connects their own accounts                       │
│   • Users manage their own credentials                          │
│   • Standard OAuth flow per user                                │
└─────────────────────────────────────────────────────────────────┘
```

**When to use**: Building integrations where each customer brings their own accounts (HubSpot, Salesforce, etc.)

**Entity ownership**: User-owned (`entity.userId = user.id`)

---

### Use Case 2: Feature-Powered Integrations

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRIGG ADOPTER (e.g., Quo)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────┐                  │
│   │         GLOBAL ENTITY (Twilio)          │◄── Admin creates │
│   │      Quo's Twilio Account (shared)      │    once at deploy│
│   │          isGlobal: true                 │                  │
│   │          userId: null                   │                  │
│   └─────────────────┬───────────────────────┘                  │
│                     │                                           │
│         ┌───────────┼───────────┐                              │
│         │           │           │                              │
│         ▼           ▼           ▼                              │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│   │ User A's │ │ User B's │ │ User C's │                       │
│   │Integration│ │Integration│ │Integration│                     │
│   │(SMS feat)│ │(SMS feat)│ │(SMS feat)│                       │
│   └──────────┘ └──────────┘ └──────────┘                       │
│                                                                 │
│   Characteristics:                                              │
│   • Admin configures global entity once at deploy              │
│   • Users enable "SMS feature" - no Twilio account needed      │
│   • All SMS goes through Quo's Twilio account                  │
│   • Users don't see/manage Twilio credentials                  │
│   • Cost is on Quo (Frigg adopter), not end users             │
└─────────────────────────────────────────────────────────────────┘
```

**When to use**: Product features that use a shared backend service
- SMS notifications via company Twilio
- AI features via company OpenAI key
- Report generation via company Looker account

**Entity ownership**: App-owner-owned (`entity.isGlobal = true`, `entity.userId = null`)

---

### Use Case 3: Internal Automation

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRIGG ADOPTER (e.g., Quo)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌───────────────────────────────────────────────────────────┐│
│   │                    GLOBAL ENTITIES                        ││
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      ││
│   │  │ Quo     │  │ Slack   │  │ Zendesk │  │ Stripe  │      ││
│   │  │ Admin   │  │ (Quo's) │  │ (Quo's) │  │ (Quo's) │      ││
│   │  │ API     │  │         │  │         │  │         │      ││
│   │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘      ││
│   └───────┼────────────┼────────────┼────────────┼───────────┘│
│           │            │            │            │             │
│           └────────────┴─────┬──────┴────────────┘             │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────────┐                     │
│                    │    Integrations     │                     │
│                    │  (Workflows)        │                     │
│                    │                     │                     │
│                    │ • User signup →     │                     │
│                    │   Slack notify      │                     │
│                    │                     │                     │
│                    │ • Integration error │                     │
│                    │   → Zendesk ticket  │                     │
│                    │                     │                     │
│                    │ • Upgrade plan →    │                     │
│                    │   Stripe webhook    │                     │
│                    └─────────────────────┘                     │
│                                                                 │
│   Characteristics:                                              │
│   • Almost all entities are global (company-owned)             │
│   • "Users" are internal team members or org units             │
│   • Automations trigger on internal system events              │
│   • Quo Admin API provides events for other tools to react     │
└─────────────────────────────────────────────────────────────────┘
```

**When to use**: Back-office automation, sales workflows, support automation

**Entity ownership**: Mostly global (`isGlobal = true`), possibly some user-specific

---

## Integration Definition: Global Entity Configuration

### Current Schema (Definition.entities)

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'sms-notification',
        version: '1.0.0',

        modules: {
            platform: { definition: PlatformApi },    // User's platform account
            sms: { definition: TwilioApi }            // Shared Twilio
        },

        entities: {
            // User-owned entity - user connects their own account
            userPlatform: {
                type: 'platform-api',
                global: false,         // User-owned (default)
                required: true
            },

            // Global entity - admin configures once, all users share
            sharedSms: {
                type: 'twilio-api',
                global: true,          // App-owner-owned
                required: true,        // Fail if not configured
                // required: false     // Optional - graceful degradation
            }
        }
    };
}
```

### How Auto-Inclusion Works

```
User creates integration
         │
         ▼
┌─────────────────────────────────────┐
│ CreateIntegration Use Case          │
│                                     │
│ 1. User provides: [userPlatformId]  │
│                                     │
│ 2. Framework checks Definition:     │
│    entities.sharedSms.global = true │
│                                     │
│ 3. Framework queries:               │
│    findEntityBy({                   │
│      type: 'twilio-api',            │
│      isGlobal: true,                │
│      status: 'connected'            │
│    })                               │
│                                     │
│ 4. Auto-adds global entity ID       │
│    to integration.entities[]        │
│                                     │
│ 5. Final entities:                  │
│    [userPlatformId, globalTwilioId] │
└─────────────────────────────────────┘
```

---

## Current Implementation Status

### What EXISTS (Code Written)

| Component | Location | Status |
|-----------|----------|--------|
| Auto-include logic | `integrations/use-cases/create-integration.js:47-71` | ✅ Written |
| Admin API endpoints | `handlers/routers/admin.js:262-386` | ✅ Written |
| Global entity filter | `modules/repositories/module-repository-*.js` | ✅ Written |
| GlobalEntity domain class | `management-ui/src/domain/entities/GlobalEntity.js` | ✅ Written |
| Management UI display | `GlobalEntityManagement.jsx` | ✅ Written |

### What's BROKEN (Schema Gap)

**The Entity Prisma schema is missing required fields:**

```prisma
// CURRENT (incomplete)
model Entity {
  id           String      @id
  credentialId String?
  userId       String?     // Only field for ownership
  name         String?
  moduleName   String?     // ✅ EXISTS - used for global entity lookup
  externalId   String?
  // ❌ MISSING: isGlobal
}
```

**The code tries to query non-existent fields:**

```javascript
// In create-integration.js - this query FAILS silently
const globalEntity = await moduleRepository.findEntityBy({
    type: entityConfig.type,      // ❌ Should use moduleName instead
    isGlobal: true,               // ❌ Field doesn't exist in schema
    status: 'connected'           // ❌ Should check credential.authIsValid instead
});
```

**Corrected Query** (after schema fix):

```javascript
const globalEntity = await moduleRepository.findEntityBy({
    moduleName: entityConfig.type,  // ✅ Use moduleName for lookup
    isGlobal: true,                 // ✅ After adding field to schema
});
// Then check: globalEntity.credential?.authIsValid === true
```

**Result**: Global entity queries return empty results. The feature doesn't work.

---

## Proposed Changes

### 1. Schema Migration (CRITICAL)

Add `isGlobal` field to Entity model in both databases. **Note**: We do NOT add `type` or `status` fields:
- `moduleName` already exists and is used for entity lookups
- Entity connection status is determined by `credential.authIsValid`

**MongoDB** (`prisma-mongodb/schema.prisma`):
```prisma
model Entity {
  id           String      @id @default(auto()) @map("_id") @db.ObjectId
  credentialId String?     @db.ObjectId
  credential   Credential? @relation(...)
  userId       String?     @db.ObjectId
  user         User?       @relation(...)
  name         String?
  moduleName   String?     // ✅ Already exists - used for global entity lookup
  externalId   String?

  // NEW FIELD (only one needed)
  isGlobal     Boolean     @default(false)

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  // Add indexes for global entity queries
  @@index([isGlobal])
  @@index([isGlobal, moduleName])  // Composite index for global entity lookup
}
```

**PostgreSQL** (`prisma-postgresql/schema.prisma`):
```prisma
model Entity {
  id           Int         @id @default(autoincrement())
  credentialId Int?
  credential   Credential? @relation(...)
  userId       Int?
  user         User?       @relation(...)
  name         String?
  moduleName   String?     // ✅ Already exists - used for global entity lookup
  externalId   String?

  // NEW FIELD (only one needed)
  isGlobal     Boolean     @default(false)

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  // Add indexes
  @@index([isGlobal])
  @@index([isGlobal, moduleName])
}
```

### 2. Repository Updates

Update `_convertFilterToWhere` in both repository implementations:

```javascript
_convertFilterToWhere(filter) {
    const where = {};

    // Existing fields
    if (filter.id) where.id = filter.id;
    if (filter.userId) where.userId = filter.userId;
    if (filter.moduleName) where.moduleName = filter.moduleName;

    // NEW: Global entity support
    if (filter.isGlobal !== undefined) where.isGlobal = filter.isGlobal;

    return where;
}
```

### 3. Management UI Updates

**Recommended Approach: Use Existing Auth Flow**

Global entities should be created using the same authorization flow as user entities (`/api/authorize`):

1. **Module selector** - List available API modules by `moduleName`
2. **GET `/api/authorize?entityType={moduleName}`** - Get auth requirements (OAuth URL or JSON form)
3. **Complete auth flow** - OAuth redirect or form submission
4. **POST `/api/authorize`** - Submit with `isGlobal: true` flag
5. **Result** - Creates Credential + Entity with `userId: null, isGlobal: true`

This ensures consistent credential handling and supports both OAuth and form-based authentication.

### 4. No Integration Definition Changes Needed

The `Definition.entities[key].global = true` pattern is already correct. No changes needed.

---

## Decision Matrix

| Change | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Schema migration | CRITICAL | Low | Enables entire feature |
| Repository filter updates | HIGH | Low | Required for queries |
| Fix UI message | MEDIUM | Trivial | Reduces confusion |
| Add UI create flow | LOW | Medium | Nice-to-have |
| Documentation | MEDIUM | Low | Developer enablement |

---

## Risks and Mitigations

### Risk 1: Breaking Existing Data
- **Risk**: Adding `isGlobal` field with default `false` might not distinguish old entities
- **Mitigation**: Default `false` is safe - all existing entities are user-owned

### Risk 2: Query Performance
- **Risk**: Global entity queries on unindexed fields
- **Mitigation**: Add composite index on `[isGlobal, moduleName]`

### Risk 3: Definition.entities[key].type Mapping
- **Risk**: `Definition.entities[key].type` needs to map to `moduleName`
- **Mitigation**: Update `create-integration.js` to query by `moduleName` using the definition's `type` value
- **Note**: The definition's `type` field (e.g., 'twilio-api') maps to the entity's `moduleName` field

---

## Alternatives Considered

### Alternative 1: Separate GlobalEntity Table
- **Rejected**: Too much code duplication
- Credentials, encryption, repositories would need to be duplicated

### Alternative 2: User ID Convention (userId = 'global' or null)
- **Partially Used**: `userId = null` for global entities
- **Issue**: Can't reliably query for global entities without explicit flag
- **Decision**: Keep null userId convention + add `isGlobal` flag for explicit queries

### Alternative 3: Add `type` and `status` Fields
- **Rejected**: Unnecessary duplication
- `moduleName` already serves the lookup purpose
- `credential.authIsValid` already indicates connection status
- Adding redundant fields creates data synchronization issues

### Alternative 4: Soft Delete Pattern for Entity Types
- **Rejected**: Over-engineering for the use case
- Simple boolean `isGlobal` is sufficient

---

## Implementation Plan

### Phase 1: Schema Fix (Blocks Everything)
1. Add `isGlobal` field to both Prisma schemas
2. Add composite index `[isGlobal, moduleName]`
3. Generate Prisma clients
4. Run migrations (PostgreSQL) / push (MongoDB)
5. Update repository `_convertFilterToWhere` methods
6. Update `create-integration.js` to query by `moduleName`
7. Add integration tests

### Phase 2: Core Auth Flow Updates
1. Handle `isGlobal` flag in POST `/api/authorize`
2. Set `userId: null` when creating global entities

### Phase 3: Management UI
1. Add module selector to GlobalEntityManagement
2. Integrate with existing `/api/authorize` flow
3. Support both OAuth and form-based auth

### Phase 4: Documentation (Done)
1. ADR created ✅
2. Global Entities Guide created ✅
3. Implementation Plan created ✅

---

## References

- `packages/core/integrations/use-cases/create-integration.js` - Auto-include logic
- `packages/core/handlers/routers/admin.js` - Admin API endpoints
- `packages/core/prisma-mongodb/schema.prisma` - MongoDB schema
- `packages/core/prisma-postgresql/schema.prisma` - PostgreSQL schema
- `packages/devtools/management-ui/src/domain/entities/GlobalEntity.js` - Domain model
