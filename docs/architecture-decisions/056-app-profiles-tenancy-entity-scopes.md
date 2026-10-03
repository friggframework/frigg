# ADR-056: App Profiles, Tenancy and Entity Scopes

**Status**: Proposed
**Date**: 2026-10-03
**Deciders**: Sean Matthews

> **Proposed: needs the maintainer's review.** This ADR names the two ways Frigg is adopted, gives
> the adopter repository one documented shape, and adds ownership scopes to entities. 2.0.1 ships
> only the repo shape, `frigg init` and the docs. Entity scopes and the default UIs are 2.1.

## Context

### 1. The adopter repository has a shape, but only by convention

Frigg apps in production share a layout that no Frigg document describes:

```
my-app/
├── package.json          # optional root with npm workspaces ["backend", "frontend"]
├── backend/              # the Frigg app
│   ├── index.js          # app definition
│   ├── infrastructure.js
│   └── src/              # integrations, local api modules, admin scripts
├── frontend/             # optional: a React UI on @friggframework/ui
└── ui-extensions/        # optional: code deployed on partner platforms
    ├── <platform-a>/     # e.g. a HubSpot, Salesforce or Attio app, or an MCP app
    └── <platform-b>/     # one directory per platform, each its own npm package
```

The CLI already assumes `backend/`. `findNearestBackendPackageJson`
(`packages/core/utils/backend-path.js:5`, used by `frigg install`, `frigg generate` and
`frigg generate-iam`) accepts the working directory when it has `package.json` and `index.js`,
and otherwise walks up looking for `backend/package.json`. The devtools copy
(`packages/devtools/frigg-cli/utils/backend-path.js:9`) only looks for `backend/`, and
`frigg-cli/utils/repo-detection.js:105,177` checks for `backend/serverless.yml` and a
`backend/` directory.

`frigg init` contradicts this. `createStandaloneProject` in
`packages/devtools/frigg-cli/init-command/backend-first-handler.js:269-273` copies the backend
template into the project **root**, and then, when a demo frontend is requested, writes
`workspaces: ['backend', 'frontend']` into that same root `package.json` (line 294), naming a
`backend/` directory that was never created. The template directory it reads
(`frigg-cli/templates`) is not on `next`, so `frigg init` does not run today; open PR #639
brings a working scaffold, which also writes the backend at the root.

[ADR-022](./022-artifacts.md) defines **artifacts**: code that an API module helps generate but
that runs on the partner's platform (`frigg artifact init`). That is exactly what adopters put
in `ui-extensions/`. ADR-022 says where artifact *starters* live inside an API module package
(open question 4) but not where an adopter's artifact *source* lives. The frigg skill's
"monorepo layout" describes Frigg's own repository, not an adopter app.

### 2. Three UI surfaces, none of them the product's

| Surface | What it is | Who uses it | Deployed? |
|---|---|---|---|
| `@friggframework/ui` (`packages/ui/lib`) | React components: `IntegrationList`, `IntegrationHorizontal`, `QuickActionsMenu`, auth flows | End users managing their own integrations | Inside the adopter's frontend |
| devtools management UI (`packages/devtools/management-ui`, `frigg ui`) | A developer's local admin tool ([ADR-001](./001-use-vite-for-management-ui.md), [ADR-007](./007-management-ui-architecture.md)) | The developer, on their own machine | Never |
| Hand-built per-app frontends | e.g. an operations console with login, dashboard, syncs and settings pages built on `@friggframework/ui` | Staff of the adopting company | By the adopter, by hand |

### 3. Two adoption profiles

Looking across real deployments (a multi-tenant SaaS product embedding integrations for its
customers, a phone platform connecting to several CRMs, a company running internal operations
automations, and smaller single-household setups), there are two profiles.

| | **A. Product** | **B. Operations** |
|---|---|---|
| Who adopts | A software company building native integrations **for its customers** | A company (or a household, or one person) automating **its own** processes |
| Tenancy | Multi-tenant: many customer orgs | One org |
| Who connects accounts | Each end user or customer org connects its own | Members connect their own accounts **and** use org-shared accounts |
| UI | An integration portal: standalone white-label pages or components embedded in the product | An operations console: connections, sync status and history, actions, errors, admin scripts, reports, schedules |
| Auth | The product's identity: adopter JWT or a shared secret behind the product's backend | Staff login (SSO later; passkeys or magic link for personal use) |
| Partner platforms | Often ships `ui-extensions/` for partner marketplaces | Rarely |

