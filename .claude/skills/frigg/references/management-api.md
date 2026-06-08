# Frigg Management API Reference

HTTP endpoints, authentication, and provisioning workflows for a deployed Frigg application.

## Table of Contents

- [Authentication — choosing a method](#authentication--choosing-a-method)
- [Setup](#setup)
- [End-to-End Provisioning Workflow](#end-to-end-provisioning-workflow)
- [User Management](#user-management)
- [Health & Status Endpoints](#health--status-endpoints)
- [Authorization & Entity Endpoints](#authorization--entity-endpoints)
- [Integration Management Endpoints](#integration-management-endpoints)
- [Database Migration Endpoints](#database-migration-endpoints)
- [OAuth Redirect Endpoint](#oauth-redirect-endpoint)
- [Common Response Codes](#common-response-codes)

## Authentication — choosing a method

Frigg supports two auth methods. **Which one to use is determined by whether a Frigg Management UI (with end-user accounts) is in front of the API:**

| Scenario | Method | Headers |
| --- | --- | --- |
| **Backend talks to Frigg directly** (no UI) — server-to-server, automated scripts, CI/CD, OAuth redirect handlers | **Shared secret (x-frigg headers)** — the default for backend integrations | `x-frigg-api-key`, `x-frigg-appuserid`, `x-frigg-apporgid` |
| **A Frigg Management UI / end-user accounts exist** — users log in (web, mobile, dashboards) | **JWT bearer** — only used when there's a UI | `Authorization: Bearer <token>` |

> Rule of thumb: **no UI → x-frigg headers; UI with user login → JWT.** Most backend-to-backend integrations use the x-frigg headers; user/password + JWT is for when Frigg's own UI is the front end.

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

`FRIGG_APP_API_KEY` must be set in the Frigg deployment for x-frigg header auth to work. Per-module credentials (e.g. an API key for an API-key module) are supplied when authorizing each entity, below.

## End-to-End Provisioning Workflow

Provisioning an integration without the UI (backend, x-frigg headers):

1. **Authenticate** — set the x-frigg headers (no login step). *(UI path instead: `POST /user/create` or `/user/login` → use the returned JWT.)*
2. **Get auth requirements** — `GET /api/authorize?entityType=<module>` → returns an `apiKey` JSON schema or an `oauth2` URL.
3. **Create the entity** — API-key module: `POST /api/authorize` with the credentials. OAuth module: open the returned `url`, the user authorizes, Frigg creates the entity on redirect.
4. **Create the integration** — `POST /api/integrations` with `entities` (array of entity IDs) + `config.type` (selects the integration class).
5. **Trigger initial sync** — `POST /api/integrations/{id}/actions/INITIAL_SYNC`.
6. **Verify** — `GET /api/integrations`.

Example (backend, x-frigg headers) — authorize an API-key entity then create the integration:

```bash
# Get auth requirements
curl -X GET "${FRIGG_URL}/api/authorize?entityType=<module>" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}"

# Create entity (API-key module)
curl -X POST "${FRIGG_URL}/api/authorize" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entityType": "<module>", "data": { "apiKey": "'"${MODULE_API_KEY}"'" } }'
# -> { "entity_id": "7", "credential_id": "12", "entityType": "<module>" }

# Create integration from two entities
curl -X POST "${FRIGG_URL}/api/integrations" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entities": ["3", "4"], "config": { "type": "<integration-type>" } }'
```

The same calls with a UI/JWT setup swap the three `x-frigg-*` headers for a single `-H "Authorization: Bearer ${FRIGG_JWT_TOKEN}"`.

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

GET /health/live    # Kubernetes liveness probe
Response (200): { "alive": true, "timestamp": "..." }

GET /health/ready   # Kubernetes readiness probe (503 if not ready)
Response (200): { "ready": true, "checks": { "database": true, "modules": true } }
```

## Authorization & Entity Endpoints

Authenticate with **either** the x-frigg headers or `Authorization: Bearer` (see [Authentication](#authentication--choosing-a-method)); examples below show `Bearer` for brevity.

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
Response (200): { "status": "ok" }
Response (400): { "errors": [{ "title": "Authentication Error", "message": "...", "timestamp": 1642512000000 }] }

# Get entity details
GET /api/entities/${ENTITY_ID}
Authorization: Bearer ${TOKEN}
Response (200): { "id": "7", "type": "hubspot", "credential": {...}, "details": {...} }

# Get entity options by ID
POST /api/entities/${ENTITY_ID}/options
Authorization: Bearer ${TOKEN}
Body: { "optionType": "contacts" }
Response (200): { "options": [...] }

# Refresh entity options
POST /api/entities/${ENTITY_ID}/options/refresh
Authorization: Bearer ${TOKEN}
Body: { "forceRefresh": true }
Response (200): { "options": [...], "refreshed": true }
```

## Integration Management Endpoints

`config.type` selects the integration class. `entities` must be an **array of entity IDs**, not an object.

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

# Get integration details
GET /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}
Response (200): { "id": "16", "entities": ["7","11"], "status": "ENABLED", "config": {"type":"attio"} }

# Update integration
PATCH /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}
Body: { "config": { "syncDirection": "unidirectional", "autoSync": true } }
Response (200): { "id": "16", "config": { "type": "attio", "syncDirection": "unidirectional", "autoSync": true } }

# Delete integration
DELETE /api/integrations/${INTEGRATION_ID}
Authorization: Bearer ${TOKEN}
Response (204): {}

# Test integration authentication
GET /api/integrations/${INTEGRATION_ID}/test-auth
Authorization: Bearer ${TOKEN}
Response (200): { "status": "ok" }   # or 400 with { "errors": [{...}] }

# Get / refresh integration config options
GET  /api/integrations/${INTEGRATION_ID}/config/options
POST /api/integrations/${INTEGRATION_ID}/config/options/refresh   # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [ { "key": "syncDirection", "type": "select", "options": ["bidirectional","unidirectional"] } ] }

# Get integration actions
GET  /api/integrations/${INTEGRATION_ID}/actions
POST /api/integrations/${INTEGRATION_ID}/actions
Authorization: Bearer ${TOKEN}
Response (200): { "actions": [ { "id": "INITIAL_SYNC", "label": "Initial Sync", "description": "Perform initial data synchronization" } ] }

# Get / refresh action options
GET  /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options/refresh   # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [...] }

# Execute integration action
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}
Authorization: Bearer ${TOKEN}
Body: { "parameters": {...} }
Response (200): { "message": "Initial sync started", "processIds": ["36"], "clientObjectTypes": ["clients"] }
# Common actions: INITIAL_SYNC (trigger initial data sync), SYNC_NOW (force immediate sync), REFRESH_SCHEMA (refresh integration schema)
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
# If pending: { "upToDate": false, "pendingMigrations": 3, "recommendation": "Run POST /admin/db-migrate to apply pending migrations" }

# Get migration details
GET /admin/db-migrate/${MIGRATION_ID}?stage=production
x-frigg-admin-api-key: ${ADMIN_API_KEY}
Response (200): { "processId": "mig-1642512000-abc123", "type": "DATABASE_MIGRATION", "state": "COMPLETED",
  "context": { "dbType": "postgresql", "stage": "production", "migrationCommand": "prisma migrate deploy" },
  "results": { "success": true, "duration": "2.5s" }, "createdAt": "...", "updatedAt": "..." }
```

## OAuth Redirect Endpoint

```bash
GET /api/integrations/redirect/${APP_ID}?code=...&state=...
# Redirects to: ${FRONTEND_URI}/redirect/${APP_ID}?code=...&state=...
# Used for OAuth callback handling after third-party authorization
```

## Common Response Codes

- **200 OK** — successful request
- **201 Created** — resource successfully created
- **202 Accepted** — request accepted, processing asynchronously
- **204 No Content** — successful deletion
- **400 Bad Request** — invalid request parameters
- **401 Unauthorized** — missing or invalid authentication
- **403 Forbidden** — insufficient permissions
- **404 Not Found** — resource not found
- **500 Internal Server Error** — server error
- **503 Service Unavailable** — service not ready (health checks)
