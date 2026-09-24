# Global Entities Implementation Plan

## Executive Summary

The Global Entity feature code exists but doesn't work due to a missing database schema field. This document provides the **minimal** changes needed to enable the feature.

## Key Corrections (from code review)

1. **Use `moduleName` for lookups, NOT `type`** - Entities already have `moduleName` field
2. **Don't add `status` field** - Status is inferred from `credential.authIsValid`
3. **Only add `isGlobal` field** - This is the only schema change needed
4. **Use existing auth flow** - GET/POST `/api/authorize` with admin context

## Current State Analysis

### Code That EXISTS ✅
- `create-integration.js` - Auto-includes global entities (lines 47-71)
- `admin.js` router - CRUD endpoints for `/api/admin/entities`
- `module-repository-*.js` - `findEntitiesBy()` method (already handles `moduleName`)
- `GlobalEntityManagement.jsx` - Management UI display
- `Definition.entities[key].global = true` - Integration definition support
- `/api/authorize` endpoints - Full auth flow (OAuth, API key, forms)

### What's BROKEN ❌
- Entity schema missing: `isGlobal` field
- `create-integration.js` queries by wrong fields (`type` instead of `moduleName`)
- Repository `_convertFilterToWhere` doesn't handle `isGlobal`
- Management UI has no creation flow (just display)

---

## Required Schema Changes

### 1. MongoDB Schema (`packages/core/prisma-mongodb/schema.prisma`)

```diff
model Entity {
  id           String      @id @default(auto()) @map("_id") @db.ObjectId
  credentialId String?     @db.ObjectId
  credential   Credential? @relation(fields: [credentialId], references: [id], onDelete: SetNull)
  userId       String?     @db.ObjectId
  user         User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String?
  moduleName   String?     // <-- ALREADY EXISTS - used for global entity lookup
  externalId   String?

+ // Global entity support (userId = null for global entities)
+ isGlobal     Boolean     @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  integrations   Integration[] @relation("IntegrationEntities", fields: [integrationIds], references: [id])
  integrationIds String[]      @db.ObjectId
  syncs   Sync[]   @relation("SyncEntities", fields: [syncIds], references: [id])
  syncIds String[] @db.ObjectId
  dataIdentifiers    DataIdentifier[]
  associationObjects AssociationObject[]

  @@index([userId])
  @@index([externalId])
  @@index([moduleName])
  @@index([credentialId])
+ @@index([isGlobal])
+ @@index([isGlobal, moduleName]) // Composite index for global entity queries
  @@map("Entity")
}
```

### 2. PostgreSQL Schema (`packages/core/prisma-postgresql/schema.prisma`)

```diff
model Entity {
  id           Int         @id @default(autoincrement())
  credentialId Int?
  credential   Credential? @relation(fields: [credentialId], references: [id], onDelete: SetNull)
  userId       Int?
  user         User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String?
  moduleName   String?     // <-- ALREADY EXISTS - used for global entity lookup
  externalId   String?

+ // Global entity support (userId = null for global entities)
+ isGlobal     Boolean     @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  integrations   Integration[] @relation("IntegrationEntities", fields: [integrationIds], references: [id])
  integrationIds Int[]
  syncs   Sync[]   @relation("SyncEntities", fields: [syncIds], references: [id])
  syncIds Int[]
  dataIdentifiers    DataIdentifier[]
  associationObjects AssociationObject[]

  @@index([userId])
  @@index([externalId])
  @@index([moduleName])
  @@index([credentialId])
+ @@index([isGlobal])
+ @@index([isGlobal, moduleName])
  @@map("entity")
}
```

---

## Required Repository Changes

### 3. MongoDB Repository (`packages/core/modules/repositories/module-repository-mongo.js`)

Update `_convertFilterToWhere` method to handle `isGlobal`:

```diff
_convertFilterToWhere(filter) {
    const where = {};

    if (filter.id) where.id = filter.id;
    if (filter.userId) where.userId = filter.userId;
    if (filter.name) where.name = filter.name;
    if (filter.moduleName) where.moduleName = filter.moduleName;
    if (filter.externalId) where.externalId = filter.externalId;
    if (filter.credentialId) where.credentialId = filter.credentialId;

+   // Global entity support
+   if (filter.isGlobal !== undefined) where.isGlobal = filter.isGlobal;

    return where;
}
```

