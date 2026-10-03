---
name: frigg-user-actions
description: "Provisioning a Frigg integration and executing its actions end-to-end through the Management API: authorize modules to create entities, create the integration that links them, then trigger integration actions such as INITIAL_SYNC, SYNC_NOW, or REFRESH_SCHEMA. Use when setting up a live integration via the API, triggering a sync or other integration action, listing available actions, or following the entities → integration → action sequence. For the underlying auth methods and full endpoint reference, see the frigg-management-api skill."
---

# Frigg User Actions & Integration Provisioning

The runbook for getting an integration live and running its actions, via a deployed app's Management API. For auth methods (x-frigg headers vs JWT) and the full endpoint reference, see the **frigg-management-api** skill.

## End-to-End Provisioning Sequence

Provisioning without a UI (backend, x-frigg headers):

0. **Check the API version** — `GET /api/meta` (no auth). If it lists version `"2"`, use the v2 paths below. A 404 means core < 2.0.1: use the v1 paths (drop `/v2`; see "v1 differences" at the end).
1. **Authenticate** — set the x-frigg headers (no login step). *(UI path instead: `POST /user/create` or `/user/login` → use the returned JWT.)*
2. **Get auth requirements** — `GET /api/v2/authorize?entityType=<module>` → `{ type, data, step, totalSteps, isMultiStep, sessionId? }`: a JSON schema in `data` for API-key/form modules, `data.url` for OAuth.
3. **Create the entity** — API-key module: `POST /api/v2/authorize` with the credentials → `{ status: "complete", entity, credential }`. Multi-step module: repeat with `step` + `sessionId` while the answer is `{ status: "pending" }`. OAuth module: open `data.url`; the user authorizes; Frigg creates the entity on redirect.
4. **Create the integration** — `POST /api/v2/integrations` with `entities` (array of entity IDs you own) + `config.type` (selects the integration class).
5. **Trigger an action** — `POST /api/v2/integrations/{id}/actions/INITIAL_SYNC` (or another user action).
6. **Verify** — `GET /api/v2/integrations`.

### Worked example (backend, x-frigg headers)

```bash
# 2–3. Authorize an API-key module to create an entity
curl -X POST "${FRIGG_URL}/api/v2/authorize" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entityType": "<module>", "data": { "apiKey": "'"${MODULE_API_KEY}"'" } }'
# -> { "status": "complete", "entity": { "id": "7", "type": "<module>", ... }, "credential": { "id": "12", ... } }

# 4. Create the integration from two entities
curl -X POST "${FRIGG_URL}/api/v2/integrations" \
  -H "x-frigg-api-key: ${FRIGG_API_KEY}" \
  -H "x-frigg-appuserid: ${FRIGG_APP_USER_ID}" \
  -H "x-frigg-apporgid: ${FRIGG_APP_ORG_ID}" \
  -H "Content-Type: application/json" \
  -d '{ "entities": ["3", "4"], "config": { "type": "<integration-type>" } }'
# -> { "id": "16", "status": "ENABLED", "config": { "type": "<integration-type>" } }

# 5. Trigger the initial sync action
curl -X POST "${FRIGG_URL}/api/v2/integrations/16/actions/INITIAL_SYNC" \
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
# List available actions for an integration (optionally ?actionType=...)
GET  /api/v2/integrations/${INTEGRATION_ID}/actions
Authorization: Bearer ${TOKEN}
Response (200): { "actions": [ { "id": "INITIAL_SYNC", "label": "Initial Sync", "description": "Perform initial data synchronization" } ] }

# Get / refresh the options for a specific action (body: the current form data)
POST /api/v2/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options
POST /api/v2/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}/options/refresh   # Body: { "forceRefresh": true }
Authorization: Bearer ${TOKEN}
Response (200): { "options": [...] }

# Execute an action (only ids the integration lists as user actions; others → 404 ACTION_NOT_FOUND)
POST /api/v2/integrations/${INTEGRATION_ID}/actions/${ACTION_ID}
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

Actions are defined by the integration class (`this.events` / event handlers). The action IDs above are common conventions; call `GET /api/v2/integrations/{id}/actions` to discover what a given integration actually exposes.

## v1 differences (core < 2.0.1, or apps still on v1)

The same sequence works on the deprecated unprefixed routes, with these differences:

- Paths drop `/v2`: `/api/authorize`, `/api/integrations`, `/api/integrations/{id}/actions/...`.
- `GET /api/authorize` returns the module's raw requirements (`{ "type": "oauth2", "url": ... }` or a JSON schema), and `POST /api/authorize` returns `{ "entity_id", "credential_id", "type" }`. No multi-step sessions.
- `GET /api/integrations` returns `{ "entities": { "options", "authorized" }, "integrations" }` in one response.
- Listing actions and getting action options accept any method (v1 uses `.all`); v1 also lets any event id through `POST .../actions/{id}`.
- v1 responses carry `Deprecation` and `Link: rel="deprecation"` headers. Migrate per docs/reference/api-reference.md.
