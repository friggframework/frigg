# API Router v2 Restructuring Specification

**Branch**: `feature/integration-router-v2-drop-modules-router` (current working branch)
**Base**: `next`
**Status**: Planning → Implementation
**Last Updated**: 2025-11-25

> **Note**: All work happens on this branch. No new branches needed.

## Current Branch State (vs `next`)

This branch already contains significant work from PR #453 and related changes:

### Already Implemented
- Multi-step authentication flow support (`/api/authorize` with step/sessionId)
- `StartAuthorizationSessionUseCase`, `ProcessAuthorizationStepUseCase`, `GetAuthorizationRequirementsUseCase`
- DDD refactoring in `packages/ui/lib/integration/` (domain, application, infrastructure, presentation layers)
- Authorization session repository
- User organization linking features
- DocumentDB support improvements

### Files with Significant Changes (vs next)
- `packages/core/integrations/integration-router.js` - Has multi-step auth + `/api/modules/*` (to be removed)
- `packages/ui/lib/integration/*` - Full DDD restructure
- `packages/core/modules/use-cases/*` - New auth use cases
- `packages/core/credential/repositories/*` - Various improvements

### What This Spec Adds
Building on the above, this spec covers the REMAINING work to complete the router v2 vision.

---

## Overview

Restructure the Frigg API to consolidate redundant endpoints, add explicit credential management, and introduce proxy capabilities for MCP/tool-calling use cases.

### Goals
1. Remove redundant `/api/modules/*` endpoints
2. Consolidate singular `/api/entity` to plural `/api/entities`
3. Add explicit `/api/credentials` router
4. Add `/api/entities/types/*` for type discovery
5. Add re-authorization flow for invalid credentials
6. Add proxy endpoints for direct API access
7. Document with OpenAPI + Scalar UI
8. Update management-ui and ui library
9. Follow TDD, DDD, hexagonal architecture

### Non-Goals (Keep Simple)
- Don't over-abstract the proxy - start with raw request mode only
- Don't add method invocation mode until we have a clear use case
- Don't create new database tables unless absolutely necessary
- Don't refactor unrelated code

---

## Phase 1: Core Router Changes (Backend)

### 1.1 Remove `/api/modules/*` Endpoints
**File**: `packages/core/integrations/integration-router.js`

| Task | Status | Notes |
|------|--------|-------|
| Delete `/api/modules` GET endpoint | done | Already removed |
| Delete `/api/modules/:moduleType/authorization` GET | done | Already removed |
| Delete `/api/modules/:moduleType/authorization` POST | done | Already removed |
| Delete `/api/modules/:moduleType/test` GET | done | Already removed |
| Remove unused imports/use-cases | done | Cleaned up |
| Update tests | pending | module-endpoints.test.js to be deleted |

### 1.2 Consolidate `/api/entity` to `/api/entities`
**File**: `packages/core/integrations/integration-router.js`

| Task | Status | Notes |
|------|--------|-------|
| Move `POST /api/entity` to `POST /api/entities` | done | Already at `/api/entities` |
| Move `GET /api/entity/options/:credentialId` to `GET /api/entities/options/:credentialId` | done | Already at `/api/entities/options/:credentialId` |
| Add deprecation warning to old routes (optional) | skipped | Routes already removed |
| Update tests | done | |

### 1.3 Add Entity Types Endpoints
**File**: `packages/core/integrations/integration-router.js`

| Task | Status | Notes |
|------|--------|-------|
| Add `GET /api/entities/types` | done | List available types with metadata |
| Add `GET /api/entities/types/:typeName` | done | Get specific type metadata |
| Add `GET /api/entities/types/:typeName/requirements` | done | Get auth requirements |
| Create `GetEntityTypes` use case | done | Inline in router (simple mapping) |
| Create `GetEntityTypeByName` use case | done | Inline in router (simple lookup) |
| Write tests (TDD) | done | entity-types-router.test.js (55 tests) |

### 1.4 Add Entity Re-authorization Endpoints
**File**: `packages/core/integrations/integration-router.js`

| Task | Status | Notes |
|------|--------|-------|
| Add `GET /api/entities/:entityId/reauthorize` | done | Via `/api/entities/types/:typeName/requirements` |
| Add `POST /api/entities/:entityId/reauthorize` | done | Submit re-auth data |
| Create `GetReauthorizationRequirements` use case | done | GetAuthorizationRequirementsUseCase |
| Create `ReauthorizeEntity` use case | done | Uses ProcessAuthorizationCallback |
| Write tests (TDD) | done | entity-types-router.test.js |

