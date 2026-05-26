---
name: frigg-canary-test
description: Test a published @friggframework/core canary version end-to-end against a self-contained minimal Frigg backend harness backed by a real PostgreSQL database (no mocks). Use when verifying a Frigg core canary build before merge, reproducing or regression-testing an integration use case, inspecting the real shape of persisted Frigg records (User/Credential/Entity/Integration), or when asked to "test a Frigg canary", "run the canary harness", or "spin up a minimal Frigg integration to test core".
---

# Frigg Canary Test

Run a published `@friggframework/core` canary against a real Frigg backend with a
**real PostgreSQL database**. Behavior is driven through actual `IntegrationBase`
subclasses, `createFriggCommands`, and the `IntegrationEventDispatcher` — the same
path production uses.

The harness is **bundled with this skill** at `assets/harness/`. Copy it to a
working location and run it there; never run it from inside `.claude/`.

## Quick start

```bash
# Copy the bundled harness from this skill's assets/harness/ to a scratch dir.
WORK=/tmp/frigg-canary-test            # any scratch dir outside .claude/
rm -rf "$WORK" && mkdir -p "$WORK"
cp -R <this-skill-dir>/assets/harness/. "$WORK/"
cd "$WORK"
cp .env.example .env                   # edit DATABASE_URL if needed (see below)

# 1. Pin the canary to test (omit to use the version already in package.json)
npm pkg set dependencies.@friggframework/core="2.0.0--canary.593.<HASH>.0"

# 2. Install, generate the Postgres client, migrate, test
npm install
npm run prisma:generate                # REQUIRED — builds the Postgres client
npm run prisma:migrate
npm test
```

A green run ends with `Results: 4 passed, 0 failed`.

## PostgreSQL setup

The harness needs a reachable Postgres and a **dedicated database** (never reuse a
project's dev DB). Two common cases:

- **A Frigg project's Docker Postgres is already running** (e.g. quo--frigg exposes
  `backend-postgres_container-1` on `localhost:5432`, user/pass `postgres`/`postgres`).
  Reuse the server but create an isolated database:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres \
    -tc "SELECT 1 FROM pg_database WHERE datname='frigg_canary_test'" | grep -q 1 \
    || PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE frigg_canary_test"
  ```

- **No Postgres running** — start one (`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine`)
  or use a local install, then create `frigg_canary_test` as above.

Set `.env` to point at the dedicated DB (see `.env.example`):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/frigg_canary_test
DB_TYPE=postgresql          # core selects the Postgres Prisma client from this
STAGE=dev                   # bypasses field-level encryption (data readable for inspection)
```

## Critical setup notes (learned the hard way)

- **`prisma:generate` is mandatory and separate from migrate.** The Postgres client
  is generated into `node_modules/@friggframework/core/generated/prisma-postgresql`.
  Skipping it (or running only `migrate deploy`) leaves the client missing and core
  fails to load. Always generate before migrate/test.
- **`DB_TYPE=postgresql` must be set** — core's `prisma.js` picks mongo vs postgres
  from it; without it the wrong (or no) client loads.
- **Pin a canary at/after the relevant fix.** Canaries publish per commit as
  `2.0.0--canary.<PR>.<short-sha>.0`; check `npm view @friggframework/core dist-tags.canary`
  and use the hash matching the PR HEAD, not an earlier build.

## What the FRI-498 test proves

`FindIntegrationContextByExternalEntityId` resolves an integration from an entity's
`externalId` **filtered by `config.type`**, so a single entity shared by multiple
integrations resolves to the right one (the bug returned the first integration for
the user).

The test seeds: a User, a Credential, one **shared** Entity, and two Integrations
(`config.type` = `test-api-a` and `test-api-b`) both bound to that same entity. It
then dispatches the `FIND_INTEGRATION_BY_EXTERNAL_ID` USER_ACTION on
`TestApiAIntegration`. The action takes **no params** — it sources inputs from the
hydrated integration itself, so the harness **loads context first, then dispatches**:

```javascript
const commands = createFriggCommands({ integrationClass: TestApiAIntegration });
const { context } = await commands.loadIntegrationContextById(integrationId);
const integration = new TestApiAIntegration({ ...context.record, modules: context.modules });
await new IntegrationEventDispatcher(integration)
    .dispatchJob({ event: 'FIND_INTEGRATION_BY_EXTERNAL_ID' });
```

Inside the action: `type = this.config.type`, `externalId = this.entities[0].externalId`.

Assertions: A resolves to A; B (same shared entity) resolves to B, **not** A (the
regression guard); unknown `config.type` → `INTEGRATION_NOT_FOUND`; missing `type` →
`TYPE_REQUIRED`.

## Where lookup inputs live on a hydrated integration

- `type` → `this.config.type`.
- `externalId` → the use case queries **`Entity.externalId`**, exposed at
  `this.entities[0].externalId` (also at `this['test-api-a'].entity.externalId` via the
  module instance). Note `Credential` has its own separate `externalId` column at
  `this['test-api-a'].credential.externalId` — **not** what the use case filters on.

## Integration structure conventions

The bundled integrations follow real production conventions (verified against
`AxisCareIntegration` in quo--frigg). Preserve these when adding integrations:

- **Wrap modules as `{ definition: <ModuleDefinition> }`** under `Definition.modules`.
  The declaration key is how the module attaches to `this` (`this.testApiA.api`).

  ```javascript
  static Definition = {
      modules: { testApiA: { definition: testApiA.Definition } }, // ✅
      // modules: { testApiA: testApiA.Definition },               // ❌ see gotcha below
  };
  ```

- **Use `createFriggCommands`** (public API), not `createIntegrationCommands` (internal).
  It exposes the same integration commands plus user/entity/credential commands.
- **No `static modules` field.** The framework only reads `Definition.modules`; a
  `static modules` field is harness cruft.
- **Namespace a shared module** by overriding `getName`/`moduleName` inside its
  `definition` (AxisCare mounts `quo` as `quo-axisCare`):

  ```javascript
  modules: { quo: { definition: { ...quo.Definition, getName: () => 'quo-axisCare', moduleName: 'quo-axisCare' } } }
  ```

## Gotcha

- **Missing the `{ definition }` wrapper** makes
  `getModulesDefinitionFromIntegrationClasses` read `module.definition` as `undefined`,
  and `loadIntegrationContextById` throws
  `Cannot read properties of undefined (reading 'moduleName')`.

## Adding new tests

1. Add cases to `test-find-integration-context.js`, or add a new script and wire it
   into `package.json` scripts.
2. Seed real records and clean them up in a `finally` step.
3. Drive behavior through `IntegrationBase` subclasses and the
   `IntegrationEventDispatcher` — not by calling use cases directly — so the test
   mirrors the production flow.
4. After validating changes here, mirror them back into `assets/harness/` so the
   bundled copy stays current.
