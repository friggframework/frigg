# ADR-053: Management API Versioning

**Status**: Accepted
**Date**: 2026-10-03
**Deciders**: Sean Matthews

## Context

The Management API is the HTTP surface that every deployed Frigg app serves:
integrations, entities, credentials, authorization, and the admin routes. Core
defines it (`packages/core/integrations/integration-router.js`). Devtools maps it
to API Gateway HTTP API routes
(`packages/devtools/infrastructure/domains/shared/utilities/base-definition-factory.js`).

The 2.0.1 release adds a cleaned-up "v2" contract: plural resources, separate
integrations / entities / options endpoints, credentials, multi-step authorize,
and a locked-down entity proxy ([ADR-052](./052-entity-proxy-security.md)). Existing adopters call the current ("v1") routes
and those routes must keep working.

The maintainer's question: industry practice points to date-based revisions sent in
a header (Stripe, GitHub). Does that fit an open-source, self-hosted framework?
Should the API version be pinned to the core version?

### Who controls which version

| Party | Controls | Upgrades when |
|---|---|---|
| Adopter (deploys the app) | `@friggframework/core` + `devtools` version, so the **server** contract | On their own schedule; some stay on a core major for years |
| `@friggframework/ui` | Which routes the React lib calls | When the adopter bumps the ui package (often independent of core) |
| Adopter's own frontend / backend | Hand-written calls | Rarely |
| CLI, skills, agents, MCP servers | Calls to *many* Frigg apps on *different* core versions | Continuously, outside the adopter's release cycle |

A Frigg maintainer never runs the server. There is no single server to pin an
"account version" on, and no way to force an upgrade. The client that knows the
least about the server (an agent pointed at an arbitrary Frigg URL) is the one
that grows fastest.

### Current state (on `next`, 2.0.0-next.0)

- v1 routes are unprefixed: `/api/integrations[/...]`, `/api/authorize`,
  `/api/entity`, `/api/entity/options/:credentialId`, `/api/entities/:entityId[/...]`,
  plus `/user/*`.
- `GET /api/integrations` returns the v1 combined shape
  `{ entities: { options, authorized }, integrations }`. The v2 design returns
  `{ integrations }` from the same logical resource. **The same path cannot serve
  both shapes without negotiation.**
- ADR-006 is internally inconsistent: its diagram puts integrations under
  `/api/v2/integrations` but entities, credentials and authorize unprefixed
  (`/api/entities`, `/api/credentials`, `/api/authorize`). `/api/entities/:entityId`
  is already a v1 path, and `/api/authorize` is already v1 with a different
  contract than multi-step authorize.
- The implementation branch `feature/integration-router-v2-drop-modules-router`
  ships both: `/api/v2/{integrations,entities,credentials,authorize}` *and* new
  unprefixed `/api/entities`, `/api/credentials`. Its `openapi-v2.yaml` says
  "All v2 endpoints are prefixed with `/api/v2/`". `packages/schemas` describes
  unprefixed `/api/entities`. Three sources, three answers.
- `/api/v2/reports` (ADR-010) already exists on the admin-scripts Lambda, with
  `/api/v2/reports` and `/api/v2/reports/{proxy+}` HTTP API routes for GET, POST,
  PUT and DELETE (`admin-script-builder.js`). It is an admin route, gated by the
  admin API key, that took the `/api/v2` prefix before this ADR existed.
- Devtools declares HTTP API routes only for `/api/integrations`,
  `/api/integrations/{proxy+}` and `/api/authorize` on the `auth` function. The v1
  `/api/entity*` and `/api/entities/*` routes in the router have no matching
  API Gateway route in the generated template. Open PR #667 adds them. The gap
  shows that the router and the route table drift when they are written twice.
- Adopter-defined routes live at `/api/{name}-integration/...`. They are the
  adopter's contract, not Frigg's, and are out of scope here.
- CORS uses `allowedHeaders: '*'` (`app-handler-helpers.js:20`), so new request
  headers need no CORS change today.

### How others version, and why

**Hosted APIs with date-based versions.** One provider runs one server for all
clients. Date versions let the provider ship breaking changes continuously while
each client stays on the behavior it integrated against.

