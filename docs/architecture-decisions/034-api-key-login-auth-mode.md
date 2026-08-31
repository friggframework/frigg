# ADR-034: API-Key Login Auth Mode

**Status**: Proposed
**Date**: 2026-08-20
**Deciders**: Sean Matthews

## Context

Frigg apps that ship a browser SPA today have no first-class way to let an end user **log in with their own product API key** and land in an authenticated, tenant-scoped session. The existing `user.authModes` are:

- `friggToken` — native username/password → bearer. Requires Frigg to own credentials; no notion of "your product's key is your login."
- `sharedSecret` — `x-frigg-api-key` + `x-frigg-appUserId`/`appOrgId` headers. Correct for backend-to-backend, but the master `x-frigg-api-key` can never live in a browser, so it forces every adopter to stand up a **BFF/token-broker** in front of Frigg (this is exactly what `lefthookhq/aes--frigg`'s `auth-proxy/` does: validate the product key against the product's API, derive an org id, then proxy to Frigg with the shared secret + `x-frigg-apporgid`).
- `adopterJwt` — designed for adopter-verified JWTs, but currently a `501` stub.

The BFF pattern works and is secure, but it makes every "log in with your product key" app carry a second deployable service, duplicate an allowlist, and hand-roll session/refresh logic. For products where **the API key is already the unit of API authority** (the common case), Frigg can offer this natively.

Critically, the pieces already exist in core:

- `modules/use-cases/process-authorization-callback.js` already instantiates a `Module` and its Requester and creates/refreshes the **Credential + Entity** from `{ api_key }` — it is what `POST /api/authorize` runs.
- `user/use-cases/get-user-from-x-frigg-headers.js` already **find-or-creates** an individual/org user from identifiers.
- `login-user` / token minting already issues a Frigg session token.

What's missing is the glue: validate a pasted key **through the api-module itself**, derive the tenant identity **from the provider** (not the client), find-or-create the user, create the credential/entity, and issue a session — behind a declared auth mode.

## Decision

Add a first-class, opt-in `apiKey` auth mode. An app declares which module is its **identity provider**:

```js
user: {
  authModes: { apiKey: { module: 'reevo' } },
  organizationUserRequired: true, // so the org user is created from the provider org id
}
```

### Route (reuse `POST /user/login`, polymorphic on credential shape)

There is **no mode-specific path**. The existing `POST /user/login` becomes polymorphic: it dispatches on the credential shape in the body against the app's enabled `authModes`.

- `{ username, password }` → `friggToken` (existing behavior, unchanged).
- `{ apiKey }` → the `apiKey` mode (this ADR). The identity module is fixed by config (`authModes.apiKey.module`); a multi-identity app MAY send `{ module, apiKey }` restricted to a configured allowlist.

Both modes may be enabled simultaneously and coexist on the one route (the bodies are disjoint, so dispatch is unambiguous). The endpoint stays unauthenticated and rate-limited. Rationale: "log in" is the resource; which credential counts is a server-config detail, not something the URL should encode — and adding future modes never adds routes.

### The use case (`LoginWithApiKey`)

1. **Validate + identify via the module's Requester.** Instantiate the configured identity module with the supplied key and call its `requiredAuthMethods`: `testAuthRequest` (validity) and `getEntityDetails`/`getCredentialDetails` (identity + the properties to persist). The api-module — not a bespoke validator — is the source of truth for "is this key valid, and whose is it." A `401/403` from the provider → invalid key (generic error, no enumeration); a `5xx`/timeout → provider-unavailable (`503`), distinct from a bad key.

   **`testAuthRequest` login contract (normative).** On this path `testAuthRequest` MUST either **throw** (a provider error the classifier splits into 401 vs 503) or **return the strict boolean `true`**. The validity gate requires `=== true`; any other value — including a truthy error object, a non-empty string, or a response body — is treated as a failed validation (generic 401), NOT a pass. A module that signals a bad key by returning a truthy object instead of a falsy value therefore cannot clear the gate. `getEntityDetails` MUST return a stable **scalar** `identifiers.externalId` (string or number); a non-scalar (object/array/boolean) is rejected as "no stable identifier" rather than coerced.
2. **Derive a provider-authoritative identity.** `appOrgId` (and/or `appUserId`) MUST come from the provider response (e.g. the account/org id `getEntityDetails` returns), NEVER from client input, and MUST be a stable, tenant-unique identifier. Hashing the key (`sha256(apiKey)`) is explicitly disallowed as the identity — it changes on key rotation and orphans connections (the AES R1 flaw). The find-or-create identity is **namespaced by the resolved module name** (`${moduleName}:${externalId}`): in a multi-module allowlist two different providers can legitimately return the same `externalId`, and the namespace keeps those distinct tenants from collapsing onto one Frigg user.
3. **Find-or-create the Frigg user** from that identity, reusing the existing find-or-create path. The issued principal is an ordinary **app user**, never an admin.
4. **Create the Credential + Entity** by running `ProcessAuthorizationCallback(userId, module, { api_key })` — the same path `/api/authorize` uses — so the module's source is connected as part of login. The callback's return is asserted to carry a persisted `credential_id` **before** a session is minted; a callback that returns without one fails the login `500`-class rather than handing out a session over a half-provisioned tenant. (The user is found-or-created before the credential is provisioned; an orphaned user on partial callback failure is accepted cleanup debt, tolerated over reordering.)
5. **Issue a Frigg session token** and return it. Default: an httpOnly, `secure`, `sameSite` cookie plus a short-lived access token; the raw key is **not** returned to or re-sent by the browser after login (it lives only as the encrypted Credential).