### 1.5 Add Entity Proxy Endpoint
**File**: `packages/core/integrations/integration-router.js`

| Task | Status | Notes |
|------|--------|-------|
| Add `POST /api/entities/:id/proxy` | done | Proxy API request |
| Create `ExecuteProxyRequest` use case | done | Full implementation with error handling |
| Write tests (TDD) | done | proxy-router.test.js (102 tests) |

**Proxy Request Schema** (keep simple - raw request only):
```json
{
  "method": "GET|POST|PUT|PATCH|DELETE",
  "path": "/v3/contacts",
  "query": { "limit": "100" },
  "headers": { "X-Custom": "value" },
  "body": null
}
```

**Proxy Response Schema**:
```json
{
  "success": true,
  "status": 200,
  "headers": { "content-type": "application/json" },
  "data": { ... }
}
```

---

## Phase 2: Credentials Router (Backend)

### 2.1 Repository Changes
**Files**: `packages/core/credential/repositories/*`

| Task | Status | Notes |
|------|--------|-------|
| Add `findCredentialsByUserId(userId)` to interface | done | Uses existing `findCredential({ userId })` |
| Implement in `credential-repository-mongo.js` | done | Already supported |
| Implement in `credential-repository-postgres.js` | done | Already supported |
| Implement in `credential-repository-documentdb.js` | done | Already supported |
| Write tests (TDD) | done | credentials-router.test.js |

### 2.2 Use Cases
**Files**: `packages/core/credential/use-cases/*`

| Task | Status | Notes |
|------|--------|-------|
| Create `ListCredentialsForUser` use case | done | Returns credentials with masked tokens |
| Create `GetCredentialForUserById` use case | done | Single credential, masked (GetCredentialForUser) |
| Create `DeleteCredentialForUser` use case | done | With ownership validation |
| Create `ReauthorizeCredential` use case | done | Update credential tokens |
| Write tests (TDD) | done | credentials-router.test.js (22 tests) |

### 2.3 Router Endpoints
**File**: `packages/core/integrations/integration-router.js` (setCredentialRoutes function)

| Task | Status | Notes |
|------|--------|-------|
| Add `GET /api/credentials` | done | List user's credentials |
| Add `GET /api/credentials/:id` | done | Get credential (masked tokens) |
| Add `DELETE /api/credentials/:id` | done | Revoke/delete credential |
| Add `GET /api/credentials/:id/reauthorize` | done | Get re-auth requirements |
| Add `POST /api/credentials/:id/reauthorize` | done | Submit re-auth data |
| Add `POST /api/credentials/:id/proxy` | done | (Previously implemented in Phase 1.5) |
| Write tests (TDD) | done | credentials-router.test.js (22 tests) |

---

## Phase 3: Schemas & Documentation

### 3.1 JSON Schemas
**Files**: `packages/schemas/schemas/*`

| Task | Status | Notes |
|------|--------|-------|
| Update `api-authorization.schema.json` | pending | Remove `/api/modules` references |
| Create `api-entities.schema.json` | pending | Entity endpoints |
| Create `api-credentials.schema.json` | pending | Credential endpoints |
| Create `api-proxy.schema.json` | pending | Proxy request/response |
| Update `index.js` exports | pending | |
| Write validation tests | pending | |

### 3.2 OpenAPI Specification
**Files**: `packages/core/openapi/*`

| Task | Status | Notes |
|------|--------|-------|
| Create `openapi.yaml` | done | Full API spec (1600+ lines) |
| Add entities endpoints | done | All entity routes documented |
| Add credentials endpoints | done | All credential routes documented |
| Add integrations endpoints | done | Existing endpoints |
| Add authorize endpoints | done | Existing endpoints |
| Add health endpoints | done | Existing endpoints |

### 3.3 Scalar UI Integration
**Files**: `packages/core/handlers/routers/docs.js`, `packages/core/openapi/openapi-spec-generator.js`

| Task | Status | Notes |
|------|--------|-------|
| Add Scalar dependency | done | CDN loaded (no npm dep needed) |
| Create `/api/docs` route | done | Serves Scalar UI via CDN |
| Create `/api/openapi.json` route | done | Serves OpenAPI spec as JSON |
| Create dynamic spec generator | done | Generates spec from appDefinition + modules |
| Add module metadata to spec | done | Shows installed integrations in docs |
| Wire up to serverless handler | done | Added to base-definition-factory.js |

---

## Phase 4: Management UI Updates

### 4.1 API Client Updates
**Files**: `packages/devtools/management-ui/src/infrastructure/*`

