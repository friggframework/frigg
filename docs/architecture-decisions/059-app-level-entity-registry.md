# ADR-059: App-Level Entity Registry

**Status**: Proposed
**Date**: 2026-10-15
**Deciders**: Sean Matthews

## Context

Frigg knows which entity types an app offers only by walking its integrations.
`getModulesDefinitionFromIntegrationClasses` (`packages/core/integrations/utils/map-integration-dto.js`)
collects every `Definition.modules[*].definition` from every declared integration, de-duplicates
them, and that list is what the app offers. It is called from five places on `next`:

| Call site | Uses the list for |
|---|---|
| `integrations/integration-router.js:112` (and every `moduleDefinitions:` after it) | `/api/authorize`, `/api/entity`, entity options, test-auth, module instances |
| `handlers/backend-utils.js:69` | Module definitions for request handling |
| `handlers/app-definition-loader.js:18` | The loaded app definition |
| `database/encryption/encryption-schema-registry.js:179` | Which credential fields are encrypted |
| `handlers/routers/health.js:42` | Health checks per module |

The v2 branch (`feat/management-api-v2`) keeps the same derivation.

That forces a module into some integration before anyone can connect it. Three cases need an
entity with no integration:

1. **Agents and MCP servers.** An entity is used through the entity proxy (ADR-052) or by an
   agent's tools. There is no sync, so there is nothing for an integration to do. Left Hook's
   internal MCP server needs each person's Google, Xero and HubSpot connections this way.
2. **Connect first, integrate later.** A product shows "Connect HubSpot" before the user picks
   what to sync with it (ADR-056's portal has the same need).
3. **Global entities** (ADR-024, ADR-056 `global`) are configured by the app owner once and bound
   by many integrations. They belong to the app, not to any one integration.

Today the workaround is an empty integration that exists only to declare a module. It creates an
integration record, shows up in integration lists, and puts the entity's ownership under an
integration's rules for no reason.

## Decision

### 1. An optional `entities` map on the app definition, merged with inference

```js
const appDefinition = {
    entities: {
        google:  { definition: GoogleWorkspaceDefinition, scope: 'individual' },
        hubspot: { definition: HubSpotDefinition },
        twilio:  { definition: TwilioDefinition, scope: 'global' },
    },
    integrations: [HubSpotSyncIntegration, ...],
};
```

- **Key = entity type name**, the name the API already uses (`entityType` in `/api/authorize`,
  `moduleName` on the entity). The key must equal the definition's `getName()` / `moduleName`;
  `frigg validate` rejects a mismatch, so there is one name per entity type everywhere.
- **Value**: `definition` (required) plus the app-level settings for that type: `scope`
  (ADR-058 level 4), `proxy` (ADR-052's per-module allow-list override), `display` (label, icon,
  description for UIs and `/api/v2/entity-types`).
- **Inference stays on by default.** The offered set is the registry entries **plus** every
  module bound by a declared integration, exactly as today. An app that adds no `entities` key
  behaves exactly as today.

### 2. One registry function replaces the five derivations

`getEntityTypeRegistry(appDefinition)` returns a map `name → { definition, sources, settings }`,
where `sources` lists `'app'` and/or each `integration:<name>` that binds it. All five call sites
read from it, so the encryption schema, health checks and the authorize routes all see
registry-only entity types. `getModulesDefinitionFromIntegrationClasses` stays as a deprecated
wrapper returning the registry's definitions.

**Conflict rule:** when the registry and an integration both supply a type with the same name,
they must be the same definition (same object, or the same package name and version).
Otherwise `frigg validate` and app load fail, naming both sources. Two different modules under one
entity type name is never what anyone means.

Settings layer per ADR-058: the registry entry is level 4; an integration's binding (level 2) or
`Definition.ownership` (level 3) overrides it for that integration only.

### 3. Registration can be made required, per app

```js
entities: { $infer: false, google: {...}, hubspot: {...} }
```

`$infer: false` turns inference off. Every module an integration binds must then appear in the
registry, and `frigg validate` lists the ones that do not. This is for apps that want one
explicit place to review everything that can be connected (security review, an MCP server's
tool surface). Inference stays the default because requiring registration would break every
existing app and duplicate every integration's `modules` for no gain where integrations are
already the source of truth.

### 4. API

- `GET /api/v2/entity-types` lists the registry: name, display, allowed scopes (ADR-058), and
  `usedBy` (integration names; empty for registry-only types).
- `POST /api/v2/authorize` accepts any registry type, with or without an integration.
- `GET /api/v2/entities` lists entities of registry-only types like any other (ADR-058 §4 fields).
- An entity whose type is no longer registered (removed from the registry and no integration
  binds it) keeps working for reads and deletion, is listed with `"registered": false`, and cannot
  be reauthorized or newly created.

## Consequences

**Positive.** Entities can exist without integrations, which agents, connect-first products and
global entities all need. One registry replaces five derivations, so the encryption schema and
health checks cannot drift from what can actually be connected. App-level per-type settings get
one home (scope, proxy allow-list, display). Apps that want explicit registration can have it.

**Negative.** Two ways to declare a module (registry and integration binding), reconciled by the
conflict rule. Five call sites change, though behind one function.

**Neutral.** No schema change: entity types are configuration, not data.

## Alternatives considered

1. **Inference only (today).** Rejected: forces placeholder integrations for every entity used
   without a sync.
2. **Required registration for every app.** Rejected as the default: breaking for every adopter,
   and it duplicates information integrations already carry. Kept as the `$infer: false` opt-in.
3. **Key the registry by an app-chosen alias** (for example `crm` for HubSpot). Rejected:
   aliases are binding names inside an integration (ADR-054 `modules: { crm: use(hubspot) }`); at
   app level a second name for the same type would make `entityType` ambiguous in the API.
4. **A separate `optionalEntities` list.** Rejected: whether a type is required is a property of a
   binding in an integration (ADR-056 `optional`), not of the type. The registry only says the
   type is available.

## Open questions

1. More than one entity per type at `global` scope (ADR-056 open question 5) would need named
   registry entries (`twilio:marketing`, `twilio:alerts`). Out of scope here.
2. Whether `display` belongs in the registry or on the API module definition with a registry
   override.
