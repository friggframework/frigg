---
name: frigg-management-api
description: "Authenticating to and calling a deployed Frigg application's Management HTTP API. Covers API versions (v2 under /api/v2, deprecated v1 at unprefixed /api, GET /api/meta discovery), the two auth methods — x-frigg headers (x-frigg-api-key / x-frigg-appuserid / x-frigg-apporgid) for backend-to-backend when there is no Frigg UI, and JWT user/password only when a Frigg Management UI exists — plus base-URL/env setup and the endpoint reference (user management, health, v2 integrations, entities, entity types, credentials, multi-step authorize, entity proxy, v1 legacy routes, database migration, OAuth redirect, error format). Use when a backend or script calls a running Frigg instance, when choosing a Frigg auth method, or when debugging Management API auth. To provision an integration and run its actions end-to-end, see the frigg-user-actions skill."
---

# Frigg Management API

HTTP endpoints and authentication for a **deployed** Frigg application. For the end-to-end "create entities → create integration → run an action" runbook, see the **frigg-user-actions** skill.

## Authentication — choosing a method

Two methods. **Which one to use is determined by whether a Frigg Management UI (with end-user accounts) is in front of the API:**

| Scenario | Method | Headers |
| --- | --- | --- |
| **Backend talks to Frigg directly** (no UI) — server-to-server, scripts, CI/CD, OAuth redirect handlers | **Shared secret (x-frigg headers)** — the default for backend integrations | `x-frigg-api-key`, `x-frigg-appuserid`, `x-frigg-apporgid` |
| **A Frigg Management UI / end-user accounts exist** — users log in (web, mobile, dashboards) | **JWT bearer** — only used when there's a UI | `Authorization: Bearer <token>` |

> Rule of thumb: **no UI → x-frigg headers; UI with user login → JWT.**

### Shared secret (x-frigg headers) — backend-to-backend

```bash
x-frigg-api-key:   ${FRIGG_API_KEY}        # the shared secret (FRIGG_APP_API_KEY in the deployment)
x-frigg-appuserid: ${FRIGG_APP_USER_ID}    # identifies which app user owns the entities/integrations
x-frigg-apporgid:  ${FRIGG_APP_ORG_ID}     # ONLY required if organizationUserRequired: true in app config
```

No login step — the backend authenticates every request with these headers. The shared-secret value comes from the administrator who deployed the Frigg instance.

### JWT bearer — only when a Frigg UI is available

End users create an account / log in (via `/user/create` or `/user/login`, normally through the Frigg UI) to obtain a token, then send it on every request:

```bash
Authorization: Bearer ${FRIGG_JWT_TOKEN}
```

Every authenticated endpoint below accepts **either** method — substitute the header block accordingly.

## Setup

```bash
# Base URL
export FRIGG_URL="http://localhost:3001"                                   # local
export FRIGG_URL="https://<id>.execute-api.us-east-1.amazonaws.com"        # deployed

# Backend-to-backend (x-frigg headers)
export FRIGG_API_KEY="your-shared-secret"        # must match FRIGG_APP_API_KEY in the deployment
export FRIGG_APP_USER_ID="your-user-identifier"
export FRIGG_APP_ORG_ID="your-org-identifier"    # only if organizationUserRequired: true
```

`FRIGG_APP_API_KEY` must be set in the Frigg deployment for x-frigg header auth to work. Per-module credentials (e.g. an API key for an API-key module) are supplied when authorizing each entity.

## User Management

Used by the **JWT/UI path** to mint tokens (no-UI backends use x-frigg headers instead and skip this).

```bash
POST /user/create
Content-Type: application/json
Body: { "username": "user@example.com", "password": "securePassword123" }
Response (201): { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }

POST /user/login
Content-Type: application/json
Body: { "username": "user@example.com", "password": "securePassword123" }
Response (200): { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

## Health & Status Endpoints

```bash
GET /health
Response (200): { "status": "healthy", "timestamp": "2025-01-18T12:00:00.000Z" }

GET /health/detailed
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Response (200): {
  "status": "healthy",
  "checks": {
    "database":   { "status": "connected", "responseTime": 15, "state": "connected" },
    "encryption": { "status": "enabled", "method": "kms", "testResult": "Encryption and decryption verified successfully" },
    "modules":    { "status": "loaded", "count": 3 }
  }
}