Update the return mapping in `findEntitiesBy` to include `isGlobal`:

```diff
return entities.map((e) => ({
    id: e.id,
    accountId: e.accountId,
    credential: e.credential,
    userId: e.userId,
    name: e.name,
    externalId: e.externalId,
    moduleName: e.moduleName,
+   isGlobal: e.isGlobal,
}));
```

### 4. PostgreSQL Repository (`packages/core/modules/repositories/module-repository-postgres.js`)

Same changes as MongoDB repository.

### 5. DocumentDB Repository (`packages/core/modules/repositories/module-repository-documentdb.js`)

Same changes as MongoDB repository.

---

## Management UI Changes

### 6. Global Entity Creation Flow

Global entities should be created using the **existing authorization flow** (`/api/authorize`), the same flow used for user entities. This ensures consistent credential handling and supports both OAuth and form-based authentication.

**Authorization Flow Overview:**

1. **GET `/api/authorize`** - Get authorization requirements for an entity type
   - Returns either OAuth URL or JSON Schema form definition
   - Query params: `entityType` (the `moduleName` of the API module)

2. **POST `/api/authorize`** - Complete authorization
   - For OAuth: Receives callback with auth code
   - For Forms: Submits credential data (API keys, etc.)
   - Creates both Credential and Entity records

**Implementation in GlobalEntityManagement.jsx:**

```jsx
// Step 1: Get authorization requirements for the module
const getAuthRequirements = async (moduleName) => {
  const response = await fetch(
    `/api/frigg-app/proxy/authorize?entityType=${moduleName}`,
    { method: 'GET' }
  );
  return response.json();
  // Returns: { type: 'oauth', url: '...' } OR { type: 'form', jsonSchema: {...}, uiSchema: {...} }
};

// Step 2a: For OAuth - redirect to OAuth URL
const handleOAuthFlow = (authUrl) => {
  // Redirect to OAuth provider
  // Include isGlobal=true in state to mark as global on callback
  window.location.href = authUrl;
};

// Step 2b: For Form - submit credentials
const handleFormSubmit = async (moduleName, formData) => {
  const response = await fetch('/api/frigg-app/proxy/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType: moduleName,
      data: formData,
      isGlobal: true  // Mark as global entity
    })
  });
  // This creates Credential + Entity with isGlobal: true
  return response.json();
};
```

### 7. Admin Context for Global Entity Authorization

The Management UI proxy needs to pass admin context when creating global entities:

```javascript
// In frigg-app proxy route handler
router.post('/proxy/authorize', async (req, res) => {
  const { entityType, data, isGlobal } = req.body;

  // Forward to Frigg app's authorize endpoint
  const response = await friggAppClient.post('/api/authorize', {
    entityType,
    data,
    // Admin context: no userId means global entity
    ...(isGlobal && { userId: null, isGlobal: true })
  });

  res.json(response.data);
});
```

### 8. UI Components Needed

```jsx
// GlobalEntityManagement.jsx additions:

// 1. Module selector dropdown (list available API modules)
<ModuleSelector
  modules={availableModules}
  onSelect={handleModuleSelect}
/>

// 2. Dynamic auth form (JSON Forms renderer)
{authRequirements?.type === 'form' && (
  <JsonForms
    schema={authRequirements.jsonSchema}
    uiSchema={authRequirements.uiSchema}
    data={formData}
    onChange={({ data }) => setFormData(data)}
  />
)}

// 3. OAuth redirect button
{authRequirements?.type === 'oauth' && (
  <button onClick={() => handleOAuthFlow(authRequirements.url)}>
    Connect via OAuth
  </button>
)}
```

---

## Testing the Fix

### Test 1: Schema Migration Works

```bash
# MongoDB
npm run prisma:push:mongo

# PostgreSQL
npm run prisma:migrate:postgres -- --name add_is_global_field
```

### Test 2: Global Entity Query Works

```javascript
// In integration test or REPL
const entities = await moduleRepository.findEntitiesBy({
  isGlobal: true,
  moduleName: 'twilio-api'
});
console.log(entities); // Should return global entities, not []

// Verify entity has valid credential
const entity = entities[0];
console.log(entity.credential?.authIsValid); // Should be true for connected entities
```

