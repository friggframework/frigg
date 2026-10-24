# ADR-017 Amendment 1: `coreExtensions` holds the runtime core extensions

**Status**: Proposed
**Date**: 2026-10-24
**Amends**: [ADR-017 Core Extensions](./017-core-extensions.md)

## Context

ADR-017 puts Core Extensions on `appDefinition.extensions`, as a keyed object
`{ <binding>: { extension, config } }`. The first core extensions to ship (the
db-credentials extension, with the Netlify provider) need a different contract:
a Prisma schema fragment, encrypted fields, an admin route and a bootstrap hook.
That contract was first written as an array on the same `extensions` key. Two
shapes on one key cannot both validate (ADR-051).

## Decision

1. **`appDefinition.coreExtensions` is an array of runtime core extensions.**
   Each entry is `{ name, schema?, encryption?, routes?, bootstrap? }`:
   - `name` (required): the extension's name.
   - `schema`: path to a `.prisma` fragment with the extension's models.
   - `encryption`: `{ <Model>: { fields: [...] } }`, merged into the field-level
     encryption schema after core's fields, the app's schema and module fields,
     never replacing them.
   - `routes`: `{ path, handler }`. `path` must be `/admin/<segment>…`; the route
     is served behind the admin API key, and the route registry (ADR-053) lists it
     so API Gateway routes and Netlify redirects come from one place.
     `/admin/scripts`, `/admin/db-migrate` and `/admin/queue` are reserved.
   - `bootstrap`: a function, or a module path, run once per process after the
     database connects.

   `packages/core/extensions/extension-loader.js` and
   `packages/schemas/schemas/app-definition.schema.json` enforce this.
2. **`appDefinition.extensions` stays reserved for ADR-017's keyed object.** The
   schema validates `{ <binding>: { extension, config? } }` there. The core loader
   ignores that object. An **array** at `extensions` stops the app at load with
   a message naming `coreExtensions`, so an app wired to the old key fails loudly
   instead of silently losing its extensions.
3. Integration-level `Definition.extensions` (ADR-018) is unchanged.

## Consequences

- Adopters wire runtime core extensions on `coreExtensions`. Examples in ADR-017
  that use the keyed object describe the planned hook/capability contract, which
  is not implemented yet.
- When the keyed object gains a runtime, it has to say how its bindings relate
  to `coreExtensions` entries. Until then the two keys do not overlap.
