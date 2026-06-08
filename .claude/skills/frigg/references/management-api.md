# Frigg Management API Endpoints Reference

Endpoints available in a deployed Frigg application.

## Table of Contents

- [Authentication Methods](#authentication-methods)
- [User Management](#user-management)
- [Health & Status Endpoints](#health--status-endpoints)
- [Authorization & Entity Endpoints](#authorization--entity-endpoints)
- [Integration Management Endpoints](#integration-management-endpoints)
- [Database Migration Endpoints](#database-migration-endpoints)
- [OAuth Redirect Endpoint](#oauth-redirect-endpoint)
- [Common Response Codes](#common-response-codes)

## Authentication Methods

**1. JWT Token Authentication (user-facing)** — for apps where users create accounts and authenticate:

```bash
Authorization: Bearer ${FRIGG_JWT_TOKEN}
```

**2. Shared Secret Authentication (backend-to-backend)** — for backend services, automated scripts, server-to-server:

```bash
x-frigg-api-key: ${FRIGG_API_KEY}
x-frigg-appuserid: ${FRIGG_APP_USER_ID}
```

## User Management

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

# Submit authorization (create entity)
POST /api/authorize
Authorization: Bearer ${TOKEN}
Body: { "entityType": "quo", "data": { "apiKey": "your-api-key" } }
Response (200): { "entity_id": "7", "credential_id": "12", "entityType": "quo" }

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
Response (200): { "message": "Initial sync started for AxisCare clients", "processIds": ["36"], "clientObjectTypes": ["clients"] }
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
