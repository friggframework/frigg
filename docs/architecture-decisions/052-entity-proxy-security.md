# ADR-052: Entity Proxy Security

**Status**: Accepted
**Date**: 2026-10-03
**Deciders**: Sean Matthews

## Context

[ADR-006](./006-integration-router-v2.md) added proxy endpoints to the Management API
so that a client (the adopter's frontend, a backend job, an AI agent or an MCP server)
can call a connected account's API through Frigg, with Frigg supplying the stored
credentials:

```
POST /api/entities/:id/proxy       { method, path, query, headers, body }
POST /api/credentials/:id/proxy    { method, path, query, headers, body }
→ { success, status, headers, data }
```

The proxy is the most powerful route Frigg serves. Every other route performs a fixed
operation that Frigg's own code chose. The proxy performs whatever operation the caller
asks for, with an OAuth token or API key that the end user granted to the adopter's
product, not to the caller. It is a request-forwarding service holding live
credentials, which is the textbook shape for server-side request forgery (SSRF) and
confused-deputy bugs.

### What the v2 build does today

The v2 build is on `feature/integration-router-v2-drop-modules-router` (PR #522), not on
`next`. Its proxy is `ExecuteProxyRequest`
(`packages/core/integrations/use-cases/execute-proxy-request.js`), mounted at
`/api/entities/:id/proxy`, `/api/credentials/:id/proxy` and
`/api/v2/entities/:id/proxy`. The request schema is
`packages/schemas/schemas/api-proxy.schema.json` (already on `next`).

| Concern | Today on the branch |
|---|---|
| Who can call it | Any logged-in user, on every app. No switch to turn it off. |
| Ownership | `findByIdForUser(entityId, userId)` — good. User only; no organisation check. |
| Target | `path` must be a string that starts with `/`. Nothing rejects `//host`, `..`, encoded separators, or a scheme. |
| How the URL is built | `api.request({ method, url: path, ... })`. The `Requester` base class defines no `request()` on `next` or on the branch, so the base-URL join is whatever each module does, if anything. |
| Which operations | Any method in `GET POST PUT PATCH DELETE`, any path. No module says what may be proxied. |
| Request headers | Strips `authorization`, `cookie`, `x-api-key`. Forwards everything else, including `host` and `x-forwarded-*`. |
| Response headers | Strips `authorization`, `set-cookie`, `x-api-key`. |
| Redirects | The fetch default (follow). A 3xx to another host is followed. |
| Limits | None on request or response size. Timeout is the Requester default (60 s). |
| Credential check | Requires `credential.data.access_token`, so API-key and basic-auth modules cannot use it at all. |
| Observability | No audit record, no counter. |

### Who will call it

The driver for the proxy is agents ([ADR-020](./020-capabilities.md) capabilities, MCP
servers, tool calling). An agent composes requests from model output, which may be
influenced by untrusted content it has read (prompt injection). The proxy must be safe
when its caller is **not** trusted to choose the request well, not merely when the
caller is authenticated.

### Threats

| Threat | How it happens without controls |
|---|---|
| **SSRF** | `path: "//169.254.169.254/latest/meta-data/"`, `path: "/..%2f..%2f"`, a module whose URL join treats an absolute `path` as the URL, or an upstream 302 to an internal host. The Lambda runs in the adopter's VPC (often private subnets with VPC endpoints), so internal addresses are reachable. |
| **Credential exfiltration** | The upstream host receives the token by design. If the caller can choose the host (absolute URL, redirect, `Host` header), the token goes to the caller's server. Response headers or error bodies can also echo credentials back. |
| **Confused deputy** | The end user granted the adopter's product a scope for specific features. The proxy lets any authenticated caller (or an agent acting for one) use that whole grant: delete records, change admin settings, read data the product never shows. |
| **Privilege escalation across users** | Proxying through an entity that belongs to another user or organisation, by guessing or enumerating ids. |
| **Log leakage** | Logging the forwarded request or response (tokens in headers, PII in bodies, secrets in query strings) at INFO, or in error records. |

## Decision

**Ship the entity proxy in 2.0.1, locked down. Defer the credential-level proxy.**
Decided by the maintainer on 2026-10-03 ("ship it, locked down"). The implementation
lands with the v2 build; this ADR is the specification it must meet.

### 1. Scope: entity proxy only

- `POST /api/v2/entities/:id/proxy` is the only proxy route. Request
  `{ method, path, query?, headers?, body? }`; response
  `{ success, status, headers, data }` (the existing `api-proxy.schema.json` shapes,
  with the field rules below).
- **The credential-level proxy (`/api/credentials/:id/proxy`, `/api/v2/credentials/:id/proxy`)
  is deferred.** A credential is not bound to an entity, an organisation, or a module
  instance with a known base URL, so ownership and target checks are weaker. It can be
  added later as an additive v2 change ([ADR-053](./053-management-api-versioning.md)
  §2) if a use case needs it.
- **No unprefixed proxy route.** `/api/entities/:id/proxy` is removed from the branch
  before merge (ADR-053 §1: unprefixed `/api/*` is frozen as v1).

### 2. Off by default

- The route exists only when the app turns it on:

  ```js
  // backend/index.js app definition
  managementApi: {
      proxy: { enable: true },
  },
  ```

- With the flag off, the route is neither mounted in the router nor declared as an
  API Gateway route (the ADR-053 route registry generates both), and `/api/meta` does
  not list the `entityProxy` capability.
- `managementApi` is a new top-level app-definition key. It is added to
  `app-definition.schema.json` and to `frigg validate`
  ([ADR-051](https://github.com/friggframework/frigg/pull/666), open PR #666) in the same
  change, since that schema rejects unknown keys.

### 3. Authentication and ownership

- Same user authentication as every other v2 route (`loadUser` → `requireLoggedInUser`:
  bearer token, x-frigg headers or adopter JWT). The admin API key does **not** grant
  proxy access; there is no "proxy as any user".
- **Ownership:** the entity must belong to the caller. When the app uses organisations,
  the entity's organisation must match the caller's; when it uses individual users,
  the entity's user must match. A miss returns **404** (not 403), so ids cannot be
  probed.
- The entity's credential must be usable for its module's auth type (OAuth2, API key,
  basic). The branch's `access_token` check is replaced by the module's own auth
  readiness, so API-key modules work.

### 4. Target: the module's own API, path only

- The upstream URL is **always** `module base URL + normalised path`. The base URL comes
  from the module: a declared `proxy.baseUrl`, or the Api instance's `baseUrl` after it
  is built from the **persisted** entity and credential (for tenant-specific hosts such
  as a Salesforce `instance_url` or a per-account domain). Nothing in the request can
  set or change it.
- `path` is a path, nothing else:
  - must start with a single `/`; `//`, `\`, a scheme (`http:`, `https:`, any
    `name:` before the first `/`), userinfo (`@` before the first `/`), and control or
    whitespace characters are rejected;
  - percent-decoded once, then normalised; any `.` or `..` segment, and encoded
    separators (`%2f`, `%5c`) after decoding, are rejected rather than resolved;
  - the query string travels in `query`, never in `path` (`?` and `#` in `path` are
    rejected).
- After joining, core parses the final URL and checks that its scheme is `https` and
  that its origin equals the base URL's origin, and that its path is under the base
  URL's path. A mismatch is rejected before any network call.
- **Redirects are not followed across hosts.** The request uses manual redirect
  handling; a 3xx to the same origin may be followed (at most 3 hops, each re-checked);
  a 3xx anywhere else is returned to the caller as the upstream status with the
  `location` header removed, and no credential is sent to the new location.

### 5. Allow-list declared by the API module

- A module opts in to being proxied by declaring what may be proxied, on its definition:

  ```js
  // api-module-hubspot/definition.js
  proxy: {
      allow: [
          { method: 'GET',  path: '/crm/v3/objects/:objectType' },
          { method: 'GET',  path: '/crm/v3/objects/:objectType/:id' },
          { method: 'POST', path: '/crm/v3/objects/:objectType/search' },
          { method: 'GET',  path: '/crm/v3/properties/**' },
      ],
  },
  ```

  Patterns use `:param` for one segment and a trailing `/**` for a subtree; they are
  matched against the normalised path from §4.
- **Deny by default.** A module with no `proxy.allow` cannot be proxied, and the route
  returns **403** `PROXY_NOT_ALLOWED` naming the module.
- **App-level override.** The adopter may narrow or widen the list per module, and is
  the only party who can allow a module that declares none:

  ```js
  managementApi: {
      proxy: {
          enable: true,
          modules: {
              hubspot: { allow: 'module' },                       // the module's list (default)
              erp:     { allow: [{ method: 'GET', path: '/v1/customers/**' }] },  // explicit list
          },
      },
  },
  ```

  A wildcard such as `{ method: '*', path: '/**' }` is accepted only in the app
  definition, and `frigg validate` warns on it.

### 6. Headers

- **Request headers:** an allow-list, not a deny-list. The caller may send
  `accept`, `content-type`, `accept-language`, `if-match`, `if-none-match`, and
  provider-specific headers the module lists in `proxy.headers`. Everything else is
  dropped, and these are always rejected: `authorization`, `proxy-authorization`,
  `cookie`, `host`, `x-forwarded-*`, `forwarded`, `x-real-ip`, `x-api-key`, and any
  header the module's auth puts on requests. Auth headers come only from the Requester.
- **Response headers:** `authorization`, `proxy-authorization`, `set-cookie`,
  `www-authenticate`, `x-api-key`, `location` (unless same-origin), and hop-by-hop
  headers are removed before the response leaves Frigg.

### 7. Limits

| Limit | Default | Configurable |
|---|---|---|
| Request body | 1 MB | `managementApi.proxy.maxRequestBytes` |
| Response body | 5 MB, under the 6 MB Lambda response limit; over it returns 502 `RESPONSE_TOO_LARGE` | `maxResponseBytes` (lower only) |
| Upstream timeout | 25 s, under the API Gateway 30 s limit | `timeoutMs` (lower only) |
| Content types | JSON and text are returned as data; binary is refused with 415 unless the module allows it | module `proxy.binary: true` |

### 8. Through the Requester

The call goes through the module's `Requester`, so the framework's behaviour applies
unchanged: token refresh and single-flight refresh (ADR-031, ADR-042), the per-attempt
timeout, rate-limit awareness and `Retry-After` handling
([ADR-049](https://github.com/friggframework/frigg/pull/655), open PR #655), and
structured logging with redaction ([ADR-048](./048-structured-logging.md)). The proxy
does not build its own fetch. The `Requester` gains one generic, path-checked entry
point for this (working name `_proxyRequest`); module methods are not called.

### 9. Audit and usage

- **One audit record per call**, written through the ADR-048 logger at `INFO` with
  `eventName: 'frigg.api.proxy.request'` and these fields: `userId`, organisation id
  when present, `entityId`, `credentialId`, module name, `method`, the matched allow-list
  pattern (not the raw path), upstream `status`, `durationMs`, request and response
  byte counts, and the outcome (`ok`, `denied`, `upstream_error`, `timeout`,
  `too_large`). Request and response bodies, headers and query values are never logged.
  Denied calls are logged at `WARN` with the reason.
- **A usage counter** (ADR-011) `frigg.api.proxy.requests`, labelled by module, method
  and outcome only (no ids on metric labels, per ADR-048).

### 10. Responses and status mapping

- The upstream status is returned in the body (`status`), and the HTTP status of the
  Frigg response follows it so clients and agents need no special case:

  | Upstream | Frigg response |
  |---|---|
  | 2xx, 3xx (same origin), 4xx other than 401/429 | Same status, `{ success: status < 400, status, headers, data }` |
  | 401 after one refresh-and-retry by the Requester | 401 `INVALID_CREDENTIALS`, entity marked as needing re-authorisation as today |
  | 429 | 429 with `Retry-After` passed through |
  | 5xx | 502 `UPSTREAM_ERROR` with the upstream status in the body |
  | Timeout / network | 504 `TIMEOUT` / 502 `NETWORK_ERROR` |
  | Rejected by §3-§7 | 400 `INVALID_PROXY_REQUEST`, 403 `PROXY_NOT_ALLOWED`, 404, 413 or 415 |

- Error bodies never include the upstream URL with its query, request headers, or
  credential material.

## Consequences

### Positive

- Agents and MCP servers get a general tool for a connected account without each
  adopter writing per-endpoint routes, and the blast radius is bounded by what the
  module and the adopter allowed.
- SSRF and token exfiltration are closed by construction: the caller cannot name a
  host, and the final URL is checked against the module's origin before any call.
- One audit stream answers "who called what, through whose account", which is the
  question security reviews of adopter products ask.
- Token refresh, rate limits and redaction are the framework's, not reimplemented.

### Negative

- Off by default and deny by default means nothing is proxied until both the adopter
  and the module author act. Modules in the library need `proxy.allow` lists before the
  proxy is useful with them.
- Path-only input forbids some legitimate patterns (for example following an absolute
  `next` URL a provider returns). Callers must strip it to a path.
- The header allow-list will miss provider-specific headers until modules list them.
- The credential-level proxy is not available, so a client that holds a credential id
  but no entity cannot use the proxy.

### Neutral

- Ownership checks follow the app's user model (individual or organisation), the same
  as other v2 routes.
- The request and response shapes stay those of `api-proxy.schema.json`; the schema
  gains the documented error codes and its `path` description gains the rules in §4.

## Alternatives Considered

1. **Ship the branch's proxy as is.** Rejected: open SSRF and exfiltration paths, any
   path and method on every app, no audit.
2. **Do not ship a proxy in 2.0.1.** Rejected by the maintainer: the agent and MCP use
   case is a 2.0.1 goal, and a locked-down proxy serves it.
3. **Ship both entity and credential proxies, locked down.** Rejected for now: a
   credential has no entity-level ownership or module instance to fix the base URL,
   and nothing needs it yet.
4. **Deny-list of dangerous paths instead of an allow-list.** Rejected: providers add
   endpoints, and a deny-list fails open on every new one.
5. **Let the caller pass an absolute URL and check its host against the module's
   host.** Rejected: URL parsing differences (userinfo, encodings, IDNA, trailing dots)
   are where SSRF filters fail. Path-only input removes the class.
6. **Per-integration custom routes only (no generic proxy).** Still available and
   preferred for product features; the proxy is for open-ended tool use.

## Related

- [ADR-006](./006-integration-router-v2.md): Integration Router v2 — introduced the proxy;
  amended in this PR to point here.
- [ADR-053](./053-management-api-versioning.md): Management API versioning — the
  `/api/v2` path, `/api/meta` capability flag, route registry and stability labels.
- [ADR-049](https://github.com/friggframework/frigg/pull/655) (open PR #655): rate-limit
  awareness applied through the Requester.
- [ADR-048](./048-structured-logging.md): structured logging — the audit record and
  redaction.
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md): usage counters.
- [ADR-020](./020-capabilities.md): capabilities — agents and MCP as proxy callers.
- [ADR-031](./031-concurrent-oauth-credential-refresh.md),
  [ADR-042](./042-in-process-single-flight-token-refresh.md): token refresh behaviour the
  proxy inherits.
- [ADR-051](https://github.com/friggframework/frigg/pull/666) (open PR #666): the
  `managementApi` key joins the validated app-definition schema.
- `packages/schemas/schemas/api-proxy.schema.json`
- OWASP Server-Side Request Forgery Prevention Cheat Sheet.