- **Stripe**: date versions sent in `Stripe-Version`, an account default pinned
  on first request, and "version change modules" that transform responses
  backwards one date at a time. Since 2024-09-30.acacia: monthly non-breaking
  releases plus two named major releases a year that carry breaking changes.
  Typed SDKs pin the API version that was current when the SDK was released.
  ([blog](https://stripe.com/blog/api-versioning),
  [docs](https://docs.stripe.com/api/versioning))
- **GitHub**: `X-GitHub-Api-Version: 2022-11-28`. A request without the header
  gets `2022-11-28`. A version is supported for 24 months after its successor.
  Additive changes (new operations, optional params, response fields, enum
  values) go to all versions; breaking changes need a new version.
  ([docs](https://docs.github.com/en/rest/about-the-rest-api/api-versions))
- **Anthropic**: `anthropic-version` is required on every request. Inside a
  version, inputs and outputs are preserved; new optional inputs, new output
  values and new enum variants can appear. Only two versions ever shipped.
  ([docs](https://platform.claude.com/docs/en/api/versioning))
- **Shopify**: date versions in the URL, released quarterly, each supported at
  least 12 months. An unsupported version "falls forward" to the oldest
  supported one, and `X-Shopify-API-Version` reports what was served.
  ([docs](https://shopify.dev/docs/api/usage/versioning))
- **Twilio**: one date in the path (`/2010-04-01/`) for 15+ years. It is a
  date used as a major version: new features are added as new resources.

**Self-hosted / open-source.** The operator upgrades the server, so the
contract is whatever the deployed release implements.

- **GitHub Enterprise Server** is the one self-hosted product with date versions.
  "GitHub Enterprise Server versions are decoupled from REST API versions" but a
  date is usable only "as long as the API version is included in the GitHub
  Enterprise Server version". GHES 3.14 supports exactly one date, `2022-11-28`.
  Date versions in a self-hosted product end up as "the set of dates this server
  release supports": a release-tied version with extra bookkeeping.
  ([docs](https://docs.github.com/en/enterprise-server@3.14/rest/about-the-rest-api/api-versions))
- **GitLab (self-managed)**: `/api/v4`. "Major API version changes, and removal of
  entire API versions, are done in tandem with major GitLab releases." v4
  takes no breaking changes unless the feature was experimental or beta.
  ([docs](https://docs.gitlab.com/api/rest/))
- **Mattermost**: `/api/v4`. All v3 endpoints were removed in server v5.0, after
  being unsupported from v4.6. The server reports its version in `X-Version-Id`.
- **n8n**: `/api/v1` since 2022. Endpoints are added, never removed or broken.
  The app follows semver, so breaking changes go in app majors.
  ([docs](https://docs.n8n.io/connect/n8n-api/api-reference))
- **Airbyte (self-managed)**: public API at `/api/public/v1`. The older
  Configuration API was deprecated and is "not designed to be a public-facing
  API". ([docs](https://docs.airbyte.com/developers/api-documentation))
- **Kubernetes**: path-versioned API groups (`/apis/<group>/<version>`) with
  stability tracks. Alpha can go at any time. Beta is removed at most 9 months or
  3 releases after deprecation. GA "may be deprecated but not removed within a
  major version". Deprecated calls return a `Warning` header, an audit
  annotation and a metric. Clients discover served versions from `/apis`.
  ([policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/))
- **Grafana 12+**: moving from an unversioned `/api` to Kubernetes-style
  `/apis/<group>/<v1alpha1|v1beta1|v1>/...`, with GA versions promising
  backward compatibility.
  ([docs](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/apis/))
- **Backstage**: semver on packages. After 1.0, breaking changes only in the next
  major, with a deprecation path. `@alpha`/`@beta` exports can break in minors.
  ([policy](https://backstage.io/docs/overview/versioning-policy/))
- **Strapi 5**: changed the REST response shape in a major. It ships a
  `Strapi-Response-Format: v4` request header, a middleware that converts the v5
  shape back to v4, kept for all of v5. Strapi 4 ignores the header, so clients
  can send it before the server upgrades.
  ([docs](https://docs.strapi.io/cms/migration/v4-to-v5/breaking-changes/new-response-format))
- **Temporal**: SDKs call `GetSystemInfo` first and get a set of capability
  flags (for example `nexus`, `buildIdBasedVersioning`), then feature-detect
  instead of parsing server versions.
  ([API](https://typescript.temporal.io/api/classes/proto.temporal.api.workflowservice.v1.GetSystemInfoResponse.Capabilities))
- **PostgREST / Supabase**: versions by database schema, chosen with
  `Accept-Profile` / `Content-Profile`. The adopter owns the schema, so it is an
  adopter tool, not a framework contract.
  ([docs](https://docs.postgrest.org/en/v12/references/api/schemas.html))
- **Kong**: the Admin API is unversioned and follows Kong releases. Its own client
  (decK) absorbs the differences and supports all supported Kong versions.
  ([decK](https://developer.konghq.com/deck/support/))
- **Nango** (closest analog; self-hosting is now Enterprise-only): unversioned
  paths. It renamed `/connection` to `/connections` with a grace period and told
  users to upgrade the SDK/CLI to a minimum version.
  ([changelog](https://docs.nango.dev/changelog/overview))
- **Directus and Medusa** (cautionary): neither follows strict semver for its API.
  Directus says any release may include breaking changes. Medusa ships breaking
  changes in minors. Adopters must read release notes on every upgrade.
  Directus also removed its version from the unauthenticated `/server/info`
  "as a security precaution".
  ([Directus](https://directus.io/docs/self-hosting/upgrading),
  [Medusa](https://docs.medusajs.com/learn/update))

**Pattern.** Every self-hosted product above except GHES uses a coarse path
major (`v1`, `v4`) whose lifecycle is tied to server major releases. Each
explains changes in release-note terms ("removed in 5.0"), not date terms.
Date versions pay off when one provider controls the server and wants to break
things often. Frigg controls neither the server nor the upgrade schedule, and
should break things rarely.

### Deprecation signalling standards

- **RFC 9745** `Deprecation` response header: a structured-field date, e.g.
  `Deprecation: @1798761600`. Also defines the `deprecation` link relation for
  migration docs. ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745.html))
- **RFC 8594** `Sunset` response header: the HTTP-date after which the resource
  may stop responding. It must not be earlier than `Deprecation`.
- AWS HTTP API picks the most specific route: an exact match, then a greedy
  `{proxy+}` match, then `$default`.
  ([docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html))

## Decision

Decided by the maintainer on 2026-10-03, with one question left open
(`/api/v2/reports`, §7).

**The Management API has a coarse major version in the path (`/api/v2/...`).
Core semver governs the lifecycle of each major. A discovery endpoint advertises
the majors and capabilities a deployment serves. Dates are not used.**

### 1. Path-prefixed major versions

- **v2** = everything new goes under `/api/v2/`. All v2 resources live there:
  `integrations`, `entities`, `credentials`, `authorize` (multi-step), and the
  entity proxy (`POST /api/v2/entities/:id/proxy`, secured as
  [ADR-052](./052-entity-proxy-security.md) decides). Where
  `/api/v2/reports` belongs is an open question (§7).
- **v1** = the existing unprefixed routes (`/api/integrations*`, `/api/authorize`,
  `/api/entity*`, `/api/entities/:entityId*`, `/user/*`). They stay as they are.
  No `/api/v1` alias is added. A second spelling of v1 would only double the
  surface we must later remove.
- **No new unprefixed routes.** Unprefixed `/api/*` is frozen as v1. The
  unprefixed `/api/entities` (list), `/api/entities/types*` and `/api/credentials*`
  routes on the v2 branch are removed before merge. They exist only under `/api/v2`.
- **Version-neutral namespace:** `/api/meta` and `/api/meta/*` (§4, §5). These
  paths describe the API and never break. Like Kubernetes `/apis` discovery, they
  belong to no version.
- **Out of scope:** `/api/{name}-integration/*` (adopter routes),
  `/admin/*`, `/health*`. Adopters version their own routes.

Why path over header:

- **API Gateway routes by path.** Frigg maps paths to Lambda functions, and
  the auth and admin tiers differ by function. A header cannot pick a
  function, an authorizer or a WAF rule without a custom authorizer.
- **Self-hosted clients cannot assume a default.** A versioning header needs
  a policy for requests that leave it out. GitHub defaults to the oldest
  version and Stripe to the account pin. A Frigg server has neither: its
  default would be "whatever core this adopter deployed", so the same
  request would behave differently from app to app.
- **Visible by default.** `curl`, browser devtools, logs, CloudWatch metrics
  by route, and an agent reading an OpenAPI spec all see the version without
  knowing a custom header.
- **Every self-hosted analog does this** (GitLab, Mattermost, n8n, Airbyte,
  Kubernetes, Grafana).

### 2. Lifecycle is tied to core semver (the version is not pinned to it)

The API major is its own small integer. It is **not** the core version: core 2.x
serves API v1 and v2, and core 3.x could still serve v2. Its lifecycle is bound
to core semver:

| Core release | Allowed Management API changes |
|---|---|
| Patch | Bug and security fixes. A security fix may tighten behavior. |
| Minor | **Additive only** within an existing major: new resources, new optional request fields, new response fields, new enum values, new capability flags. Adding a whole **new** API major counts as additive. Marking a major deprecated is allowed. |
| Major | Remove a deprecated API major. Change the default of an opt-out flag (§6). |

"Additive" follows GitHub's list. Clients must ignore unknown response fields
and unknown enum values. The v2 OpenAPI document states this rule.

A breaking change inside v2 needs a v3 prefix, not a v2 edit. Expect this to be
rare. Additive evolution plus capability flags (§4) covers most needs, as
`/api/v4` at GitLab and `/api/v1` at n8n show.

**Experimental routes:** a route can ship as `x-frigg-stability: beta` in the
spec and in `/api/meta`. Beta routes can change in a core minor, with a
changelog entry (Kubernetes and Backstage both do this). This lets the entity
proxy or multi-step authorize evolve after 2.0.1 without a v3.

### 3. No date-based versions now; leave room for them later

- No `Frigg-Version: 2026-10-01` request header in 2.0.1. The deployed core
  version already is the "date". A second timeline gives adopters two numbers
  to reconcile and maintainers a transform layer (Stripe's version change
  modules) to build and test for every change. GHES shows the result in
  self-hosted products: one supported date per server release.
- **Reserved:** the request header name `Frigg-API-Revision`. If fine-grained
  breaking changes inside a major are ever needed, a dated revision within the
  path major is the escape hatch (the Strapi `Strapi-Response-Format` pattern:
  middleware transforms, absence means the major's baseline). Introducing it is
  additive, so this decision does not block it.

### 4. Discovery: `GET /api/meta`

Unauthenticated, cheap, no database access. It is served by the `health`
function, which has no database or auth dependency, and declared as its own
HTTP API route.

```json
{
  "api": {
    "versions": {
      "1": { "status": "deprecated", "deprecatedAt": "2026-11-01", "sunset": null,
             "openapi": "/api/meta/openapi/v1.json" },
      "2": { "status": "stable", "openapi": "/api/meta/openapi/v2.json" }
    },
    "preferred": "2"
  },
  "capabilities": ["multiStepAuthorize", "entityProxy", "credentials"]
}
```

- **Capabilities** are stable string flags (Temporal pattern). Clients
  feature-detect additive v2 features with them instead of parsing core
  versions. A capability is added in the core minor that ships the feature,
  and is not removed within an API major.
- **Core version** (`frigg.coreVersion`) appears only for authenticated admin
  callers (`x-frigg-admin-api-key`). The unauthenticated response does not
  disclose it, following Directus's precedent.
- `entityProxy` appears only when the app enables the proxy (ADR-052 keeps it
  off by default), so a client learns from meta whether it can use it.
- Every v2 response carries `Frigg-API-Version: 2` (as `X-Shopify-API-Version`
  does), so a client can tell what served it even through proxies.

### 5. OpenAPI per major

- Core ships one hand-maintained or generated spec per major:
  `packages/core/openapi/v1.yaml` (documents the frozen v1 for migration) and
  `v2.yaml`. `info.version` is the core version that ships it.
  `x-frigg-api-version` is the major.
- Served at `/api/meta/openapi/v{n}.json`. An interactive Scalar UI is at
  `/api/meta/docs`. It can be turned off per app
  (`appDefinition.managementApi.docs: false`) and is off by default in
  production stages.
- **CI gate:** a breaking-change diff (for example `oasdiff breaking`) runs
  between the spec on the PR and the spec in the last released core of the same
  major. A breaking diff fails CI unless the route is marked beta.
- One route registry in core generates the router mounts, the OpenAPI paths
  and the devtools HTTP API route list. This removes the drift noted in Context.

### 6. Deprecation policy for v1

- **Deprecated** when 2.0.1 ships v2 as stable and `@friggframework/ui` has a
  release that uses only v2.
- **Signals on every v1 response:** `Deprecation: @<epoch of deprecation>`
  (RFC 9745), `Link: <https://docs.friggframework.org/api/migrate-v1-v2>;
  rel="deprecation"`, and `Sunset` (RFC 8594) once a removal release is
  scheduled.
- **Usage visibility for the adopter:** each v1 request writes one ADR-048
  record (`frigg.api.deprecated_route`, with `route`, `method`, `userId`, and the
  `Frigg-Client` header if present) and increments an ADR-011 counter. Adopters
  can measure their own v1 traffic before they upgrade.
- **Early opt-out:** `appDefinition.managementApi.v1: false` drops the v1
  routes from both the router and the generated HTTP API routes. This also
  shrinks the attack surface: v1 `/api/entity` has weaker checks than v2.
- **Removal:** in the next core major (3.0), and no earlier than **12 months**
  after v2 is stable. In 3.0 the flag defaults to `false`. One more major may
  allow `v1: true` if adopters ask for it. Because adopters choose when to take
  3.0, the effective window for any given app is open-ended. The policy commits
  only to this: v1 never disappears in a 2.x minor or patch.

### 7. API Gateway routing, and `/api/v2/reports` (not decided here)

- Declare **per-resource** HTTP API routes under `/api/v2`
  (`/api/v2/integrations`, `/api/v2/integrations/{proxy+}`, `/api/v2/entities`,
  `/api/v2/entities/{proxy+}`, `/api/v2/credentials[/{proxy+}]`,
  `/api/v2/authorize[/{proxy+}]`) on the `auth` function. **Never
  `ANY /api/v2/{proxy+}`:** it would catch any method or path that another
  function's routes under `/api/v2` do not declare (for example
  `PATCH /api/v2/reports/x`) and send it to the wrong Lambda.
- Path segments under `/api/v2/` are assigned only through the route registry
  (§5), so a new segment cannot collide with one another function owns.
- **`/api/v2/reports` stays where it is for now, and this ADR does not decide
  whether it is part of the v2 contract.** It is recorded as an open question
  because it is two questions, and the maintainer wants to think both through
  before choosing:
  1. **Administering the Frigg application.** Today's reports router (ADR-010)
     is an *admin* operation: deployment-wide, gated by the admin API key, run
     by the operator who deploys the app. It sits next to `/admin/scripts` in
     purpose, but under `/api/v2` in path. The question is where endpoints that
     *administer a Frigg app* live as a family (`/admin/*`, a separate admin
     API major, or an `admin` tag inside v2), and whether that family is
     versioned the same way as the Management API.
  2. **User-facing reporting.** Separately, a `/reports` resource *in* the
     Management API is expected, centred on one integration or on one user or
     organisation (for example sync health or usage for the caller's own
     integrations). It would carry user auth and ownership checks like every
     other v2 resource.
  Until this is decided, `/api/v2/reports` is not listed in `v2.yaml` or in the
  `/api/meta` capabilities, and the route registry reserves the `reports`
  segment so nothing else takes it.

### 8. `@friggframework/ui` and other clients

- Each ui major targets one API major, which is hard-coded in its client
  (Stripe's typed SDKs pin the same way). ui 2.x calls only `/api/v2/*`.
- On first use the client calls `GET /api/meta` and caches the result for the
  life of the `API` instance:
  - If `"2"` is not in `versions` (an older core, or a 404 from a pre-meta
    core), it throws `FriggApiVersionError`: *"@friggframework/ui 2.x needs
    Management API v2 (@friggframework/core >= 2.0.1). This server serves: v1."*
  - It gates optional UI (for example re-authorize buttons, proxy-based
    pickers) on `capabilities`.
- Every request sends `Frigg-Client: @friggframework/ui/<version>`, an
  informational User-Agent-like value that feeds the deprecation log.
- CLI, skills and MCP servers follow the same order: meta first, then
  capabilities. Agents get the OpenAPI URL from meta, not from a hard-coded path.

### Simplest version that does not paint Frigg into a corner

Ship in 2.0.1: the `/api/v2` prefix, `/api/meta` (versions and capabilities),
the `Frigg-API-Version` response header, `Deprecation`/`Link` on v1, the v1
usage log, and the v2 OpenAPI spec. Defer the CI spec-diff gate, the
`managementApi.v1` flag, and the Scalar UI if time is short. Do not build
`Frigg-API-Revision` or any date machinery until a need is shown.

## Migration for v1 consumers

| v1 | v2 | Change |
|---|---|---|
| `GET /api/integrations` (combined) | `GET /api/v2/integrations` + `GET /api/v2/integrations/options` + `GET /api/v2/entities` | Split responses |
| `POST /api/integrations`, `PATCH/DELETE/GET /api/integrations/:id[/...]` | Same sub-paths under `/api/v2/integrations` | Prefix |
| `GET/POST /api/authorize` | `/api/v2/authorize` (multi-step sessions) | New flow; single-step still supported as a one-step session |
| `POST /api/entity`, `GET /api/entity/options/:credentialId` | `POST /api/v2/entities`, `GET /api/v2/entities/options/:credentialId` | Plural + prefix |
| `/api/entities/:entityId[/test-auth\|/options\|/options/refresh]` | Same under `/api/v2/entities` | Prefix |
| — | `/api/v2/credentials[/...]`, `/api/v2/entities/:id/proxy`, `/api/v2/entities/types[/...]` | New |

(The final table is generated from the route registry. This table shows the
intended shape.)

Steps:

1. **Adopters on `@friggframework/ui`:** upgrade core to ≥ 2.0.1 **first**, then
   ui to 2.x. The ui error message says this if the order is wrong.
2. **Adopters with their own frontend or backend:** nothing breaks on the core
   upgrade. Watch for `Deprecation` headers and the `frigg.api.deprecated_route`
   log. Move calls per the table. Then set `managementApi.v1: false` to confirm
   nothing still uses v1.
3. **Agents and MCP:** read `/api/meta`, use v2 only, and fail clearly against
   pre-2.0.1 apps.
4. **Docs and skills:** the `frigg-management-api` and `frigg-user-actions`
   skills document v2 first, with v1 in a "legacy" appendix.

## Amendments to ADR-006

ADR-006 stays Accepted for its *content* decisions: drop the modules router,
plural entities, credentials, proxy, OpenAPI. Its *path* decisions are amended
by this ADR. This PR applies the following changes to ADR-006, with a status
note under its metadata that points here:

1. Route diagram: every v2 resource under `/api/v2/` (`entities`, `credentials`,
   `authorize` included). Remove the unprefixed `/api/entities`,
   `/api/credentials` and `/api/authorize/:sessionId` forms.
2. Documentation routes: replace `/api/docs`, `/api/openapi.json`,
   `/api/v1/docs`, `/api/v2/docs` with `/api/meta/docs` and
   `/api/meta/openapi/v{n}.json`.
3. "Backward compatible: v1 routes preserved during migration" becomes: "v1 is
   frozen and deprecated per ADR-053 §6, and removed no earlier than core 3.0."
4. "Current Route Map (v1)": `/api/modules/*` is already removed on `next`. Note
   it as removed, not deprecated.
5. Implementation phases: phases 1–4 are marked done, but `next` does not
   contain them. Only the removal of `/api/modules/*` is on `next`; the rest is
   on `feature/integration-router-v2-drop-modules-router` (PR #522). Change the
   status column to say so, and add phase 6 "route registry + `/api/meta` +
   deprecation headers (ADR-053)" and phase 7 "entity proxy hardening
   (ADR-052)".
6. `packages/schemas/schemas/api-*.schema.json` descriptions change from
   `/api/entities...` to `/api/v2/entities...`.

## Consequences

### Positive

- One rule that adopters, ui, and agents can all follow: the prefix is the
  contract, and the core major is when it can go away.
- No version-transform layer to maintain. A small team can keep the
  compatibility promise.
- Path routing keeps API Gateway, IAM, logs and metrics version-aware for free.
- `/api/meta` capabilities let ui and agents adapt to an adopter's core minor
  without a semver table.
- Adopters see their own v1 usage before upgrading, and can switch v1 off.
- Dated revisions remain possible later as an additive change.

### Negative

- A breaking change inside v2 is costly: it needs v3 or a beta label. This is
  intentional pressure toward additive design.
- Two route trees live in core for all of 2.x, which doubles the test surface
  (as ADR-006 already accepted).
- Until the `/api/v2/reports` question (§7) is settled, an admin-tier route
  sits under the same prefix as the user-tier v2 resources without being part
  of the v2 contract.
- ui and core upgrades are ordered (core first). Deployments that ship ui
  before core will error, but with a clear message.

### Neutral

- The API major number (2) matches the core major (2) by coincidence. Docs must
  say they are independent.
- Unprefixed `/api/*` permanently means v1. After v1 is removed, those paths
  return 404 (or 410 with a `Link` to the migration doc while v1 is
  disabled by flag).

## Alternatives Considered

1. **Date-based header versions (Stripe/GitHub style, `Frigg-Version: 2026-10-01`).**
   Rejected for now. Built for one hosted server and many clients on their own
   schedules. In Frigg the adopter decides the server version, so a date only
   restates the core release. It needs a default-when-absent policy that varies
   by deployment, and a transform layer the project cannot staff. GHES shows the
   self-hosted result: one supported date per release. Kept as a later,
   additive option (§3).
2. **Pin the API version to the core version** (`Frigg-API-Version: 2.3.1`, or
   paths per core minor). Rejected. Every core release would become a contract
   version. Clients would have to reason about semver ranges, and a patch would
   change what clients see. Lifecycle is tied to core semver instead (§2).
3. **Unprefixed plural paths beside v1 (ADR-006 as written).** Rejected.
   `GET /api/integrations`, `/api/entities/:id` and `/api/authorize` already
   carry v1 contracts, so v2 cannot take those paths without negotiation. The
   mixed design also left three sources disagreeing about where v2 lives.
4. **Media-type versioning** (`Accept: application/vnd.frigg.v2+json`). Rejected.
   It cannot drive API Gateway routing, it is invisible in logs and curl, ui
   and agents rarely set it, and GET caching then needs `Vary`.
5. **Header that selects the major on the same paths** (Strapi
   `Strapi-Response-Format` style). Rejected as the primary mechanism: path
   ambiguity and default-when-absent, as in 1. The pattern is kept for the
   reserved `Frigg-API-Revision` escape hatch.
6. **No versioning, rename in place with a grace period (Nango style).**
   Rejected. A hosted provider can enforce a grace period. Frigg cannot see
   or reach adopters' clients.
7. **Settle `/api/v2/reports` in this ADR** (either "keep it in v2 as an admin
   resource" or "move it to `/admin/reports`"). Deferred, not rejected: the
   answer depends on how Frigg routes administration of an app versus
   management of integrations, and on the user-facing reports resource. See §7
   and Open Questions.

## Open Questions

- **Admin routing versus integration management, and `/api/v2/reports`.**
  Where do endpoints that administer a Frigg application live (today's admin
  reporting router from ADR-010, `/admin/scripts`, and what follows), and are
  they versioned with the Management API? Separately, what does a user-facing
  `/reports` resource in the Management API look like, centred on an
  integration or on a user or organisation? The answer decides whether
  `/api/v2/reports` joins v2, moves under an admin namespace, or is replaced.
  Not decided; the maintainer is thinking it through.
- Should `/api/meta` serve the OpenAPI spec without auth in production? (Lean:
  yes for the static spec, which has no adopter data. Scalar UI off by default
  in production stages.)
- Exact 12-month floor vs. "next major only": confirm with adopters on long
  2.x support.
- Should multi-step authorize and the entity proxy carry `x-frigg-stability:
  beta` in 2.0.1? (Lean: proxy beta, authorize stable. ADR-052 already ships the
  proxy off by default.)

## Related

- [ADR-006](./006-integration-router-v2.md): Integration Router v2 (amended by this ADR)
- [ADR-052](./052-entity-proxy-security.md): Entity proxy security (the `/api/v2/entities/:id/proxy` contract)
- [ADR-043](https://github.com/friggframework/frigg/pull/646) (open PR #646): ADR lifecycle; this ADR merges as Accepted
- [ADR-010](./010-reporting-as-admin-operation.md): Reporting as an Admin Operation (`/api/v2/reports`)
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md): Telemetry & usage counters
- [ADR-048](./048-structured-logging.md): Structured logging (deprecation log record)
- `packages/core/integrations/integration-router.js`
- `packages/devtools/infrastructure/domains/shared/utilities/base-definition-factory.js`
- `packages/devtools/infrastructure/domains/admin-scripts/admin-script-builder.js`
- RFC 9745 (Deprecation), RFC 8594 (Sunset)