### Test 3: Auto-Inclusion Works

```javascript
// Integration with global entity definition
static Definition = {
  entities: {
    shared: {
      type: 'test-api',  // Maps to moduleName
      global: true,
      required: true
    }
  }
};

// Create global entity via auth flow (creates Credential + Entity)
// This happens through /api/authorize with isGlobal: true

// Create integration - should auto-include
const integration = await createIntegration([], userId, { type: 'my-integration' });
// integration.entities should include the global entity
```

### Test 4: Auth Flow Creates Global Entity

```javascript
// GET authorization requirements
const authReq = await fetch('/api/authorize?entityType=test-api');
// Returns: { type: 'form', jsonSchema: {...} } or { type: 'oauth', url: '...' }

// POST to create entity with isGlobal flag
const entity = await fetch('/api/authorize', {
  method: 'POST',
  body: JSON.stringify({
    entityType: 'test-api',
    data: { apiKey: '...' },
    isGlobal: true
  })
});

// Verify entity was created as global
const created = await moduleRepository.findEntityBy({ id: entity.id });
expect(created.isGlobal).toBe(true);
expect(created.userId).toBeNull();
```

---

## Recommended Implementation Order

### Phase 1: Enable the Feature (Critical Path)

| Step | File | Change | Effort |
|------|------|--------|--------|
| 1 | `prisma-mongodb/schema.prisma` | Add `isGlobal` field + indexes | 5 min |
| 2 | `prisma-postgresql/schema.prisma` | Same changes | 5 min |
| 3 | `module-repository-mongo.js` | Add `isGlobal` to `_convertFilterToWhere` + return mapping | 10 min |
| 4 | `module-repository-postgres.js` | Same changes | 10 min |
| 5 | `module-repository-documentdb.js` | Same changes | 10 min |
| 6 | Run migrations | `npm run prisma:generate && push/migrate` | 5 min |
| 7 | `create-integration.js` | Fix query to use `moduleName` instead of `type` | 15 min |
| 8 | Add integration test | Test global entity query + auto-include | 30 min |

**Total Phase 1**: ~1.5 hours

### Phase 2: Core Auth Flow Updates

| Step | File | Change | Effort |
|------|------|--------|--------|
| 9 | `integration-router.js` | Handle `isGlobal` flag in POST /api/authorize | 30 min |
| 10 | Entity creation logic | Set `userId: null` when `isGlobal: true` | 15 min |

### Phase 3: Management UI (Recommended)

| Step | File | Change | Effort |
|------|------|--------|--------|
| 11 | `GlobalEntityManagement.jsx` | Add module selector + auth flow integration | 2-3 hours |
| 12 | Frigg app proxy routes | Add `/proxy/authorize` for global entity creation | 1 hour |

### Phase 4: Documentation (Done)

| Step | File | Change | Effort |
|------|------|--------|--------|
| 13 | `docs/guides/` | Create "Global Entities Guide" | Done ✅ |
| 14 | `docs/architecture/` | Create ADR | Done ✅ |
| 15 | `docs/architecture/` | Create Implementation Plan | Done ✅ |

---

## Risk Mitigation

### Migration Safety

- `isGlobal` defaults to `false` - existing entities unaffected
- No data migration needed - new field with safe default
- Run in dev/staging before production

### Backward Compatibility

- Existing integrations continue to work
- No integration definition changes required
- Global entity feature is opt-in via `global: true`
- Existing auth flows unchanged unless `isGlobal` flag passed

### Rollback Plan

If issues arise:
1. Remove `isGlobal` field from schema
2. Regenerate Prisma clients
3. Feature reverts to non-functional (same as current state)

---

## Verification Checklist

After implementation:

- [ ] Schema migrations applied to both databases
- [ ] Prisma clients regenerated
- [ ] `findEntitiesBy({ isGlobal: true, moduleName: 'x' })` returns correct entities
- [ ] POST `/api/authorize` with `isGlobal: true` creates entity with `userId: null`
- [ ] `CreateIntegration` auto-includes global entities by `moduleName`
- [ ] Global entity has `credential.authIsValid === true` after successful auth
- [ ] Integration tests pass
- [ ] Management UI can create global entities via auth flow