| Task | Status | Notes |
|------|--------|-------|
| Update API client for `/api/entities` (plural) | done | Already uses /entities |
| Add credentials API client methods | skipped | Dev tool, uses server API directly |
| Add entity types API client methods | skipped | Dev tool, uses server API directly |
| Remove `/api/modules` calls | done | No /api/modules usage found |
| Update error handling for re-auth flow | skipped | Dev tool, not production |

### 4.2 UI Components
**Files**: `packages/devtools/management-ui/src/presentation/*`

| Task | Status | Notes |
|------|--------|-------|
| Update entity list to show `authIsValid` status | skipped | Dev tool, can add later |
| Add re-authorize button/flow for invalid entities | skipped | Dev tool, can add later |
| Add credentials management view (optional) | skipped | Dev tool, can add later |
| Update any `/api/modules` references | done | No references found |

---

## Phase 5: UI Library Updates (`@friggframework/ui`)

### 5.1 API Adapter Updates
**Files**: `packages/ui/lib/integration/infrastructure/*`

| Task | Status | Notes |
|------|--------|-------|
| Update `FriggApiAdapter.js` for `/api/entities` | done | Updated entity endpoints |
| Add entity types methods | done | listEntityTypes, getEntityType, getEntityTypeRequirements |
| Add re-authorize methods | done | reauthorizeCredential, getCredentialReauthorizeRequirements |
| Remove `/api/modules` calls | done | Removed (never published) |
| Add proxy method | done | proxyEntityRequest |

### 5.2 Use Cases / Hooks
**Files**: `packages/ui/lib/integration/application/*`

| Task | Status | Notes |
|------|--------|-------|
| Update `InstallIntegrationUseCase` | skipped | Works with /api/authorize |
| Add `ReauthorizeEntityUseCase` | skipped | Can use adapter directly |
| Update hooks | skipped | Hooks use adapter methods |

### 5.3 Components
**Files**: `packages/ui/lib/integration/presentation/*`

| Task | Status | Notes |
|------|--------|-------|
| Update `AuthorizationWizard` | skipped | Still works with /api/authorize |
| Add re-auth UI flow | skipped | Can be added as needed |
| Update entity display for auth status | skipped | Can be added as needed |

---

## Phase 6: Testing & Cleanup

### 6.1 Integration Tests
| Task | Status | Notes |
|------|--------|-------|
| Test full authorization flow with new endpoints | done | entity-types-router.test.js (55 tests) |
| Test re-authorization flow | done | credentials-router.test.js (22 tests) |
| Test proxy endpoint | done | proxy-router.test.js (102 tests) |
| Test credential CRUD | done | credentials-router.test.js |

### 6.2 Cleanup & Refactoring
| Task | Status | Notes |
|------|--------|-------|
| Remove dead code from router | done | Deleted module-endpoints.test.js |
| Update CLAUDE.md documentation | skipped | No router-specific changes needed |
| Update README files | skipped | No changes needed |
| Review for DDD/hexagonal compliance | done | Uses use cases, repositories, proper separation |

---

## Key Flows & Behaviors

### Authorization Flow (New Connection)
```
1. GET /api/entities/types                    → List available types
2. GET /api/entities/types/:typeName          → Get type metadata
3. GET /api/entities/types/:typeName/requirements?step=1  → Get auth requirements
4. [User completes OAuth or fills form]
5. POST /api/authorize { entityType, data }   → Creates Credential + Entity
   - For 1:1 flows: Returns { credential_id, entity_id }
   - For 1:many flows: Returns { credential_id }, user then calls:
6. POST /api/entities { entityType, data: { credential_id } }  → Creates Entity
```

### Re-authorization Flow (Fixing Invalid Credential)
```
1. GET /api/entities/:entityId                → Shows authIsValid: false
   OR
   GET /api/credentials/:credentialId         → Shows authIsValid: false

2. GET /api/entities/:entityId/reauthorize    → Get auth requirements for THIS entity
   OR
   GET /api/credentials/:credentialId/reauthorize

3. [User completes OAuth or fills form]

4. POST /api/entities/:entityId/reauthorize { data }  → Updates the linked credential
   OR
   POST /api/credentials/:credentialId/reauthorize { data }

5. Credential tokens updated, authIsValid reset to true
```

### Multiple Connections of Same Type
**Problem**: User wants two HubSpot accounts connected.

**Solution**: Each `POST /api/authorize` with different OAuth accounts creates a NEW credential+entity pair (matched by externalId from the OAuth response).

```
1. POST /api/authorize { entityType: "hubspot", data: { code: "abc" } }
   → Creates Credential A (externalId: "hub-account-1") + Entity A

2. POST /api/authorize { entityType: "hubspot", data: { code: "xyz" } }
   → Creates Credential B (externalId: "hub-account-2") + Entity B
```

