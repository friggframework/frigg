# ADR-056: App Profiles, Tenancy and Entity Scopes

**Status**: Proposed
**Date**: 2026-10-03
**Deciders**: Sean Matthews

> **Proposed: needs the maintainer's review.** This ADR names the two ways Frigg is adopted, gives
> the adopter repository one documented shape, adds ownership scopes to entities, and adds a
> visibility callback to integration definitions. 2.0.1 ships only the repo shape, `frigg init`
> and the docs. Entity scopes, the visibility callback and the default UIs are 2.1, ported from
> the unmerged branch `claude/frigg-deployment-architecture-ed1CZ` (Decision §7).

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
| Who connects accounts | Each end user or customer org connects its own | Members connect their own accounts **and** use organization-shared accounts |
| UI | An integration portal: standalone white-label pages or components embedded in the product | An operations console: connections, sync status and history, actions, errors, admin scripts, reports, schedules |
| Auth | The product's identity: adopter JWT or a shared secret behind the product's backend | Staff login (SSO later; passkeys or magic link for personal use) |
| Partner platforms | Often ships `ui-extensions/` for partner marketplaces | Rarely |

"Personal" is a size of profile B, not a third profile. A single person or household runs the
same shape with one org and one or two members. With the near-$0-idle default scaffold from
PR #639 the cost floor is the KMS key: about $1/month, about $3/month in the first year with
automatic rotation.

[ADR-024](./024-global-entities.md) described three use cases (user integrations,
feature-powered integrations, internal automation). Those map onto this ADR as profile A, a
profile-A app using a `global` entity, and profile B.

**One deployment or two.** The deployment-architecture analysis on the unmerged branch
`claude/frigg-deployment-architecture-ed1CZ` (`DEPLOYMENT_ARCHITECTURE_ANALYSIS.md`, Dec 2025)
looked at a company that needs both profiles at once: a customer portal (profile A) and an
employee intranet (profile B). Its answer depends on the user tables:

- **Two deployments** when the customer app and the employee app keep separate user tables and
  separate auth. Each deployment has its own database, its own `global` entities and its own
  admin routes; integration code is shared through npm packages. Isolation is strong and the
  fixed cost doubles.
- **One deployment** when the host apps namespace their user ids (`appUserId:
  "customer:u_123"`, `"employee:e_456"`, likewise for `appOrgId`). `global` entities are then
  truly shared, admin is one view, and what each audience sees is filtered per request (the
  visibility callback, Decision §4).

So a profile is a property of an audience, not of a deployment: one Frigg deployment can serve a
product audience and an operations audience when user ids are namespaced, and the product and
operations profiles stay separate deployments when the user tables are separate.

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

### 5. Shared entities are built, but on an unmerged branch

[`docs/guides/GLOBAL-ENTITIES-GUIDE.md`](../guides/GLOBAL-ENTITIES-GUIDE.md) and ADR-024
describe `isGlobal` app-owner entities that every user's integration can use. **The code exists,
but only on the unmerged branch `claude/frigg-deployment-architecture-ed1CZ`** (Dec 2025; 122
commits ahead of `next` and 516 behind at the time of writing). That branch has
`Entity.isGlobal` with `[isGlobal]` and `[isGlobal, moduleName]` indexes in both Prisma schemas,
`isGlobal` support in the PostgreSQL, MongoDB and DocumentDB module repositories and in
`ProcessAuthorizationCallback`, global-entity admin routes (`/api/admin/entities`), a
management-UI global-entity screen with an OAuth credentials prompt, and, in commit `cbfa657c`,
entity scopes `individual | organization | global` and a visibility callback (Decision §3, §4).

On `next` none of this exists: neither `packages/core/prisma-mongodb/schema.prisma` nor
`packages/core/prisma-postgresql/schema.prisma` has an `isGlobal` field (`Entity` has `userId`,
`credentialId`, `moduleName`, `externalId`, `data`), and no code in `packages/core` or
`packages/devtools` references it.