GET /health/live    # Kubernetes liveness probe → { "alive": true, ... }
GET /health/ready   # Kubernetes readiness probe (503 if not ready) → { "ready": true, "checks": { "database": true, "modules": true } }
```

## API versions — start with `GET /api/meta`

The Management API is versioned by path (ADR-053):

- **v2** — everything under `/api/v2/*`. Use it for all new work.
- **v1** — the unprefixed `/api/*` routes. Deprecated and frozen; responses carry `Deprecation` and `Link: <…>; rel="deprecation"` headers. An app may switch it off (`managementApi: { v1: false }` → 410).

```bash
GET /api/meta            # no auth, no database
Response (200): {
  "api": { "versions": { "1": { "status": "deprecated", "openapi": "/api/meta/openapi/v1.json", ... },
                         "2": { "status": "stable",     "openapi": "/api/meta/openapi/v2.json" } },
           "preferred": "2" },
  "capabilities": ["credentials", "multiStepAuthorize"]     # + "entityProxy" when the app enables it
}
# 404 → the app runs core < 2.0.1 and serves v1 only (see "v1 legacy endpoints" below).
GET /api/meta/openapi/v2.json   # full OpenAPI 3 document for v2
```

v2 conventions: every route takes either auth method; missing and not-yours are both `404`; errors are `{ "error": { "code", "message", "details"? } }`; responses carry `Frigg-API-Version: 2`; ignore unknown fields.

## Authorization & Entity Endpoints (v2)

Authenticate with **either** the x-frigg headers or `Authorization: Bearer` (examples show `Bearer` for brevity). Creating entities is step 1–3 of the provisioning runbook in **frigg-user-actions**.

```bash
# What can this app connect?
GET /api/v2/entities/types
Response (200): { "types": [ { "type": "attio", "name": "attio", "authType": "oauth2", "isMultiStep": false, "stepCount": 1 } ] }

# Start an authorization — OAuth module
GET /api/v2/authorize?entityType=attio
Response (200): { "type": "oauth2", "data": { "url": "https://app.attio.com/authorize?..." }, "step": 1, "totalSteps": 1, "isMultiStep": false }
# Open data.url; Frigg completes the flow on the redirect callback (POST /api/v2/authorize with the code).

# Start an authorization — API-key module
GET /api/v2/authorize?entityType=quo
Response (200): { "type": "api-key", "data": { "jsonSchema": {...}, "uiSchema": {...} }, "step": 1, "totalSteps": 1, "isMultiStep": false }

# Submit (single-step modules complete at once)
POST /api/v2/authorize
Body: { "entityType": "quo", "data": { "apiKey": "your-api-key" } }
Response (200): { "status": "complete",
                  "entity":     { "id": "7", "type": "quo", "credentialId": "12", ... },
                  "credential": { "id": "12", "type": "quo", "data": { "apiKey": "****" }, ... } }

# Multi-step modules (e.g. email → one-time code): keep the sessionId
GET  /api/v2/authorize?entityType=acme            → { ..., "step": 1, "totalSteps": 2, "sessionId": "S" }
POST /api/v2/authorize  { "entityType": "acme", "step": 1, "sessionId": "S", "data": { "email": "..." } }
  → { "status": "pending", "step": 2, "totalSteps": 2, "sessionId": "S", "requirements": {...}, "message": "Code sent" }
POST /api/v2/authorize  { "entityType": "acme", "step": 2, "sessionId": "S", "data": { "otp": "123456" } }
  → { "status": "complete", "entity": {...}, "credential": {...} }
# Errors: 404 AUTHORIZATION_SESSION_NOT_FOUND, 409 STEP_OUT_OF_ORDER, 400 SESSION_REQUIRED, 400 AUTHORIZATION_FAILED.

# Entities
GET    /api/v2/entities                            → { "entities": [ { "id", "type", "name", "externalId", "credentialId", "userId", "authIsValid" } ] }
GET    /api/v2/entities/${ENTITY_ID}
GET    /api/v2/entities/${ENTITY_ID}/test-auth     → { "status": "ok" } or { "status": "failed" }
GET    /api/v2/entities/${ENTITY_ID}/options
POST   /api/v2/entities/${ENTITY_ID}/options/refresh
DELETE /api/v2/entities/${ENTITY_ID}               → 204 (409 ENTITY_IN_USE while integrations use it)

# Credentials — secrets are always masked
GET    /api/v2/credentials                         → { "credentials": [ { "id", "type", "authIsValid", "entityIds", "data": { "access_token": "****WXYZ" } } ] }
GET    /api/v2/credentials/${CREDENTIAL_ID}
DELETE /api/v2/credentials/${CREDENTIAL_ID}        → 204 (its entities keep existing, with no credential)
GET    /api/v2/credentials/${CREDENTIAL_ID}/reauthorize        # same flow as /api/v2/authorize
POST   /api/v2/credentials/${CREDENTIAL_ID}/reauthorize        Body: { "data": {...}, "step"?, "sessionId"? }
```

### Entity proxy (beta, only when `entityProxy` is in `/api/meta` capabilities)

```bash
POST /api/v2/entities/${ENTITY_ID}/proxy
Body: { "method": "GET", "path": "/crm/v3/objects/contacts", "query": { "limit": 10 } }
Response (status mirrors upstream): { "success": true, "status": 200, "headers": {...}, "data": {...} }
```

`path` is relative to the module's API (no hosts, `//`, `..`, `?`). Only operations in the module's `proxy.allow` list (or the app's override) pass: otherwise `403 PROXY_NOT_ALLOWED`. Upstream 5xx → `502 UPSTREAM_ERROR`, 429 → 429 with `Retry-After`, timeout → `504`.

## Integration Management Endpoints (v2)

`config.type` selects the integration class. `entities` must be an **array of entity IDs** the caller owns. For triggering integration **actions** (INITIAL_SYNC, etc.), see **frigg-user-actions**.

```bash
GET  /api/v2/integrations                 → { "integrations": [ { "id": "16", "entities": ["7","11"], "status": "ENABLED", "config": {"type":"attio"} } ] }
GET  /api/v2/integrations/options         → { "integrations": [ ...integration types this app offers... ] }
POST /api/v2/integrations                 Body: { "entities": ["7","11"], "config": { "type": "attio" } }  → 201
GET    /api/v2/integrations/${INTEGRATION_ID}
PATCH  /api/v2/integrations/${INTEGRATION_ID}   Body: { "config": {...} }
DELETE /api/v2/integrations/${INTEGRATION_ID}   → 204
GET  /api/v2/integrations/${INTEGRATION_ID}/test-auth      → { "status": "ok" } or { "status": "failed", "errors": [...] }
GET  /api/v2/integrations/${INTEGRATION_ID}/config/options
POST /api/v2/integrations/${INTEGRATION_ID}/config/options/refresh
```

## v1 legacy endpoints (deprecated)

Use only against apps on core < 2.0.1 (where `GET /api/meta` is 404). Same auth.

| v1 | v2 replacement |
| --- | --- |
| `GET /api/integrations` → `{ entities: { options, authorized }, integrations }` | `GET /api/v2/integrations` + `/api/v2/integrations/options` + `/api/v2/entities` |
| `POST /api/integrations`, `GET/PATCH/DELETE /api/integrations/:id[/...]` | same under `/api/v2/integrations` |
| `GET /api/authorize?entityType=` → raw module requirements (`{ type, url }` or `{ type, jsonSchema }`) | `GET /api/v2/authorize` |
| `POST /api/authorize` → `{ entity_id, credential_id, type }` | `POST /api/v2/authorize` |
| `POST /api/entity`, `GET /api/entity/options/:credentialId` | `POST /api/v2/authorize`, `GET /api/v2/entities/:id/options` |
| `GET /api/entities/:id`, `/test-auth`, `POST /options`, `POST /options/refresh` | same under `/api/v2/entities` (options is GET) |

## Database Migration Endpoints

```bash
# Trigger database migration
POST /admin/db-migrate
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Body: { "userId": "admin", "dbType": "postgresql", "stage": "production" }
Response (202): { "success": true, "processId": "mig-1642512000-abc123", "state": "INITIALIZING",
  "statusUrl": "/admin/db-migrate/mig-1642512000-abc123", "message": "Migration job queued successfully" }

# Check migration status
GET /admin/db-migrate/status?stage=production
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Response (200): { "upToDate": true, "pendingMigrations": 0, "dbType": "postgresql", "stage": "production" }
# If pending: { "upToDate": false, "pendingMigrations": 3, "recommendation": "Run POST /admin/db-migrate ..." }

# Get migration details
GET /admin/db-migrate/${MIGRATION_ID}?stage=production
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Response (200): { "processId": "...", "type": "DATABASE_MIGRATION", "state": "COMPLETED",
  "context": { "dbType": "postgresql", "stage": "production", "migrationCommand": "prisma migrate deploy" },
  "results": { "success": true, "duration": "2.5s" } }
```

## OAuth Redirect Endpoint

```bash
GET /api/integrations/redirect/${APP_ID}?code=...&state=...
# Redirects to: ${FRONTEND_URI}/redirect/${APP_ID}?code=...&state=...
# Used for OAuth callback handling after third-party authorization
```

## Common Response Codes

v2 errors carry a machine-readable `error.code` (e.g. `VALIDATION_ERROR`, `ENTITY_NOT_FOUND`, `PROXY_NOT_ALLOWED`).

- **200 OK** — successful request
- **201 Created** — resource created
- **202 Accepted** — accepted, processing asynchronously
- **204 No Content** — successful deletion
- **400 Bad Request** — invalid parameters
- **401 Unauthorized** — missing/invalid authentication
- **403 Forbidden** — insufficient permissions (v2 proxy: not allow-listed)
- **409 Conflict** — conflicts with current state (entity in use, step out of order)
- **410 Gone** — v1 disabled by the app (`managementApi.v1: false`)
- **404 Not Found** — resource not found
- **500 Internal Server Error** — server error
- **502 / 504** — the provider failed or timed out (authorize, proxy)
- **503 Service Unavailable** — service not ready (health checks)