**Re-auth for specific connection**: Use `/api/entities/:entityId/reauthorize` to target the SPECIFIC entity/credential, not just match by type.

### Credential to Entity Relationships

**1:1 (Most Common)**
- One credential, one entity
- Re-auth via entity OR credential - same effect

**1:Many (Workspace/Organization APIs)**
- One credential (OAuth tokens for user)
- Multiple entities (different workspaces/projects)
- Re-auth via CREDENTIAL updates all entities at once

```
Credential (tokens for "john@company.com")
  ├── Entity: Workspace A
  ├── Entity: Workspace B
  └── Entity: Workspace C
```

### Proxy Endpoint Behavior
```
POST /api/entities/:entityId/proxy
{
  "method": "GET",
  "path": "/v3/contacts",
  "query": { "limit": "100" },
  "headers": {},
  "body": null
}

→ Frigg:
  1. Loads entity + credential
  2. Instantiates API class with credential
  3. Calls api._request(baseUrl + path, { method, query, headers, body })
  4. Returns wrapped response

Response:
{
  "success": true,
  "status": 200,
  "headers": { "content-type": "application/json", "x-ratelimit-remaining": "99" },
  "data": { "results": [...], "paging": {...} }
}
```

**Error Response**:
```json
{
  "success": false,
  "status": 401,
  "error": {
    "code": "INVALID_AUTH",
    "message": "Token expired or revoked"
  }
}
```

### Auth Status Visibility
Entities and credentials should expose `authIsValid` in list/get responses:

```json
// GET /api/entities
{
  "entities": [
    {
      "id": "ent_123",
      "type": "hubspot",
      "name": "HubSpot - Main Account",
      "authIsValid": true,
      "credentialId": "cred_456"
    },
    {
      "id": "ent_789",
      "type": "salesforce",
      "name": "Salesforce - Production",
      "authIsValid": false,  // ← Needs re-auth!
      "credentialId": "cred_012"
    }
  ]
}
```

```json
// GET /api/credentials
{
  "credentials": [
    {
      "id": "cred_456",
      "type": "hubspot",
      "externalId": "hub-12345",
      "authIsValid": true,
      "entityCount": 1
    },
    {
      "id": "cred_012",
      "type": "salesforce",
      "externalId": "sf-67890",
      "authIsValid": false,  // ← Needs re-auth!
      "entityCount": 1
    }
  ]
}
```

---

## Implementation Order (Schema-First Approach)

**Philosophy**: Build schemas and OpenAPI spec FIRST, then implement against them. Run validation after each change - like TypeScript for APIs.

### Step 0: Schema & OpenAPI Foundation
| Order | Task | Validation |
|-------|------|------------|
| 0.1 | Create `api-entities.schema.json` | `npm run validate` in packages/schemas |
| 0.2 | Create `api-credentials.schema.json` | `npm run validate` |
| 0.3 | Create `api-proxy.schema.json` | `npm run validate` |
| 0.4 | Update `api-authorization.schema.json` (remove /modules refs) | `npm run validate` |
| 0.5 | Create `packages/core/openapi/openapi.yaml` referencing schemas | Validate with spectral or similar |
| 0.6 | Add schema validation middleware/tests | Ensure requests/responses conform |

### Step 1: Quick Wins (Remove/Consolidate)
| Order | Task | Validation |
|-------|------|------------|
| 1.1 | Remove `/api/modules/*` endpoints | Existing tests pass, no schema refs to /modules |
| 1.2 | Consolidate `/api/entity` → `/api/entities` | Tests + OpenAPI spec alignment |

### Step 2: Credentials Router (TDD against schemas)
| Order | Task | Validation |
|-------|------|------------|
| 2.1 | Write tests for `findCredentialsByUserId` | Tests fail (TDD red) |
| 2.2 | Implement repository method | Tests pass (TDD green) |
| 2.3 | Write tests for credential use cases | Tests fail |
| 2.4 | Implement use cases | Tests pass |
| 2.5 | Write tests for `/api/credentials` endpoints | Tests fail |
| 2.6 | Implement endpoints | Tests pass + responses match schema |

### Step 3: Entity Types & Reauthorize (TDD against schemas)
| Order | Task | Validation |
|-------|------|------------|
| 3.1 | Write tests for `/api/entities/types/*` | Tests fail |
| 3.2 | Implement entity types endpoints | Tests pass + schema validation |
| 3.3 | Write tests for `/api/entities/:id/reauthorize` | Tests fail |
| 3.4 | Implement reauthorize endpoints | Tests pass + schema validation |
| 3.5 | Write tests for `/api/credentials/:id/reauthorize` | Tests fail |
| 3.6 | Implement credential reauthorize | Tests pass + schema validation |

