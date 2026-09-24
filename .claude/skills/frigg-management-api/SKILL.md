---
name: frigg-management-api
description: "Authenticating to and calling a deployed Frigg application's Management HTTP API. Covers the two auth methods — x-frigg headers (x-frigg-api-key / x-frigg-appuserid / x-frigg-apporgid) for backend-to-backend when there is no Frigg UI, and JWT user/password only when a Frigg Management UI exists — plus base-URL/env setup and the endpoint reference (user management, health, authorization/entities, integrations CRUD, database migration, OAuth redirect, response codes). Use when a backend or script calls a running Frigg instance, when choosing a Frigg auth method, or when debugging Management API auth. To provision an integration and run its actions end-to-end, see the frigg-user-actions skill."
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

## Authorization & Entity Endpoints

Authenticate with **either** the x-frigg headers or `Authorization: Bearer` (examples show `Bearer` for brevity). Creating entities is step 1–3 of the provisioning runbook in **frigg-user-actions**.

```bash
# Get authorization requirements — API-Key module
GET /api/authorize?entityType=quo
Authorization: Bearer ${TOKEN}
Response (200): { "type": "apiKey", "jsonSchema": { "type": "object",
  "properties": { "apiKey": { "type": "string", "title": "API Key" } }, "required": ["apiKey"] } }

# Get authorization requirements — OAuth module
GET /api/authorize?entityType=attio
Authorization: Bearer ${TOKEN}
Response (200): { "type": "oauth2", "url": "https://app.attio.com/authorize?client_id=...&redirect_uri=...&scope=...&state=..." }

# Submit authorization (create entity) — API-Key module
POST /api/authorize
Authorization: Bearer ${TOKEN}
Body: { "entityType": "quo", "data": { "apiKey": "your-api-key" } }
Response (200): { "entity_id": "7", "credential_id": "12", "entityType": "quo" }
# OAuth modules instead: open the returned `url`; Frigg creates the entity on redirect callback.

# Create entity from existing credential
POST /api/entity
Authorization: Bearer ${TOKEN}
Body: { "entityType": "hubspot", "data": { "credential_id": "12" } }
Response (200): { "id": "15", "type": "hubspot", "details": {...} }

# Get entity options
GET /api/entity/options/${CREDENTIAL_ID}?entityType=hubspot
Authorization: Bearer ${TOKEN}
Response (200): { "options": [...], "entityType": "hubspot" }

# Test entity authentication
GET /api/entities/${ENTITY_ID}/test-auth
Authorization: Bearer ${TOKEN}
Response (200): { "status": "ok" }   # or 400 with { "errors": [{ "title": "Authentication Error", ... }] }

# Get entity details
GET /api/entities/${ENTITY_ID}
Authorization: Bearer ${TOKEN}
Response (200): { "id": "7", "type": "hubspot", "credential": {...}, "details": {...} }

# Get / refresh entity options by ID
POST /api/entities/${ENTITY_ID}/options                  # Body: { "optionType": "contacts" }
POST /api/entities/${ENTITY_ID}/options/refresh          # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [...] }
```

## Integration Management Endpoints

`config.type` selects the integration class. `entities` must be an **array of entity IDs**, not an object. For triggering integration **actions** (INITIAL_SYNC, etc.), see **frigg-user-actions**.

```bash
# List integrations
GET /api/integrations
Authorization: Bearer ${TOKEN}
Response (200): {
  "entities": { "options": [...], "authorized": [...] },
  "integrations": [ { "id": "16", "entities": ["7","11"], "status": "ENABLED", "config": {"type":"axiscare"} } ]
}

# Create integration
POST /api/integrations
Authorization: Bearer ${TOKEN}
Body: { "entities": ["7","11"], "config": { "type": "attio" } }
Response (201): { "id": "16", "entities": ["7","11"], "status": "ENABLED", "config": {"type":"attio"} }

# Get / update / delete integration
GET    /api/integrations/${INTEGRATION_ID}                      → 200 { "id": "16", ... }
PATCH  /api/integrations/${INTEGRATION_ID}                      Body: { "config": { "syncDirection": "unidirectional", "autoSync": true } }
DELETE /api/integrations/${INTEGRATION_ID}                      → 204
Authorization: Bearer ${TOKEN}

# Test integration authentication
GET /api/integrations/${INTEGRATION_ID}/test-auth
Authorization: Bearer ${TOKEN}
Response (200): { "status": "ok" }   # or 400 with { "errors": [{...}] }

# Get / refresh integration config options
GET  /api/integrations/${INTEGRATION_ID}/config/options
POST /api/integrations/${INTEGRATION_ID}/config/options/refresh   # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [ { "key": "syncDirection", "type": "select", "options": ["bidirectional","unidirectional"] } ] }
```

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

- **200 OK** — successful request
- **201 Created** — resource created
- **202 Accepted** — accepted, processing asynchronously
- **204 No Content** — successful deletion
- **400 Bad Request** — invalid parameters
- **401 Unauthorized** — missing/invalid authentication
- **403 Forbidden** — insufficient permissions
- **404 Not Found** — resource not found
- **500 Internal Server Error** — server error
- **503 Service Unavailable** — service not ready (health checks)