What `next` has is user types: `User` with `type` INDIVIDUAL or ORGANIZATION, an individual's
`organizationId` link with the `OrgMembers` relation (`schema.prisma`, `model User`), the app
definition's user config (`primary`, `individualUserRequired`, `organizationUserRequired`;
`core/user/user.js:17`) read by the use cases in `core/user/use-cases/`, and
`User.ownsUserId`, which already lets a linked individual act for its organization user in
`GetModule`, `GetEntityOptionsById` and `RefreshEntityOptions`. There is no notion of an org
admin, the module repositories query entities by exact `userId` only, so a member cannot see the
organization user's entities, and an integration cannot say that one of its entities comes from
the organization.

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
    `sharedSecret` with the BFF note from Decision §2, and a README section on tenant auth.
  - `operations`: `primary: 'individual'`, `organizationUserRequired: false`, `friggToken`
    login, and a README section on staff access.
- **Default: prompt when interactive; `operations` when non-interactive (`--yes`, CI).**
  `operations` works end to end today with no extra component: one org, staff log in with
  `friggToken`, nothing has to be safe in a browser that the adopter does not control. `product`
  needs browser-safe tenant auth (Decision §2), which until adopter JWT lands means a BFF the
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

Every entity has one **scope**. The names follow the existing user types (INDIVIDUAL,
ORGANIZATION) and ADR-024's "global", which is also the vocabulary of the branch implementation:

| Scope | Owned by | Configured by | Usable by |
|---|---|---|---|
| `individual` | One member (an INDIVIDUAL-type `User`) | That member | That member's integrations |
| `organization` | The org (company or household; the ORGANIZATION-type `User`) | Org admins | Integrations of any member of that org |
| `global` | The app owner | The app owner (admin routes only) | Integrations in any org, where the integration binds the module at `global` scope (ADR-024) |

**Data model.** `Entity` gains, in both Prisma schemas plus a PostgreSQL migration:

- `scope` enum `INDIVIDUAL | ORGANIZATION | GLOBAL`, default `INDIVIDUAL`;
- an index `[scope, moduleName]` (the lookup for "the global entity for this module").

`userId` stays the owner, as on the branch: the member's INDIVIDUAL user for `individual`, the
ORGANIZATION user for `organization`, and null for `global`. Keeping the organization user as the
owner of org entities means `User.ownsUserId` and the existing `[userId]` index keep working,
and listing an org's entities is a `userId` query. Listing members' `individual` connections for
an org admin joins through `User.organizationId`, so `Entity` gets no `organizationId` column.

**`isGlobal` is migrated to `scope = 'GLOBAL'`, not kept beside it.** Recommended over keeping
`isGlobal` and adding `scope`, because two fields that both say "global" can disagree, and
`isGlobal` was never on `next`, so no 2.x database has it. The port (Decision §7) writes `scope`
wherever the branch writes `isGlobal`: the schemas, the repositories' create and filter paths
(`{ isGlobal: true }` becomes `{ scope: 'GLOBAL' }`), `ProcessAuthorizationCallback`, and the
admin routes. For a database created from a branch build, the migration sets
`scope = 'GLOBAL'` where `isGlobal = true` and then drops the column. In integration definitions,
the branch's `entities[key].global: true` stays accepted as a deprecated alias for
`scope: 'global'`.

Org membership gains a role: the individual `User` gets `orgRole` (`MEMBER | ADMIN`, default
`MEMBER`), set by the adopter JWT `role` claim in profile A or by an org admin in profile B. The
credential stays on the entity, so field-level encryption and the repositories' encryption are
unchanged.

**Permissions** (enforced in use cases, not handlers):