### Step 4: Proxy Endpoints (TDD against schemas)
| Order | Task | Validation |
|-------|------|------------|
| 4.1 | Write tests for proxy use case | Tests fail |
| 4.2 | Implement `ProxyEntityRequest` use case | Tests pass |
| 4.3 | Write tests for `/api/entities/:id/proxy` | Tests fail |
| 4.4 | Implement entity proxy endpoint | Tests pass + schema validation |
| 4.5 | Implement `/api/credentials/:id/proxy` | Tests pass + schema validation |

### Step 5: Documentation & UI
| Order | Task | Validation |
|-------|------|------------|
| 5.1 | Add Scalar UI route | Manual verification |
| 5.2 | Update management-ui | E2E or manual testing |
| 5.3 | Update @friggframework/ui | Unit tests + manual |

### Step 6: Final Validation
| Order | Task | Validation |
|-------|------|------------|
| 6.1 | Full integration test suite | All tests pass |
| 6.2 | OpenAPI spec completeness check | All endpoints documented |
| 6.3 | Schema coverage check | All request/response types have schemas |
| 6.4 | Cleanup dead code | No unused imports/exports |

---

## Schema Validation Strategy

### Request Validation
```javascript
// In router, validate incoming requests against schema
const { validateRequest } = require('@friggframework/schemas');

router.post('/api/credentials/:id/reauthorize',
  validateRequest('reauthorizeCredentialRequest'),
  catchAsyncError(async (req, res) => {
    // Handler code - request already validated
  })
);
```

### Response Validation (Test-Time)
```javascript
// In tests, validate responses match schema
const { validateResponse } = require('@friggframework/schemas');

test('GET /api/credentials returns valid response', async () => {
  const res = await request(app).get('/api/credentials');

  expect(res.status).toBe(200);
  expect(validateResponse('listCredentialsResponse', res.body)).toBe(true);
});
```

### OpenAPI References Schemas
```yaml
# openapi.yaml
components:
  schemas:
    Credential:
      $ref: '../packages/schemas/schemas/api-credentials.schema.json#/definitions/credential'

paths:
  /api/credentials:
    get:
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListCredentialsResponse'
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-11-24 | Drop `/api/modules/*` | Redundant with entities/authorize endpoints |
| 2024-11-24 | Use `/api/entities/types/:name/requirements` | RESTful nested resource pattern |
| 2024-11-24 | Support re-auth on both entity and credential | 1:1 vs 1:many credential scenarios |
| 2024-11-24 | Start proxy with raw request only | Keep simple, add method invocation later if needed |
| 2024-11-24 | Credentials router in same file initially | Avoid premature file splitting |

---

## Open Questions

1. Should we version the API (`/api/v2/entities`) or just make breaking changes?
   - **Current answer**: No versioning, coordinate with Quo on breaking changes

2. Should `/api/authorize` be deprecated in favor of `/api/entities/types/:name/requirements`?
   - **Current answer**: Keep both for now, `/api/authorize` is the "create new" flow

3. Where should the proxy endpoint live - entities router or separate?
   - **Current answer**: In entities router for now

---

## Files Changed Summary

### Core Package
- `packages/core/integrations/integration-router.js` - Major changes
- `packages/core/credential/repositories/credential-repository-interface.js` - Add method
- `packages/core/credential/repositories/credential-repository-mongo.js` - Add method
- `packages/core/credential/repositories/credential-repository-postgres.js` - Add method
- `packages/core/credential/repositories/credential-repository-documentdb.js` - Add method
- `packages/core/credential/use-cases/list-credentials-for-user.js` - New
- `packages/core/credential/use-cases/delete-credential-for-user.js` - New
- `packages/core/credential/use-cases/reauthorize-credential.js` - New
- `packages/core/modules/use-cases/get-entity-types.js` - New
- `packages/core/modules/use-cases/proxy-entity-request.js` - New
- `packages/core/openapi/openapi.yaml` - New

### Schemas Package
- `packages/schemas/schemas/api-entities.schema.json` - New
- `packages/schemas/schemas/api-credentials.schema.json` - New
- `packages/schemas/schemas/api-proxy.schema.json` - New

### DevTools Package
- `packages/devtools/management-ui/src/infrastructure/adapters/FriggApiAdapter.js` - Update
- Various UI components - Update

### UI Package
- `packages/ui/lib/integration/infrastructure/adapters/FriggApiAdapter.js` - Update
- Various components - Update
