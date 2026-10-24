---
hidden: true
---

# API Reference

The Management API is the HTTP surface every deployed Frigg app serves:
integrations, entities, credentials and authorization. It is versioned by a
path major ([ADR-053](../architecture-decisions/053-management-api-versioning.md)).

| Version | Paths | Status | OpenAPI |
| --- | --- | --- | --- |
| v2 | `/api/v2/*` | Stable (the entity proxy is beta) | `GET /api/meta/openapi/v2.json` |
| v1 | unprefixed `/api/*` | Deprecated, frozen. Removed no earlier than core 3.0 | `GET /api/meta/openapi/v1.json` |

The API major is not the core version: core 2.0.1 serves v1 and v2.

## Discovery: `GET /api/meta`

No authentication and no database access. Clients call it first.

```json
{
  "api": {
    "versions": {
      "1": { "status": "deprecated", "deprecatedAt": "2026-11-01", "sunset": null, "openapi": "/api/meta/openapi/v1.json" },
      "2": { "status": "stable", "openapi": "/api/meta/openapi/v2.json" }
    },
    "preferred": "2"
  },
  "capabilities": ["credentials", "multiStepAuthorize"]
}
```

- `capabilities` are stable feature flags. `entityProxy` appears only when the
  app enables the proxy. Feature-detect with them instead of parsing versions.
- With `x-frigg-admin-api-key`, the response also has `frigg.coreVersion`.
- A core older than 2.0.1 answers 404: it serves v1 only.

## Conventions (v2)

- **Authentication**: every v2 route accepts the same methods as v1: a Frigg
  bearer token, the `x-frigg-api-key` + `x-frigg-appuserid` (+ `x-frigg-apporgid`)
  headers, or an adopter JWT when enabled.
- **Ownership**: a resource that does not exist and one owned by another user
  are the same `404`.
- **Errors**: `{ "error": { "code": "ENTITY_NOT_FOUND", "message": "...", "details": {} } }`
  with the matching HTTP status. Malformed JSON is `400 INVALID_JSON`.
- **Version header**: every v2 response carries `Frigg-API-Version: 2`.
- **Compatibility**: within v2, changes are additive. Ignore response fields
  and enum values you do not know.

## v2 endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v2/integrations` | `{ integrations }` only |
| GET | `/api/v2/integrations/options` | Integration types the app offers, `{ integrations }` |
| POST | `/api/v2/integrations` | `{ entities, config: { type } }`. The caller must own every entity. 201 |
| GET / PATCH / DELETE | `/api/v2/integrations/:integrationId` | DELETE answers 204 |
| GET | `/api/v2/integrations/:integrationId/config/options` | |
| POST | `/api/v2/integrations/:integrationId/config/options/refresh` | |
| GET | `/api/v2/integrations/:integrationId/actions` | `?actionType=` |
| POST | `/api/v2/integrations/:integrationId/actions/:actionId/options` | Body: current form data |
| POST | `/api/v2/integrations/:integrationId/actions/:actionId/options/refresh` | |
| POST | `/api/v2/integrations/:integrationId/actions/:actionId` | Only user actions; others are `404 ACTION_NOT_FOUND` |
| GET | `/api/v2/integrations/:integrationId/test-auth` | `{ status: "ok" }` or `{ status: "failed", errors }` |
| GET | `/api/v2/entities` | `{ entities }`; never credential fields |
| GET | `/api/v2/entities/types` | `{ types }`: modules the app can connect |
| GET | `/api/v2/entities/types/:entityType` | |
| GET | `/api/v2/entities/types/:entityType/requirements` | `?step=`; read-only, no session |
| GET / DELETE | `/api/v2/entities/:entityId` | DELETE is `409 ENTITY_IN_USE` while integrations use it |
| GET | `/api/v2/entities/:entityId/test-auth` | `{ status: "ok" \| "failed" }` |
| GET | `/api/v2/entities/:entityId/options` | |
| POST | `/api/v2/entities/:entityId/options/refresh` | |
| POST | `/api/v2/entities/:entityId/proxy` | Beta, off by default; see below |
| GET | `/api/v2/credentials` | `{ credentials }`, secrets masked |
| GET / DELETE | `/api/v2/credentials/:credentialId` | Masked. DELETE unsets it on its entities |
| GET / POST | `/api/v2/credentials/:credentialId/reauthorize` | Same flow as `/api/v2/authorize`, bound to the credential |
| GET / POST | `/api/v2/authorize` | Single- and multi-step authorization |

Credential responses never contain secrets. Each provider field keeps its name
and a masked value (`"access_token": "****WXYZ"`).

## Multi-step authorization

```text
GET  /api/v2/authorize?entityType=acme
  → { type: "email", data: { jsonSchema, uiSchema }, step: 1, totalSteps: 2, isMultiStep: true, sessionId: "…" }
POST /api/v2/authorize { entityType: "acme", step: 1, sessionId, data: { email } }
  → { status: "pending", step: 2, totalSteps: 2, sessionId, requirements, message: "Code sent" }
POST /api/v2/authorize { entityType: "acme", step: 2, sessionId, data: { otp } }
  → { status: "complete", entity, credential }
```

- Single-step modules (OAuth2, API key) complete on the first POST, with no
  session. For OAuth2, `data.url` is the provider URL.
- A session belongs to the user, the entity type and (for re-authorization) the
  credential. It expires after 15 minutes (`AUTH_SESSION_EXPIRY_MINUTES`).
  Data collected by earlier steps is encrypted at rest.