"Personal" is a size of profile B, not a third profile. A single person or household runs the
same shape with one org and one or two members. With the near-$0-idle default scaffold from
PR #639 the cost floor is the KMS key: about $1/month, about $3/month in the first year with
automatic rotation.

[ADR-024](./024-global-entities.md) described three use cases (user integrations,
feature-powered integrations, internal automation). Those map onto this ADR as profile A, a
profile-A app using an app-scope entity, and profile B.

### 4. Browser-safe tenant auth does not exist yet (profile A)

A product-profile reference deployment had to build a separate backend-for-frontend (an auth
proxy) in front of Frigg, because none of the three auth modes is usable from a browser for a
multi-tenant product:

- **`adopterJwt` is a stub.** `GetUserFromAdopterJwt.execute`
  (`packages/core/user/use-cases/get-user-from-adopter-jwt.js:53`) throws 501 Not Implemented
  before its (commented-out) verification code.
- **`friggToken` login does not work with `primary: 'organization'`.** `LoginUser`
  (`core/user/use-cases/login-user.js:35`) returns the individual user whenever
  `individualUserRequired` is true, so the token is minted for the individual user's id, while
  `GetUserFromBearerToken` (`get-user-from-bearer-token.js:43`) looks that id up as an
  *organization* user when `primary` is `'organization'`.
- **`sharedSecret` (`x-frigg-*` headers) must never reach a browser.** It authorises any
  `appUserId` / `appOrgId` the caller names.

So the BFF validates the product's own credential, mints a short-lived token plus an HttpOnly
refresh cookie, and forwards to Frigg with the shared secret. The org id comes from the
server-verified token, and any `x-frigg-*` headers the client sends are dropped.

The same deployment built its own portal **without** `@friggframework/ui`: its own components;
a per-integration card state machine (Connect → Enable sync → Configure → Active, plus Sync now
and Disconnect); a JSON Schema form renderer (RJSF) that normalises the backend's JSONForms-style
config `uiSchema` and `enum` / `enumNames`; a static registry of supported integrations; and
sync-history and event pickers. Today's UI package did not cover the product portal.

