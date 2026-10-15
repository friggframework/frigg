# ADR-058: Ownership Defaults and Overrides (app → integration → entity)

**Status**: Proposed
**Date**: 2026-10-15
**Deciders**: Sean Matthews

> Builds on [ADR-056](https://github.com/friggframework/frigg/tree/adr/056-app-profiles) §3 (entity
> scopes), which this ADR does not repeat. ADR-056 gives every entity one scope (`individual`,
> `organization`, `global`) and lets a module binding declare the scope it accepts. This ADR adds
> where that scope comes from when the binding does not say, lets an integration and the app set it,
> and fixes what the list routes return when one caller can see entities of several scopes. If the
> maintainer prefers, it can be folded into ADR-056 §3 instead of standing alone.

## Context

1. **Ownership today is one app-wide switch.** `user.primary` (`individual` or `organization`)
   decides `User.getId()` (`packages/core/user/user.js:29-37`), and every use case stamps
   `userId = user.getId()` on what it creates (`integration-router.js` `/api/authorize`,
   `/api/integrations`). So in an organization-primary app every entity belongs to the org user,
   and in an individual-primary app every entity belongs to the person. An app cannot hold both.
2. **Real apps need both.** Left Hook's internal Frigg app (organization-primary) runs company
   syncs on org-owned credentials (Xero, HubSpot, Mercury) and now needs each staff member to
   connect their own Google and Xero for an internal MCP server. A product app (ADR-056 profile A)
   needs an org-level Slack bot token and each member's own Slack user token in the same
   integration. In an organization-primary app, an `x-frigg-appuserid`-only request today resolves
   to no owner at all (`getId()` returns the missing org user's id: `undefined`).
3. **ADR-056 fixes the data model but leaves the default implicit.** A binding without `scope`
   means `individual`. There is no way to say "everything in this app is organization-owned unless
   stated", or "this integration's bindings are organization-scoped", without repeating `scope` on
   every binding of every integration.
4. **The list routes do not say whose things they return.** `/api/entities`, `/api/integrations`
   and the v2 `/api/v2/credentials` return records keyed by `userId` with no indication of whether
   the caller owns them personally, through their organization, or not at all.

## Decision

### 1. Scope is resolved by the most specific level that sets it

The scope a binding accepts (and therefore the scope a new entity is created with when it is
connected for that binding) is the first one found in this order:

| # | Level | Where it is set | Applies to |
|---|---|---|---|
| 1 | **Request** | `scope` on `POST /api/v2/authorize`, when the effective setting allows more than one | One connection |
| 2 | **Entity (binding)** | `use(module, { scope })` ([ADR-054](https://github.com/friggframework/frigg/tree/adr/054-055-one-file-integrations)), or `Definition.entities[key].scope` on a classic `IntegrationBase` | That binding in that integration |
| 3 | **Integration** | `Definition.ownership.scope` | Every binding of that integration that sets none |
| 4 | **App entity type** | `appDefinition.entities[name].scope` ([ADR-059](./059-app-level-entity-registry.md)) | That entity type wherever it is connected without an integration, and every binding of it that sets none above |
| 5 | **App** | `appDefinition.ownership.scope` | Everything that sets none above |
| 6 | Framework default | | `individual` (ADR-056's default, unchanged) |

Each level overrides the ones below it; nothing intersects. A setting is either one scope
(`'organization'`) or a default plus the scopes a request may choose:

```js
ownership: { scope: { default: 'individual', allow: ['individual', 'organization'] } }
```

Level 1 can only pick from the `allow` list of the level that decided, and an `organization`
choice still requires an org admin (ADR-056 permissions). `global` is never chosen by a tenant
request; it comes from configuration and the admin routes only.

### 2. Ownership is decided by scope, not by `user.primary`

The owner written on a new entity is the `User` row that matches its resolved scope: the caller's
INDIVIDUAL user for `individual`, the caller's ORGANIZATION user for `organization`, none for
`global` (ADR-056 data model). Use cases take the `User` and the resolved scope instead of
`user.getId()`. `user.primary` keeps only its other jobs (which user a password or bearer token
logs in, and the default for level 5 when `ownership` is absent: `organization`-primary apps
default to `organization`, so existing apps keep their meaning).

A request whose resolved scope needs a user it does not carry fails with **400**, naming the
missing header or claim (for example `organization` scope with no `x-frigg-apporgid`), instead of
today's silent `undefined` owner.

### 3. Integration ownership can be set, and is validated against its bindings

ADR-056 derives an integration's owner from the scopes of the entities it uses. This ADR keeps that
as the default (`Definition.ownership.owner: 'derive'`) and allows an explicit
`'individual'` or `'organization'`. Rules, checked by `frigg validate`
([ADR-051](https://github.com/friggframework/frigg/pull/666)) and again at create:

- An **organization-owned** integration may bind `organization` and `global` entities only. Binding
  an `individual` entity is rejected: a shared integration must not run on one person's credential.
- An **individual-owned** integration may bind any scope it can resolve (ADR-056's "mixed" rule).
- `global` entities never decide ownership (ADR-056).

### 4. List routes return mixed ownership and say whose each record is

`GET /api/v2/entities`, `/api/v2/credentials` and `/api/v2/integrations` return everything the
caller may see under ADR-056's permissions, across scopes, in one list. Every record carries:

```json
{ "scope": "organization", "owner": { "type": "organization", "id": "17" }, "access": "use" }
```

- `scope`: the record's scope (a credential reports its entity's scope; an integration reports
  `individual` or `organization` from §3).
- `owner`: the owning user row, typed. `global` records have `owner: null`.
- `access`: what this caller may do: `manage` (create, reauthorize, delete), `use` (bind it,
  proxy through it), or `view` (metadata only, e.g. an org admin seeing a member's connection).
- Filters: `?scope=individual|organization|global` and `?owner=me|org`. Default: all visible.
- `global` entities appear only where ADR-056 lists them (to integrations that bind them and to
  admin routes), never in a tenant's entity list.

Credentials never return secret fields at any scope (ADR-056).

### 5. The entity proxy follows scope, defaulting to the narrowest

[ADR-052](https://github.com/friggframework/frigg/tree/adr/052-053-management-api)'s ownership
check ("the entity must belong to the caller") becomes: the caller has `use` access to the entity
under §4. Because proxying through a shared credential lets any member act on the org's account,
`managementApi.proxy.scopes` (default `['individual']`) lists the scopes the proxy accepts; an
app opts in to `organization` explicitly.

### 6. Data model

No schema change beyond ADR-056's `Entity.scope`. Integration ownership is the `userId` it already
has (an INDIVIDUAL or ORGANIZATION user row), so `scope` on an integration is derived, not stored.
`ownership` is a new optional key on the app definition and on integration definitions, added to
`app-definition.schema.json` with ADR-051.

## Example: Left Hook internal

```js
const appDefinition = {
    user: { primary: 'organization', organizationUserRequired: true },
    ownership: { scope: 'organization' },          // level 5: company syncs stay org-owned
    entities: {                                    // ADR-059 registry, level 4
        google: { definition: GoogleWorkspace, scope: 'individual' },
        xero:   { definition: Xero, scope: { default: 'organization', allow: ['organization', 'individual'] } },
    },
    managementApi: { proxy: { enable: true, scopes: ['individual'] } },
    integrations: [XeroIntegration /* org-owned sync */, ...],
};
```

A staff member's MCP request carries `x-frigg-appuserid` (the person) and `x-frigg-apporgid` (the
company). Connecting Google creates an `individual` entity owned by that person; the company's
Xero sync keeps its `organization` entity; the person can also connect their own Xero
(`allow` includes `individual`), and the proxy reaches only `individual` entities.

## Consequences

**Positive.** One app can hold personal and shared connections. Ownership stops depending on
`user.primary`, which removes the `undefined`-owner failure. Existing apps keep their behaviour
through the level-5 default derived from `primary`. The list routes become self-describing, which
the default UIs (ADR-056 §5) and MCP clients both need.

**Negative.** Every use case that writes `userId = user.getId()` changes to resolve scope first;
that is the main cost, and it lands with ADR-056's port. A six-level chain is more to explain than
one switch; `frigg validate` should print the resolved scope per binding so nobody has to compute it.

**Neutral.** `ownership` is optional everywhere; an app that sets nothing behaves as today.

## Alternatives considered

1. **Intersect the levels** (a binding may only narrow what the integration allows). Rejected:
   harder to reason about, and the owner asked for plain overrides. Validation (§3) covers the one
   combination that is unsafe.
2. **Keep `user.primary` as the owner rule and add scope only for exceptions.** Rejected: it keeps
   the `undefined`-owner failure and makes `primary` mean two unrelated things.
3. **Store `scope` on `Integration`.** Rejected: it is derivable from `userId`'s user type and the
   bound entities, and a stored copy can disagree.

## Open questions

1. Whether level 1 (request) is needed in 2.1, or only configuration levels.
2. Whether `access` should include `reauthorize` separately from `manage` for org members.
3. Fold into ADR-056 §3, or keep as its own record.