- Errors: `404 AUTHORIZATION_SESSION_NOT_FOUND`, `409 STEP_OUT_OF_ORDER`
  (`details.expectedStep`), `400 SESSION_REQUIRED`, `400 AUTHORIZATION_FAILED`
  (with the module's message), `502 UPSTREAM_ERROR`. Posting step 1 again
  restarts the flow.
- Modules opt in with `getAuthStepCount()`, `getAuthRequirementsForStep(step)`
  and `processAuthorizationStep(api, step, data, sessionData)` on their
  definition (see the multi-step auth migration guide).

## Entity proxy (beta)

`POST /api/v2/entities/:entityId/proxy` calls the connected account's API with
the stored credential ([ADR-052](../architecture-decisions/052-entity-proxy-security.md)).

```js
// App definition: off unless enabled
managementApi: {
    proxy: {
        enable: true,
        // optional: timeoutMs (≤ 25000), maxRequestBytes (1 MB), maxResponseBytes (≤ 5 MB)
        // optional: modules: { erp: { allow: [{ method: 'GET', path: '/v1/customers/**' }] } }
    },
},

// API module definition: deny by default
proxy: {
    allow: [
        { method: 'GET', path: '/crm/v3/objects/:objectType' },
        { method: 'GET', path: '/crm/v3/properties/**' },
    ],
    headers: ['x-tenant'],  // extra request headers callers may send
},
```

```text
POST /api/v2/entities/7/proxy
{ "method": "GET", "path": "/crm/v3/objects/contacts", "query": { "limit": 10 } }
→ 200 { "success": true, "status": 200, "headers": { … }, "data": { … } }
```

- `path` is relative to the module's base URL. The host always comes from the
  module; absolute URLs, `//`, `..`, encoded separators, `?` and `#` are refused.
- The call goes through the module's Requester, so token refresh applies.
  API-key and basic-auth modules work the same as OAuth2.
- The response status follows the upstream status. Upstream 5xx is
  `502 UPSTREAM_ERROR`, 429 keeps `Retry-After`, a timeout is `504 TIMEOUT`.
  Refusals: `400 INVALID_PROXY_REQUEST`, `403 PROXY_NOT_ALLOWED`, `413`, `415`.
- Every call writes a `frigg.api.proxy.request` audit record and counts
  `frigg.api.proxy.requests`.

## Migrating from v1

| v1 | v2 | Change |
| --- | --- | --- |
| `GET /api/integrations` | `GET /api/v2/integrations` + `GET /api/v2/integrations/options` + `GET /api/v2/entities` | Split responses |
| `POST /api/integrations` | `POST /api/v2/integrations` | Entities must belong to the caller; unknown `config.type` is 400 |
| `GET/PATCH/DELETE /api/integrations/:id` | Same under `/api/v2/integrations` | DELETE answers 204 with no body |
| `GET /api/integrations/:id/config/options[/refresh]` | Same under `/api/v2` | |
| `ANY /api/integrations/:id/actions` | `GET /api/v2/integrations/:id/actions?actionType=` | GET only |
| `ANY /api/integrations/:id/actions/:actionId/options` | `POST …/actions/:actionId/options` | |
| `POST /api/integrations/:id/actions/:actionId` | Same under `/api/v2` | User actions only |
| `GET /api/integrations/:id/test-auth` | Same under `/api/v2` | Failure is `200 { status: "failed", errors }` |
| `GET /api/authorize` | `GET /api/v2/authorize` | Requirements as `{ type, data, step, totalSteps, isMultiStep, sessionId? }` |
| `POST /api/authorize` | `POST /api/v2/authorize` | `{ status: "complete", entity, credential }` or `{ status: "pending", … }` |
| `POST /api/entity` | `POST /api/v2/authorize` | Authorization creates the entity |
| `GET /api/entity/options/:credentialId` | `GET /api/v2/entities/:entityId/options` | By entity |
| `GET /api/entities/:entityId` | `GET /api/v2/entities/:entityId` | No credential fields |
| `GET /api/entities/:entityId/test-auth` | Same under `/api/v2` | Failure is `200 { status: "failed" }` |
| `POST /api/entities/:entityId/options` | `GET /api/v2/entities/:entityId/options` | GET |
| `POST /api/entities/:entityId/options/refresh` | Same under `/api/v2` | |
| | `/api/v2/credentials…`, `/api/v2/entities/types…`, `/api/v2/entities/:id/proxy` | New |

Unchanged and unversioned: `/user/*`, `/health*`,
`/api/integrations/redirect/:appId`, `/admin/*`, `/api/v2/reports` (ADR-010)
and adopter routes (`/api/{name}-integration/*`).

### Deprecation signals and switching v1 off

Every v1 response carries `Deprecation: @<epoch>` (RFC 9745) and
`Link: <https://docs.friggframework.org/api/migrate-v1-v2>; rel="deprecation"`.
Each v1 call writes a `frigg.api.deprecated_route` log record (route template,
method, `Frigg-Client` header) and counts `frigg.api.v1.requests`, so you can
measure your own v1 traffic.

When nothing uses v1 any more, set `managementApi: { v1: false }`. The v1
routes then answer `410 API_VERSION_DISABLED`, and `frigg deploy` no longer
creates their API Gateway routes. The OAuth redirect keeps working.

### `@friggframework/ui`

The ui `API` client takes `{ apiVersion: 'v1' | 'v2' }` (default `'v1'` in
2.0.1). In `'v2'` mode it reads `/api/meta` first and throws
`FriggApiVersionError` ("upgrade core to >= 2.0.1") against an older backend.
Upgrade core first, then switch the client.

## v1 reference (deprecated)

### Authorization (v1)

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/authorize" method="get" expanded="false" fullWidth="false" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/authorize" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

### Integrations (v1)

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="patch" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="delete" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/config/options" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/config/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/test-auth" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

### Entities (v1)

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entity" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entity/options/{credentialId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/test-auth" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/options" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}
