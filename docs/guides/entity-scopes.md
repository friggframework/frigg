# Entity scopes and ownership

ADR-056 §3.1-§3.4 and the entity, integration and list parts of §3.6. Code: `packages/core/modules/scope-*.js`
(re-exported by `entity-scope.js`), used by the use cases for entities, integrations and authorization.

| File | Holds |
|---|---|
| `scope-resolution.js` | constants, scope resolution (`decideLevel`, `applyRequest`), ownership on create, `pickExistingEntity` |
| `scope-config.js` | reading and validating `ownership` settings at app-definition load |
| `scope-visibility.js` | the clauses a caller may see, `describeRecord`, list filters |
| `scope-policy.js` | `createScopePolicy`, the object a use case asks (`resolveOwnership`, `canUseEntity`, `accessContext`) |

## The model

Every entity (a connected account) has one **scope**:

| Scope | Owner (`userId`) | `organizationId` | Who sees it |
|---|---|---|---|
| `individual` | the person's individual user | the organization active when it was connected; null under `individualAcross: 'all'` or when connected with no organization | that person, in that organization |
| `organization` | the active organization's user | the same organization | every member of it |
| `global` | none | null | nobody through the tenant API (admin routes only, not built here) |

There is **no `scope` column**. The owner's user type already says it, so a stored row's scope is read, not
stored: no owner is `global`, the active organization's user is `organization`, the caller's individual user is
`individual`. (ADR-0016 §5 allows this; the `scope` enum and `[scope, moduleName]` index of ADR-056 come with
the `global` entity work, because `global` is the only scope the owner cannot tell.) Adding the column later is a
backfill of three values from the owner.

Integrations are owned by the person or the organization too, and carry `organizationId`: the active organization
at create time.

## Where a scope comes from

First match wins, each level overriding those below it; nothing intersects (§3.1):

1. request: `scope` on `POST /api/v2/authorize`, only from the deciding level's `allow` list
2. binding: `Definition.modules[key].scope` (what `use(module, { scope })` will set) or `Definition.entities[key].scope`
3. integration: `Definition.ownership.scope`
4. entity type: `appDefinition.entities[name].scope` (ADR-059 registry, `settings.scope`)
5. app: `appDefinition.ownership.scope`
6. default: `organization` when `user.primary` is `organization`, else `individual`

A setting is a scope or `{ default, allow }`. A request for `global`, or for a scope outside the deciding level's
`allow` list, answers 403 `SCOPE_NOT_ALLOWED` (the list is in `details.allowed`). `GET /api/v2/entities/types`
shows each type's `scope: { default, allow, source }` so a client can offer the choice.

Everything is validated at app-definition load (`loadAppDefinition` throws `OwnershipConfigError`): a bad scope,
an unknown `individualAcross`, an unknown `owner`, or an organization-owned integration that binds an
`individual` entity (§3.3). `listBindingScopes(appDefinition, registry, primary)` returns every binding's
resolved scope and its source; nothing prints it yet.

## Ownership on create

- `individual`: owner is the person (400 `IDENTITY_REQUIRED` naming `x-frigg-appuserid` if the request has no
  individual); `organizationId` is the active organization, or null under `individualAcross: 'all'`.
- `organization`: owner is the active organization's user (400 naming `x-frigg-apporgid` if none). Anyone in the
  organization may create one: there is no organization-admin check yet.
- `global`: refused (403) with a message saying the app owner creates them through admin routes.

This replaces `user.getId()` as the owner. `POST /api/v2/authorize` and the v1 `POST /api/authorize` both go
through `AuthorizeEntityForUser`. The module's `getEntityDetails` and `getCredentialDetails` get the **owner's** id
as their user id, and the credential is stored under it.