| Action | `individual` | `organization` | `global` |
|---|---|---|---|
| Create, reauthorize, delete | The owner | Org admin | App owner (admin routes) |
| See it exists, name, status | The owner; org admins (metadata only) | All org members | Integrations that use it; not listed to tenants |
| Use it in an integration | The owner's integrations | Any member's integration in the org | Any integration that binds it at `global` scope |
| Read credentials | Nobody through the API | Nobody through the API | Nobody through the API |

**Credential selection at runtime.** A module binding declares the scope it accepts. When an
integration is created, `CreateIntegration` resolves each binding to an entity id, as the
branch's `_resolveEntityByScope` does: an `individual` binding to an entity the caller owns (or
the one the caller selected), an `organization` binding to an entity owned by the caller's
organization user (the caller picks when there are several; an error when the caller has no
linked organization), a `global` binding to the global entity for that module. A required
`organization` or `global` binding that resolves to nothing fails the create. The resolved ids
are stored in `Integration.entities` as today, so loading an integration at runtime does not
change. `GetEntitiesForUser` takes the `User` and a scope (`individual`, `organization`,
`global` or all) instead of a bare user id. Removing an `organization` or `global` entity moves
every integration that uses it to `NEEDS_CONFIG`. Shared credentials make concurrent refresh more
likely, which [ADR-031](./031-concurrent-oauth-credential-refresh.md) and
[ADR-042](./042-in-process-single-flight-token-refresh.md) already address.

**Integration ownership.** `Integration.userId` is set from the scopes of the entities it uses
(rules from the branch analysis):

| Entities used | Integration owner |
|---|---|
| All `individual` | The individual |
| All `organization` | The organization (the ORGANIZATION-type `User`) |
| Mixed `organization` + `individual` | **The individual** |
| Mixed with `global` | The individual |

`global` entities do not decide ownership; the rule is applied to the remaining entities, so
`global` + `organization` only is organization-owned. Mixed integrations belong to the
individual because the individual holds the personal connection (their Slack, their mailbox), the
integration should go when that person leaves, and the organization's entity carries on for the
other members. An all-`organization` integration is created by an org admin and survives any
one member leaving.

**When a member leaves the organization** (an org admin removes them, or the individual's
`organizationId` is cleared), a `RemoveMemberFromOrganization` use case finds that member's
integrations that use one or more `organization` entities and **disables them with a new
`ORPHANED` status**, rather than deleting them. Recommended: disabling keeps the audit trail
(sync history, mappings, process records) for the organization that owned the data, takes the
integration out of service at once, and is reversible if the member is re-added. This needs:

- `ORPHANED` added to `IntegrationStatus` in both Prisma schemas (with a PostgreSQL migration),
  to the v2 API's status values, and to the UI's status display;
- a check that an `ORPHANED` integration cannot be re-enabled until its owner is again a member
  of an organization that owns the entities it uses;
