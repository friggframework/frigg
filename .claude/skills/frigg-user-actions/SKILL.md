---
name: frigg-user-actions
description: "Provisioning a Frigg integration and executing its actions end-to-end through the Management API: authorize modules to create entities, create the integration that links them, then trigger integration actions such as INITIAL_SYNC, SYNC_NOW, or REFRESH_SCHEMA. Use when setting up a live integration via the API, triggering a sync or other integration action, listing available actions, or following the entities → integration → action sequence. For the underlying auth methods and full endpoint reference, see the frigg-management-api skill."
---

# Frigg User Actions & Integration Provisioning

The runbook for getting an integration live and running its actions, via a deployed app's Management API. For auth methods (x-frigg headers vs JWT) and the full endpoint reference, see the **frigg-management-api** skill.

## End-to-End Provisioning Sequence

Provisioning without a UI (backend, x-frigg headers):

1. **Authenticate** — set the x-frigg headers (no login step). *(UI path instead: `POST /user/create` or `/user/login` → use the returned JWT.)*
2. **Get auth requirements** — `GET /api/authorize?entityType=<module>` → returns an `apiKey` JSON schema or an `oauth2` URL.
3. **Create the entity** — API-key module: `POST /api/authorize` with the credentials. OAuth module: open the returned `url`; the user authorizes; Frigg creates the entity on redirect.
4. **Create the integration** — `POST /api/integrations` with `entities` (array of entity IDs) + `config.type` (selects the integration class).
5. **Trigger an action** — `POST /api/integrations/{id}/actions/INITIAL_SYNC` (or another action).
6. **Verify** — `GET /api/integrations`.

### Worked example (backend, x-frigg headers)

```bash
# 2–3. Authorize an API-key module to create an entity
curl -X POST "${FRIGG_URL}/api/authorize" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entityType": "<module>", "data": { "apiKey": "'"${MODULE_API_KEY}"'" } }'
# -> { "entity_id": "7", "credential_id": "12", "entityType": "<module>" }

# 4. Create the integration from two entities
curl -X POST "${FRIGG_URL}/api/integrations" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entities": ["3", "4"], "config": { "type": "<integration-type>" } }'
# -> { "id": "16", "status": "ENABLED", "config": { "type": "<integration-type>" } }

# 5. Trigger the initial sync action
curl -X POST "${FRIGG_URL}/api/integrations/16/actions/INITIAL_SYNC" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{}'
# -> { "message": "Initial sync started", "processIds": ["36"], ... }
```

Swap the three `x-frigg-*` headers for a single `-H "Authorization: Bearer ${FRIGG_JWT_TOKEN}"` on a UI/JWT setup.

## Action Endpoints

```bash
# List available actions for an integration
GET  /api/integrations/${INTEGRATION_ID}/actions
POST /api/integrations/${INTEGRATION_ID}/actions
Authorization: Bearer ${TOKEN}
Response (200): { "actions": [ { "id": "INITIAL_SYNC", "label": "Initial Sync", "description": "Perform initial data synchronization" } ] }

# Get / refresh the options for a specific action
GET  /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options/refresh   # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [...] }

# Execute an action
POST /api/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}
Authorization: Bearer ${TOKEN}
Body: { "parameters": {...} }    # or {} when the action takes no parameters
Response (200): { "message": "Initial sync started", "processIds": ["36"], "clientObjectTypes": ["clients"] }
```

## Common Actions

| Action ID | Purpose |
| --- | --- |
| `INITIAL_SYNC` | Trigger the initial data synchronization after creating an integration |
| `SYNC_NOW` | Force an immediate sync |
| `REFRESH_SCHEMA` | Refresh the integration's schema |

Actions are defined by the integration class (`this.events` / event handlers). The action IDs above are common conventions; call `GET /api/integrations/{id}/actions` to discover what a given integration actually exposes.