The v1 `POST /api/entity` (an entity for a credential the caller already holds) resolves its owner the same way,
through `CreateEntityFromCredential`, which calls `AuthorizeEntityForUser.resolveOwnership`. The credential must
belong to that owner (the organization's, for an organization type), or the answer is 400 `INVALID_CREDENTIAL`, the
same for a missing credential and a stranger's. Before this change the route took `user.getId()` and set no
organization; it also called a `findOrCreateEntity` that `Module` no longer has, so it failed on every call.

The v1 test-auth, `GET /api/entities/:id` and the two entity options routes build the `Module` for the entity's
owner (`entity.userId`), as v2 does, not for the caller. A member may use an organization's entity there, and a
token refresh during such a call updates the organization's credential instead of creating one under the member.

**An integration must use entities of one scope.** Its owner is the organization when every entity is
organization-scoped, otherwise the person (or what `Definition.ownership.owner` says). An integration is loaded by
its owner, who must own what it uses, so `ResolveIntegrationOwnership` refuses, with a 400 and **before anything is
written**, an integration that:

- mixes an organization entity with the person's own (`MIXED_ENTITY_SCOPES`), or names `owner: 'individual'` over
  organization entities;
- is organization-owned and uses an individual entity (`ORG_INTEGRATION_INDIVIDUAL_ENTITY`; the load-time check
  covers the declared scopes, this one the entities actually named);
- uses an entity whose scope the binding or `Definition.ownership.scope` does not accept (`ENTITY_SCOPE_MISMATCH`).

A global entity, an entity of another organization, and one that does not exist are all the same 404. An integration
that uses a global entity, or a person's and the organization's together, is a later change.

`CreateIntegration` also loads every entity's module before it writes the integration row, so a failure there leaves
no `IN_CREATION` row behind. A duplicate create (same owner, type, entities) is reused only within one organization;
see the legacy rules below for rows with none.

## Lists and access (§3.4, §3.6)

For the active organization, the caller sees:

```
organization entities of the active organization
owner = caller AND (organizationId = active
                    OR (individualAcross = 'all' AND organizationId IS NULL))      -- entities only
integrations owned by the caller or by the active organization, created in it
```

The same clause list (`ctx.clauses`, built once per request) is sent to the repository as one query
(`findEntitiesByOwnership`, `findIntegrationsByOwnership`: an OR of owner/organization pairs) and applied again in
memory (`describeRecord`) to every row returned, so a list and an access check cannot disagree, and a repository
that returns too much cannot widen a list. The check applies wherever an entity is loaded for use: creating an
integration, test-auth, options, delete, and the v1 entity routes. The v1 routes on one integration (get, patch,
delete, actions, test-auth) reach it through the same rule.

`/entities` and `/integrations` carry `scope`, `owner: { type, id }`, `organizationId` and `access` on every record,
and take `?scope=individual|organization` and `?owner=me|org` (a bad value is 400). `access` is `manage` for the
person's own, and for the organization's when the caller is an organization admin (see Organization roles); it is
`use` where only use is possible.

## Organization roles

Anyone in an organization may **use** its entities and integrations; only an organization **admin** may create,
change or delete them. Creating an organization-owned entity or integration, deleting an organization entity,
PATCH/DELETE of an organization integration, and re-authorizing or deleting an organization-owned credential are 403
`ORG_ADMIN_REQUIRED` for anyone else. A person always manages what they own themselves, whatever their role.

Who counts as an admin depends on how the caller authenticated (`user.getAuthSource()`):

| Auth source | Manages the organization |
|---|---|
| `shared-secret` (the `x-frigg-*` headers; the adopter's backend vouches for the caller) | always |
| `bearer-token` (Frigg's own `/user/login` token) | always, as before organization roles existed, unless the app sets `user.orgAdminGateBearerTokens: true`; then it is judged as `adopter-jwt` below, and since it carries no role and no membership role is read for it, it is a `MEMBER` |
| `adopter-jwt` | when its role is one of `user.orgAdminRoles`. The role is the token's role claim; when the token carries none, the `orgRole` stored on the caller's `OrganizationMembership` for the active organization (a legacy-pointer membership counts as `MEMBER`); when there is none, `MEMBER` |

**The token's role wins when it carries one**, so an IdP that demotes someone takes effect at once. The stored role
matters for tokens without a role claim: the row keeps the role the person's first token in that organization carried
(`MEMBER` if none), and an adopter may change it in the database. **A missing role is a `MEMBER`, never an admin.**

Why bearer tokens are not gated by default: a Frigg bearer token never carries a role, and in an organization-primary
app (whose default scope is `organization`) a gate would leave Frigg-UI users unable to connect anything, which was
not true before this change. Bearer tokens in an organization-primary app are minted for the organization user itself,
so treating them as the organization is the old meaning. An app that wants them gated opts in, knowing they will then
be members.

`user.orgAdminRoles` (default `['ADMIN']`, compared case-insensitively) is validated when the app definition
loads: a non-empty array of non-empty strings. Entities and integrations take their access from `describeRecord`;
credentials, which carry no organization of their own, from `scopePolicy.accessToOwnedBy(user, ownerId)`. Every gate
goes through one check, `assertCanManage` in `modules/use-cases/manage-access.js`.

**Credentials are not scoped in this change.** `/api/v2/credentials` still lists and fetches by owner, as before,
so a credential owned by an organization user is not listed to an individual-primary caller. Listing credentials
through the entities the caller may see is the next change.

**The entity proxy fails closed.** Until `managementApi.proxy.scopes` exists (F6), the proxy accepts only
`individual` entities and answers 403 `PROXY_NOT_ALLOWED` (`reason: 'scope'`) for an organization one: ADR-056 §3.5,
narrowest by default. An organization-primary app, whose entities are organization-scoped by default, cannot proxy
until it opts in with `proxy.scopes` once F6 lands.

## Legacy rows: an existing deployment keeps its entities

Rows written before `organizationId` existed have it unset. Nothing is migrated; the rule reads them:

| Row | Behaviour |
|---|---|
| owned by an organization user, no `organizationId` | the organization's own: the owner is unambiguous |
| owned by a person, request has **no** organization | visible, exactly as before |
| owned by a person, request has an organization | belongs to the person's legacy `IndividualUser.organizationId` pointer: visible there and nowhere else |
| integration with no `organizationId` | the same two person rules (never organization-independent, not even under `'all'`) |
| entity with no `organizationId` under `individualAcross: 'all'` | the person's, in every organization (null is what `'all'` writes) |

An app with no organizations sees the same rows through the same routes. An organization-primary app sees what it
saw, because those rows were owned by the organization user (`getId()`) and the person's entities show in the
organization their pointer names. Before ADR-056 §3.6 the pointer moved to the last organization a person used, so
someone who worked in two organizations before the upgrade finds their legacy rows in the last one.

**Creating the same integration again** returns the existing one, including a legacy one. An organization-owned
integration adopts a row with no `organizationId` whoever asks and whatever their own pointer says (its owner is the
organization); a person's adopts one only where the rows above would show it. Without that, an organization-primary
caller sending only `x-frigg-apporgid`, or whose pointer names another organization, would get a duplicate
integration and a second `ON_CREATE`.

Reauthorizing a legacy entity reuses it where the rule would show it; elsewhere it creates a new entity paired with
the organization ("the same account in two organizations is two entities").

Tests that pin this: `modules/entity-scope.test.js` ("legacy"), `modules/use-cases/__tests__/entity-scope-use-cases.test.js`
("legacy rows"), `integrations/tests/use-cases/integration-ownership.test.js` ("creating twice is idempotent...").

## Schema and release notes

`Entity.organizationId` and `Integration.organizationId`: nullable, in both Prisma schemas, with an index on
`[userId, organizationId]`, and one PostgreSQL migration (`20261016000000_add_entity_integration_organization`:
two `ADD COLUMN`s and two indexes, checked against `prisma migrate diff`). No data migration. Deliberately not a
relation to `User`: a deleted organization must leave its rows invisible, and `ON DELETE SET NULL` would turn them
into unscoped ones that the rules above then show.

- **Index lock.** The two `CREATE INDEX` statements are plain, not `CONCURRENTLY` (Prisma runs a migration in a
  transaction). Each takes a SHARE lock while it builds, so writes to `Entity` and `Integration` wait. Both tables are
  small in a typical deployment. On a very large one, run `CREATE INDEX CONCURRENTLY IF NOT EXISTS` with the same names
  first, then deploy.
- **v1 integration create** used to check no entity ownership at all (any caller could bind any entity id). It now
  runs the same `ResolveIntegrationOwnership` as v2 and answers 404 for an entity the caller may not use.
- **Entity proxy** refuses organization-scoped entities (see above).
- **Mixed integrations** (an organization entity with the person's own) are refused with a 400; before this change
  entity ownership was never checked, so they were neither refused nor meaningful.

On MongoDB a row without the field and a row with `null` are different to Prisma (`null` matches only an explicit
null), so every "no organization" match is `null OR { isSet: false }`. DocumentDB's raw `{ field: null }` matches
both.

## Things that bite

- **A provider field called `organizationId` is not ours.** `createEntity(entityData, { organizationId })` takes the
  organization as a separate argument, and the repositories write `organizationId` after the entity data when they
  return a row, so provider data cannot decide who sees an entity.
- **`OwnershipClause.userId` can hold an organization's id.** It is the owner's user id, and an organization-owned row
  is owned by the ORGANIZATION user.
- Binding scope is **enforced** only at the binding and integration levels (2 and 3). Entity type, app and default
  decide where a connection is created, so adding a registry scope later does not break integrations that already
  use older connections.
- A missing integration is a 404 through one predicate (`integration-not-found.js`), which the repositories use to
  build the error and the use case to match it. Entity and credential lookups keep their previous behaviour.

## Deferred

- `managementApi.proxy.scopes` and the real-Postgres isolation suite (F6).
- Credential scoping, and the
  `ORPHANED` status with removing a member.
- `GET /api/v2/me/organizations`, the org-admin `view` of members' individual entities.
- Integrations that use global entities or both scopes, binding resolution at integration create (picking the entity
  for a binding when the caller names none), the visibility callback, `global` entity admin routes and the `scope`
  column.