- deletion of an `ORPHANED` integration (by the member, an org admin, or a retention policy) to
  go through the ordered cleanup of [ADR-032](https://github.com/friggframework/frigg/pull/641)
  (Integration Deletion Data Cleanup), so syncs, associations, mappings and their children are
  removed with it. Deleting at once instead of disabling is the rejected alternative: it is
  cleaner but loses the audit trail at the moment it is most likely to be asked for.

The member's `individual` entities and their integrations that use no `organization` entity are
left as they are.

**Multi-level-auth APIs** bind the same module twice at different scopes, using
[ADR-054](https://github.com/friggframework/frigg/pull/669)'s `use()`:

```js
modules: {
    workspace: use(slack, { scope: 'organization' }),               // bot token, set up by an org admin
    me:        use(slack, { scope: 'individual', optional: true }), // each member's user token, if granted
},
```

Handlers get both under `ctx.modules.workspace` and `ctx.modules.me` (ADR-054 keys `ctx.modules`
by the binding names the author chose). An `optional` binding that is not connected is absent
from `ctx.modules`. ADR-054's `use(module, extensionOptions?)` keys its second argument by
extension; this ADR reserves `scope` and `optional` as binding options in that object, so no
extension may be named `scope` or `optional`. ADR-054 also uses `scope: 'app' | 'instance'`
inside an extension's *subscription* contract; that is a different field on a different object
with different values, and the docs say so where both appear. On a classic `IntegrationBase`
subclass the same option is `Definition.entities[key].scope`, as on the branch. Bindings without
`scope` default to `individual`, so current definitions keep their meaning.

**Management API v2** ([ADR-053](https://github.com/friggframework/frigg/pull/668)): entities
carry `scope` and their owner (`userId`, plus the owning `organizationId` for `organization`
entities, derived from the owner); `GET /api/v2/entities` filters by
`?scope=individual|organization`; creating an `organization` entity through
`/api/v2/authorize` requires an org admin; `global` entities are not created or listed through
the tenant API, only through the admin routes. These are additive fields and a filter on routes
ADR-053 already defines, so they do not block the v2 build. The entity collection itself is
evidence for v2: the product-profile reference deployment had to derive entities from
`/api/integrations` without it.

### 4. Visibility callback (2.1)

An integration definition may say who can see it:

```js
static Definition = {
    name: 'premium-sync',
    visible: (context) => context.user?.plan === 'premium', // optional; default: visible
    modules: { /* ... */ },
};
```

- **`Definition.visible(context) => boolean | Promise<boolean>`**, optional. No `visible` means
  visible to everyone, so existing definitions do not change.
- **Applied in `GetPossibleIntegrations`**, which filters the integration options it returns
  (the `/api/integrations` options list, `/api/integrations/options`, and the v2 options route).
  A callback that throws hides the integration and logs through the ADR-048 logger: failing
  closed is the safe default for a beta or a paid tier. An unauthenticated options request gets a
  `null` context, so only integrations without a `visible` callback, or whose callback accepts
  `null`, are listed.
- **The host app supplies the context.** Frigg passes `{ user }` (the authenticated Frigg user)
  and whatever the host adds: the org, the plan, feature flags. In profile A the adopter JWT
  claims (Decision §2) or the BFF are the natural source; in profile B the staff login. Frigg
  does not define the context's shape, store capabilities, or bundle a feature-flag SDK.
- **Visibility is not authorisation.** It decides which options are offered. Creating an
  integration still goes through the entity scope and permission checks of Decision §3.
  Visibility ("can this user see this option?") and entity scope ("where do this integration's
  entities come from?") are independent, as the branch analysis notes.
- **ADR-054**: `defineIntegration({ name, visible, modules, ... })` takes `visible` as an option
  and copies it onto the generated static `Definition`, so one-file and classic integrations
  behave the same.

This is what the product profile needs for **beta rollouts** (show a new integration to flagged
orgs only), **premium tiers** (gate integrations by plan) and **gradual rollout** (percentage
flags in the host's flag service), and, with namespaced user ids, what lets one deployment serve
a product audience and an operations audience (Context §3).

**Capability Context was considered and rejected for now.** The branch analysis first proposed
a structured "Capability Context": a `requires` block on definitions, context loaded from JWT
claims, a callback, or `x-frigg-*` headers in a fixed resolution order, and a pluggable feature
flag interface. Its own adversarial review rejected that as over-engineered for current needs:
about 500 lines and a dozen new concepts against about 30 lines and one concept, a forced JWT and
header structure on the host app, and harder tests. The simple callback ships first. **Revisit
when three or more adopters need a structured, shared context shape**, when clear patterns
emerge across adopters, or when the callback proves insufficient.

### 5. Default UIs (2.1)

Frigg ships two scaffolded **templates the adopter owns**, not black-box packages. Both are
built on `@friggframework/ui` and the v2 API, and are copied into `frontend/` by
`frigg init --frontend` (or later by `frigg generate frontend`):

- **Product portal** (profile A): standalone white-label pages and embeddable components for end
  users. It is built from the pieces the product-profile reference deployment proved: the
  per-integration card state machine (Connect → Enable sync → Configure → Active, Sync now,
  Disconnect), a JSON Schema form renderer that accepts the backend's config `uiSchema` and
  `enum` / `enumNames`, and sync history with event pickers. `@friggframework/ui` absorbs those
  pieces as components, and the integration list comes from the v2 API (already filtered by the
  visibility callback) rather than a static registry.
- **Operations console** (profile B): connections (`individual` and `organization` scope), sync
  status and history, actions, errors, admin scripts, reports and schedules, with staff login.
  The branch's management-UI global-entity screen and OAuth credentials prompt (Decision §7) are
  the starting point for its `global` entity admin.

**Reporting split.** User-facing reports (per integration, or per user or org: sync health,
usage) belong to the portal and the v2 management API. Admin reporting
([ADR-010](./010-reporting-as-admin-operation.md)) belongs to the console and the admin routes.
This is a proposed answer to ADR-053's open question on `/api/v2/reports` (its §7): the existing
admin reports router stays an admin surface, and a tenant-scoped reports resource, if added, is
a separate v2 resource.

### 6. Hosting the UIs (open)

Whether `frigg deploy` should publish the static UI assets (S3 + CloudFront, built from
`frontend/`) or leave hosting to the adopter is not decided here. See Open questions.

### 7. Implementation path: port from the branch, do not rebase

The 2.1 work in Decision §3 and §4 is **ported fresh onto `next`** from
`claude/frigg-deployment-architecture-ed1CZ` (tip `ea115b3a`), not rebased or merged. The branch
is 516 commits behind `next`; its large squash commit (`98b349f6`) also rewrites admin scripts,
credentials, the CLI and docs that `next` has since changed, so a rebase would mean resolving
hundreds of unrelated conflicts. The port takes the files and use cases below, renames
`isGlobal` to `scope` (Decision §3), and adds tests on both databases.

| Take | From | Commit |
|---|---|---|
| `Definition.visible` in `GetPossibleIntegrations` (sync and async, fail closed) and its 272-line test; the router passing `{ user }` as context on the options routes | `integrations/use-cases/get-possible-integrations.js` (+ `.test.js`), `integrations/integration-router.js` | `cbfa657c` |
| Scope resolution in `CreateIntegration` (`_resolveEntityByScope`, `global: true` alias) | `integrations/use-cases/create-integration.js` | `cbfa657c` |
| Scoped entity queries (`individual`, `organization`, `global`, all) | `modules/use-cases/get-entities-for-user.js` | `cbfa657c` |
| `Entity.isGlobal` and its indexes (ported as `scope`); `User.organizationId` and the `OrgMembers` relation are already on `next` | `prisma-postgresql/schema.prisma`, `prisma-mongodb/schema.prisma` | `98b349f6` |
| Create and filter support in the module repositories | `modules/repositories/module-repository-{postgres,mongo,documentdb}.js`, `module-repository.js` | `c0300345`, `98b349f6` |
| Creating a global entity from the OAuth callback | `modules/use-cases/process-authorization-callback.js` | `98b349f6` |
| Global-entity admin routes (`GET/POST /api/admin/entities`, `GET/PUT/DELETE /api/admin/entities/:entityId`, `POST .../test`), moved behind use cases on the way in, because the branch calls the repository from the handler | `handlers/routers/admin.js` | `be656fe0`, `2d8eb36f` |
| Management UI: `GlobalEntity` domain entity, `ManageGlobalEntitiesUseCase`, `GlobalEntityManagement.jsx`, and the OAuth credentials prompt (`EnvFileAdapter`, `CheckOAuthCredentialsUseCase`, `WriteOAuthCredentialsUseCase`, `OAuthCredentialsPrompt.jsx`) | `packages/devtools/management-ui/` | `8166bb77`, `8c6a0581`, `8d1d907b` |

New on the port, not on the branch: the `scope` enum and migration, `orgRole`, the integration
ownership rule in `CreateIntegration`, `RemoveMemberFromOrganization` and the `ORPHANED` status,
the v2 API fields, and `visible` on ADR-054's `defineIntegration`. The branch's design documents
(`DEPLOYMENT_ARCHITECTURE_ANALYSIS.md`, `docs/architecture/ADR-GLOBAL-ENTITIES.md`,
`docs/architecture/GLOBAL-ENTITIES-IMPLEMENTATION-PLAN.md`) are sources for this ADR and are not
ported.

## Consequences

### Positive

- One repo shape that `frigg init`, the CLI's `backend/` lookup, the docs and real apps agree on.
- ADR-022 artifacts get a home in adopter repos.
- Organization-shared and global accounts become possible without per-member reconnects, and
  multi-level-auth APIs fit with no new module code.
- Integration ownership and member offboarding have one rule, with an audit trail.
- Beta, premium-tier and gradual rollouts need one optional function on the definition, and one
  deployment can serve two audiences when user ids are namespaced.
- The 2.1 work starts from code that was written and tested, not from a blank page.
- Profile A becomes usable from a browser without a custom BFF once adopter JWT ships.
- The UI templates start from components already proven in production, not from a blank page.

### Negative

- A schema migration on `Entity` (`scope`), `User` (`orgRole`) and `IntegrationStatus`
  (`ORPHANED`) in both databases (2.1).
- Porting by hand from a branch 516 commits behind takes review effort, and the branch's code
  needs adapting (`isGlobal` to `scope`, admin routes behind use cases, the ADR-048 logger).
- Permission checks spread to every entity read and integration create; they need thorough tests
  for each scope and role.
- Two UI templates to maintain alongside `@friggframework/ui`.
- `scope` and `optional` become reserved names in ADR-054's `use()` options.
- A `visible` callback runs on every options request; slow callbacks (a remote flag lookup) slow
  the options list, so the docs recommend the host resolve flags into the context first.

### Neutral

- Existing entities stay `individual` scope; existing integration definitions keep their
  meaning, and integrations without `visible` stay visible to everyone.
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
   as in ADR-024). Rejected: a boolean covers two levels, not three. The binding declares the
   scope it accepts (`individual`, `organization` or `global`), and the entity records the scope
   it has; `global: true` stays as a deprecated alias.
4. **Tenancy as separate deployments** (one stack per customer org). Rejected as the default:
   it multiplies the fixed cost and the deploy time by the number of tenants, and still needs
   `individual` and `organization` scopes inside each stack for profile B. It remains possible
   for adopters who need hard isolation. Splitting by audience is a different case: two
   deployments, one per separate user table, are supported (Context §3).
5. **Keep `isGlobal` from ADR-024 and add `isOrgShared`**, or keep `isGlobal` beside the new
   `scope`. Rejected: two booleans, or a boolean and an enum, can disagree; one enum cannot. The
   organization level needs no flag at all, because the owner (`userId`) is the organization
   user.
6. **Rebase or merge `claude/frigg-deployment-architecture-ed1CZ`.** Rejected: 516 commits of
   drift, and a squash commit that touches far more than global entities (Decision §7).
7. **Structured Capability Context** instead of the visibility callback. Rejected for now by the
   branch's own adversarial review (Decision §4); revisit when three or more adopters need it.
8. **Delete a departing member's integrations that use organization entities.** Rejected in
   favour of `ORPHANED`: deletion is cleaner but loses the audit trail (Decision §3).

## Open Questions

1. **The product-profile reference deployment.** Its review is folded into Context §4 and
   Decision §2, §3 and §5. Whether its BFF should become a Frigg package or stay a documented pattern
   once adopter JWT lands is still open.
2. **Default profile for `frigg init`.** Recommended: prompt, `operations` when
   non-interactive. Alternative: always require `--profile`.
3. **SSO** for the operations console (OIDC first? SAML?) and whether it reuses the adopter JWT
   verifier.
4. **Household and team invites**: how an org admin invites a member in profile B (magic link,
   passkey enrolment), and whether invites need a new model.
5. **Global entity admin UX**: where the app owner connects `global` entities (operations
   console, `frigg` CLI, admin script; the branch has a management-UI screen), and whether there
   may be more than one `global` entity per module (named, selected by the binding).
6. **Migrating existing entities.** Proposed: all become `individual`; entities whose `userId`
   points at an ORGANIZATION-type user become `organization`; on a database created from a
   branch build, `isGlobal = true` becomes `global`. Needs a dry-run report before it runs.
7. **`ORPHANED` retention**: how long an orphaned integration is kept before ADR-032 deletion,
   and whether that is an app-definition setting.
8. **UI hosting**: `frigg deploy` publishing static assets (S3 + CloudFront) versus bring your
   own hosting.
9. **Visibility context from the adopter JWT**: whether Decision §2's claims mapping should also
   copy named claims (plan, flags) into the visibility context, so a profile-A app needs no
   extra code to feed `visible`.

## Phasing

| Release | Scope |
|---|---|
| **2.0.1** | Repo shape documented; `frigg init` writes `backend/`, root `package.json` and README, takes `--profile`; adopter docs for the two profiles and the BFF pattern; status banner on the Global Entities guide. **Candidate:** adopter JWT verification and the org-primary login fix (Decision §2), because without them profile A is not usable from a browser. |
| **2.1** | Port from `claude/frigg-deployment-architecture-ed1CZ` (Decision §7): entity scopes (schema, migration, permissions, credential selection, `use()` `scope` / `optional`), integration ownership rules and `ORPHANED`, the visibility callback (additive, so it may land first on its own), global-entity admin routes and management-UI screen; v2 API fields and filter; product portal and operations console templates; `@friggframework/ui` absorbs the portal components. |
| **Later** | SSO, household and team invites, global entity admin UX in the console, UI hosting through `frigg deploy` if chosen, Capability Context if its revisit trigger is met. |

## Related

- [ADR-010](./010-reporting-as-admin-operation.md): Reporting as an Admin Operation
- [ADR-022](./022-artifacts.md): Artifacts (live in `ui-extensions/`)
- [ADR-024](./024-global-entities.md): Global Entities. Its design is implemented on the
  unmerged branch `claude/frigg-deployment-architecture-ed1CZ`; if this ADR is accepted, its
  `isGlobal` flag is stored as `scope = 'GLOBAL'` and the code is ported to 2.x (Decision §7)
- [ADR-031](./031-concurrent-oauth-credential-refresh.md),
  [ADR-042](./042-in-process-single-flight-token-refresh.md): token refresh under concurrency
- ADR-032, Integration Deletion Data Cleanup ([PR #641](https://github.com/friggframework/frigg/pull/641)):
  the cleanup an `ORPHANED` integration goes through when it is deleted
- [ADR-048](./048-structured-logging.md): Structured Logging (visibility callback errors)
- ADR-053, Management API Versioning ([PR #668](https://github.com/friggframework/frigg/pull/668))
- ADR-054, One-File Integrations ([PR #669](https://github.com/friggframework/frigg/pull/669))
- [`docs/guides/GLOBAL-ENTITIES-GUIDE.md`](../guides/GLOBAL-ENTITIES-GUIDE.md)
- Branch `claude/frigg-deployment-architecture-ed1CZ` (tip `ea115b3a`):
  `DEPLOYMENT_ARCHITECTURE_ANALYSIS.md` (one vs two deployments, Capability Context and its
  adversarial review, entity ownership deep dive) and commit `cbfa657c` (visibility callback and
  entity scopes)