### Trust model (documented, accepted)

Possession of a valid provider API key confers authority over that tenant's integrations in the Frigg app. This **mirrors** the authority the key already grants at the provider — it is not an escalation. There is no second factor; this is bearer-key trust, appropriate for products whose API key is already the unit of API authority. Adopters whose keys are broad, long-lived, and unrotatable should prefer `friggToken` or an external IdP via a BFF instead.

## Security requirements (normative — the implementation MUST honor these)

1. **Provider-authoritative identity.** `appOrgId`/`appUserId` derive only from the module's provider response; a client-supplied org/user id is ignored. Reject a login whose module returns no stable identifier.
2. **Session ≠ admin.** The minted session is a normal app-user token scoped to that tenant; it must not authorize `/user/*` management routes or cross-tenant access.
3. **Rate limiting.** `POST /user/login` (the polymorphic route) is rate-limited (per-IP and global) to prevent using it as a key-validation oracle against the provider. Cap key length before any work. Errors are generic (no user/key enumeration). The per-IP bucket key is derived from a **trusted** X-Forwarded-For position (rightmost by default, or `authModes.apiKey.rateLimit.trustedProxyDepth` hops from the right), NOT the client-controlled leftmost hop, so an attacker cannot rotate a spoofed leftmost XFF to mint a fresh bucket per request. The in-process limiter is a floor: `maxGlobal` is the only hard in-process ceiling (and only per container in a multi-instance deployment). The real per-IP control belongs at the edge (WAF / API Gateway throttling).
4. **Key at rest _and in logs_.** The key is persisted only as the Credential, through Frigg's field-level encryption (KMS/AES). It is never returned after login and never placed in a JWT claim. It is **never logged**: the framework logger (`initDebugLog`) redacts a denylist of credential-bearing request-body/header fields (`apiKey`, `api_key`, `password`, `token`, `authorization`, `refresh_token`, `access_token`) to `[REDACTED]` before the Lambda event is buffered — so the raw key cannot leak via the buffered debug dump on a 5xx nor via `DEBUG_VERBOSE=1`. This also protects the `friggToken` `password` on the shared route.
5. **Revocation latency is bounded by TTL.** Access tokens are short-lived; refresh (if implemented) MUST re-validate the stored key via the module's `testAuthRequest` before rotating, so a revoked provider key stops working within one TTL rather than for the life of a long session.
6. **Outage ≠ invalid.** Provider `5xx`/timeout returns `503` and does not revoke the session or clear cookies; only a definitive `401/403` invalidates.
7. **Cookie hygiene.** `httpOnly`, `secure` (in non-local stages), `sameSite: 'strict'`, and a cookie `Max-Age`/`Expires` aligned to the session-token TTL (cookie and token expire together). The Origin/Referer allowlist (CSRF) is **opt-in** via `authModes.apiKey.allowedOrigins` so it does not hard-break unconfigured local dev; when `apiKey` mode is enabled without it, the framework emits a one-time wiring-time `console.warn` noting that Origin enforcement is off and the `sameSite: 'strict'` cookie is the residual protection. `allowedOrigins`, when present, MUST be an array (validated at wiring time). Adopters serving a browser SPA should configure it.

## Consequences

- **Removes the mandatory BFF** for "log in with your product key" apps: the browser talks to Frigg directly (login → cookie → normal calls). The BFF remains the right tool when identity must come from a third-party IdP, or when a proxy is wanted for other reasons.
- **Reusable across every api-key module.** Any module exposing the standard `requiredAuthMethods` gets product-key login for free by naming it in `authModes.apiKey.module`.
- **Default-off, additive.** Apps that don't declare `authModes.apiKey` are unchanged. It composes with the existing modes (an app may keep `friggToken`/`sharedSecret` on).
- **Supersedes** the earlier sketches (`adopterJwt` completion, a bespoke `apiKeyResolver` hook): validating through the api-module is strictly better than a hand-supplied resolver because the module already encodes how to auth-test and identify a key.

## Scope of the implementing change

- `packages/core/user/use-cases/login-with-api-key.js` — the new use case (validate via module → derive identity → find-or-create user → ProcessAuthorizationCallback → mint token). Plus wiring in `authenticate-user.js`/the user router for the new mode and route.
- `packages/core/handlers/routers/*` — make the existing `POST /user/login` polymorphic (dispatch `{ apiKey }` → apiKey mode, `{ username, password }` → friggToken unchanged); rate-limited; cookie issuance.
- App-definition `user.authModes.apiKey` config validation + docs.
- Tests: valid key → user+credential+entity created and a session returned; invalid key → 401 generic; provider outage → 503 with no session; **client-supplied org id is ignored** (impersonation guard); rate-limit trips; refresh re-validates; the minted token cannot reach `/user/*`. Mutation-test the impersonation guard and the 401-vs-503 split.

**Note:** end-to-end validation against a live provider is out of scope for the PR's automated tests (uses a mocked module Requester); the security requirements above are enforced by unit tests on the use case and route.