It also derived the list of entities from `/api/integrations`, because v1 has no entity
collection route: `integration-router.js` serves `/api/entity` (POST) and
`/api/entities/:entityId[/...]`, but no `GET /api/entities`. The v2 API
([ADR-053](https://github.com/friggframework/frigg/pull/668)) adds the collection.

### 5. Shared entities are designed, not built

[`docs/guides/GLOBAL-ENTITIES-GUIDE.md`](../guides/GLOBAL-ENTITIES-GUIDE.md) and ADR-024
describe `isGlobal` app-owner entities that every user's integration can use. Nothing on `next`
implements them: neither `packages/core/prisma-mongodb/schema.prisma` nor
`packages/core/prisma-postgresql/schema.prisma` has an `isGlobal` field (`Entity` has `userId`,
`credentialId`, `moduleName`, `externalId`, `data`), and no code in `packages/core` or
`packages/devtools` references it. The admin routes and UI components ADR-024 lists as written
are not on `next` either.

What exists is user types: `User` with `type` INDIVIDUAL or ORGANIZATION, an individual's
`organizationId` link (`schema.prisma`, `model User`), and the app definition's user config
(`primary`, `individualUserRequired`, `organizationUserRequired`; `core/user/user.js:17`) read
by the use cases in `core/user/use-cases/`. There is no notion of an org admin, and no entity
that belongs to an org rather than a user.

### 6. Multi-level-auth APIs need two credentials from one module

Several APIs issue credentials at two ownership levels, and an integration often needs both:

- Slack: a bot token (workspace) and a user token (the person).
- Atlassian: a site-level connection and a user's OAuth grant.
- GitHub: an App installation token (the org) and a user-to-server OAuth token.

Today a module is bound once per integration, so the second credential has nowhere to go.

## Decision

### 1. Codify the adopter repository shape (2.0.1)

The adopter repo shape in Context §1 becomes the documented convention:

- **`backend/`** holds the Frigg app: `index.js` (app definition), `infrastructure.js`, `src/`,
  and its own `package.json`. It is the only required directory.
- **`frontend/`** (optional) holds the adopter's UI on `@friggframework/ui` and the v2 API.
- **`ui-extensions/`** (optional) is the home of [ADR-022](./022-artifacts.md) artifacts in an
  adopter repo: one subdirectory per platform (`ui-extensions/hubspot/`,
  `ui-extensions/mcp/`), each its own npm package. `frigg artifact init` writes there. They are
  **not** added to the root workspaces by default, because vendor CLIs usually install and
  bundle their own project directory.
- **Root `package.json`** is private and declares `workspaces: ["backend", "frontend"]` when a
  frontend exists. Root scripts delegate (`npm run start -w backend`).

`frigg init` changes to match:

- It writes the app into `backend/`, a root `package.json`, and a root `README.md` containing the
  tree above with one line per directory. `frontend/` and `ui-extensions/` are not created
  unless asked for (`--frontend`, `frigg artifact init`).
- It takes **`--profile product|operations`**. In 2.0.1 the profile only changes the generated
  app definition's user config and README text:
  - `product`: `primary: 'organization'`, `organizationUserRequired: true`, auth mode
    `sharedSecret` with the BFF note from Decision §3, and a README section on tenant auth.
  - `operations`: `primary: 'individual'`, `organizationUserRequired: false`, `friggToken`
    login, and a README section on staff access.
- **Default: prompt when interactive; `operations` when non-interactive (`--yes`, CI).**
  `operations` works end to end today with no extra component: one org, staff log in with
  `friggToken`, nothing has to be safe in a browser that the adopter does not control. `product`
  needs browser-safe tenant auth (Decision §3), which until adopter JWT lands means a BFF the
  adopter has to build. Defaulting to the profile that runs first time is the better first
  experience; a product team picks `--profile product` knowingly. The personal size is
  `--profile operations` with no extra flag.

2.0.1 scope is the repo shape, `init`, the docs, and the guide banner. Nothing in core changes
for this section.

### 2. Browser-safe tenant auth for the product profile

The product profile needs first-class browser-safe tenant auth.

- **Implement adopter JWT verification** in `GetUserFromAdopterJwt`:
  - keys from a JWKS URL (rotating, cached) or a shared HMAC secret;
  - `iss` and `aud` checks, `exp` / `nbf` with a small clock skew;
  - claims mapping in the app definition (`user.jwt.claims: { userId: 'sub', orgId: 'org_id',
    role: 'org_role' }`);
  - find-or-create the individual user and the org user, linking them through `organizationId`.
- **Fix org-primary login**: `LoginUser` and `GetUserFromBearerToken` must agree on which user
  id a `friggToken` is minted for when `primary` is `'organization'` (mint for the org user, or
  look up the individual user and resolve its org; a test covers both user-config combinations).
- **Until then, the BFF pattern is the supported approach** and is documented: the BFF verifies
  the product's own credential, mints a short-lived token plus an HttpOnly refresh cookie,
  calls Frigg with the shared secret, takes the org id from the server-verified token only, and
  drops any client-sent `x-frigg-*` headers.

### 3. Entity scopes (2.1)

Every entity has one **scope**:

| Scope | Owned by | Configured by | Usable by |
|---|---|---|---|
| `user` | One member | That member | That member's integrations |
| `org` | The org (company or household) | Org admins | Integrations of any member of that org |
| `app` | The app owner | The app owner (admin routes only) | Integrations in any org, where the integration binds the module at `app` scope (ADR-024's "global") |

**Data model.** `Entity` gains, in both Prisma schemas plus a PostgreSQL migration:

- `scope` enum `USER | ORG | APP`, default `USER`;
- `organizationId` (nullable FK to the ORGANIZATION-type `User`): set for `org` scope, set for
  `user` scope when the member belongs to an org (so an org can list its members' connections),
  null for `app`;
- `userId` keeps its meaning and is null for `org` and `app`;
- indexes `[scope, moduleName]` and `[organizationId, moduleName]`.

`scope: 'APP'` replaces ADR-024's `isGlobal` flag; one enum covers three levels where a boolean
covers two. Org membership gains a role: the individual `User` gets `orgRole`
(`MEMBER | ADMIN`, default `MEMBER`), set by the adopter JWT `role` claim in profile A or by
an org admin in profile B. The credential stays on the entity, so field-level encryption and
the repositories are unchanged.

**Permissions** (enforced in use cases, not handlers):

| Action | `user` | `org` | `app` |
|---|---|---|---|
| Create, reauthorize, delete | The owner | Org admin | App owner (admin routes) |
| See it exists, name, status | The owner; org admins (metadata only) | All org members | Integrations that use it; not listed to tenants |
| Use it in an integration | The owner's integrations | Any member's integration in the org | Any integration that binds it at `app` scope |
| Read credentials | Nobody through the API | Nobody through the API | Nobody through the API |

**Credential selection at runtime.** A module binding declares the scope it accepts. When an
integration is created, the use case resolves each binding to an entity id: a `user` binding to
an entity the caller owns, an `org` binding to an org entity of the caller's org (the caller
picks when there are several), an `app` binding to the app entity for that module. The resolved
ids are stored in `Integration.entities` as today, so loading an integration at runtime does not
change. Removing an `org` or `app` entity moves every integration that uses it to
`NEEDS_CONFIG`. Shared credentials make concurrent refresh more likely, which
[ADR-031](./031-concurrent-oauth-credential-refresh.md) and
[ADR-042](./042-in-process-single-flight-token-refresh.md) already address.

**Multi-level-auth APIs** bind the same module twice at different scopes, using
[ADR-054](https://github.com/friggframework/frigg/pull/669)'s `use()`:

```js
modules: {
    workspace: use(slack, { scope: 'org' }),                 // bot token, set up by an org admin
    me:        use(slack, { scope: 'user', optional: true }), // each member's user token, if granted
},
```

Handlers get both under `ctx.modules.workspace` and `ctx.modules.me` (ADR-054 keys `ctx.modules`
by the binding names the author chose). An `optional` binding that is not connected is absent
from `ctx.modules`. ADR-054's `use(module, extensionOptions?)` keys its second argument by
extension; this ADR reserves `scope` and `optional` as binding options in that object, so no
extension may be named `scope` or `optional`. ADR-054 also uses `scope: 'app' | 'instance'`
inside an extension's *subscription* contract; that is a different field on a different object,
and the docs say so where both appear. Bindings without `scope` default to `user`, so current
definitions keep their meaning.

**Management API v2** ([ADR-053](https://github.com/friggframework/frigg/pull/668)): entities
carry `scope` and `organizationId`; `GET /api/v2/entities` filters by `?scope=`; creating an
`org` entity through `/api/v2/authorize` requires an org admin; `app` entities are not created or
listed through the tenant API, only through the admin routes. These are additive fields and a
filter on routes ADR-053 already defines, so they do not block the v2 build. The entity
collection itself is evidence for v2: the product-profile reference deployment had to derive
entities from `/api/integrations` without it.

### 4. Default UIs (2.1)

Frigg ships two scaffolded **templates the adopter owns**, not black-box packages. Both are
built on `@friggframework/ui` and the v2 API, and are copied into `frontend/` by
`frigg init --frontend` (or later by `frigg generate frontend`):

- **Product portal** (profile A): standalone white-label pages and embeddable components for end
  users. It is built from the pieces the product-profile reference deployment proved: the
  per-integration card state machine (Connect → Enable sync → Configure → Active, Sync now,
  Disconnect), a JSON Schema form renderer that accepts the backend's config `uiSchema` and
  `enum` / `enumNames`, and sync history with event pickers. `@friggframework/ui` absorbs those
  pieces as components, and the integration list comes from the v2 API rather than a static
  registry.
- **Operations console** (profile B): connections (user and org scope), sync status and
  history, actions, errors, admin scripts, reports and schedules, with staff login.

**Reporting split.** User-facing reports (per integration, or per user or org: sync health,
usage) belong to the portal and the v2 management API. Admin reporting
([ADR-010](./010-reporting-as-admin-operation.md)) belongs to the console and the admin routes.
This is a proposed answer to ADR-053's open question on `/api/v2/reports` (its §7): the existing
admin reports router stays an admin surface, and a tenant-scoped reports resource, if added, is
a separate v2 resource.

### 5. Hosting the UIs (open)

Whether `frigg deploy` should publish the static UI assets (S3 + CloudFront, built from
`frontend/`) or leave hosting to the adopter is not decided here. See Open questions.

## Consequences

### Positive

- One repo shape that `frigg init`, the CLI's `backend/` lookup, the docs and real apps agree on.
- ADR-022 artifacts get a home in adopter repos.
- Org-shared and app-shared accounts become possible without per-member reconnects, and
  multi-level-auth APIs fit with no new module code.
- Profile A becomes usable from a browser without a custom BFF once adopter JWT ships.
- The UI templates start from components already proven in production, not from a blank page.

### Negative

- A schema migration on `Entity` and `User` in both databases (2.1).
- Permission checks spread to every entity read and integration create; they need thorough tests
  for each scope and role.
- Two UI templates to maintain alongside `@friggframework/ui`.
- `scope` and `optional` become reserved names in ADR-054's `use()` options.

### Neutral

- Existing entities stay `user` scope; existing integration definitions keep their meaning.
- `frigg init` output moves from the root into `backend/`; apps with the backend at the root keep
  working, because core's `findNearestBackendPackageJson` accepts a working directory that has
  `package.json` and `index.js`; the devtools copy, which only looks for `backend/`, should
  get the same fallback.

## Alternatives Considered

1. **One universal UI for both profiles.** Rejected: the portal is embedded, white-label and
   tenant-scoped; the console is a staff tool with admin scripts and cross-org views. One UI would
   either leak admin views to tenants or be too thin for staff.
2. **A black-box UI package (`@friggframework/portal`).** Rejected: every reference deployment
   customised its UI heavily. A template the adopter owns, built from shared components, keeps
   upgrades possible at the component level without blocking customisation.
3. **Per-integration auth-level flags instead of scopes** (`Definition.entities[key].global`,
   as in ADR-024). Rejected: a boolean covers two levels, not three, and it describes the
   integration, while ownership belongs to the entity that several integrations share.
4. **Tenancy as separate deployments** (one stack per customer org). Rejected as the default:
   it multiplies the fixed cost and the deploy time by the number of tenants, and still needs
   user and org scopes inside each stack for profile B. It remains possible for adopters who
   need hard isolation.
5. **Keep `isGlobal` from ADR-024 and add `isOrgShared`.** Rejected: two booleans allow invalid
   combinations; one enum does not.

## Open Questions

1. **The product-profile reference deployment.** Its review is folded into Context §4 and
   Decision §2-§4. Whether its BFF should become a Frigg package or stay a documented pattern
   once adopter JWT lands is still open.
2. **Default profile for `frigg init`.** Recommended: prompt, `operations` when
   non-interactive. Alternative: always require `--profile`.
3. **SSO** for the operations console (OIDC first? SAML?) and whether it reuses the adopter JWT
   verifier.
4. **Household and team invites**: how an org admin invites a member in profile B (magic link,
   passkey enrolment), and whether invites need a new model.
5. **App-scope entity admin UX**: where the app owner connects `app` entities (operations
   console, `frigg` CLI, admin script), and whether there may be more than one `app` entity per
   module (named, selected by the binding).
6. **Migrating existing entities.** Proposed: all become `user`; entities whose `userId` points
   at an ORGANIZATION-type user become `org` with `organizationId` set. Needs a dry-run report
   before it runs.
7. **Integration ownership**: integrations stay owned by the member who created them; whether
   profile B needs org-owned integrations is not decided here.
8. **UI hosting**: `frigg deploy` publishing static assets (S3 + CloudFront) versus bring your
   own hosting.

## Phasing

| Release | Scope |
|---|---|
| **2.0.1** | Repo shape documented; `frigg init` writes `backend/`, root `package.json` and README, takes `--profile`; adopter docs for the two profiles and the BFF pattern; status banner on the Global Entities guide. **Candidate:** adopter JWT verification and the org-primary login fix (Decision §2), because without them profile A is not usable from a browser. |
| **2.1** | Entity scopes (schema, migration, permissions, credential selection, `use()` `scope` / `optional`); v2 API fields and filter; product portal and operations console templates; `@friggframework/ui` absorbs the portal components. |
| **Later** | SSO, household and team invites, app-scope admin UX, UI hosting through `frigg deploy` if chosen. |

## Related

- [ADR-010](./010-reporting-as-admin-operation.md): Reporting as an Admin Operation
- [ADR-022](./022-artifacts.md): Artifacts (live in `ui-extensions/`)
- [ADR-024](./024-global-entities.md): Global Entities (its `isGlobal` design is replaced by
  `scope: 'app'` if this ADR is accepted)
- [ADR-031](./031-concurrent-oauth-credential-refresh.md),
  [ADR-042](./042-in-process-single-flight-token-refresh.md): token refresh under concurrency
- ADR-053, Management API Versioning ([PR #668](https://github.com/friggframework/frigg/pull/668))
- ADR-054, One-File Integrations ([PR #669](https://github.com/friggframework/frigg/pull/669))
- [`docs/guides/GLOBAL-ENTITIES-GUIDE.md`](../guides/GLOBAL-ENTITIES-GUIDE.md)
