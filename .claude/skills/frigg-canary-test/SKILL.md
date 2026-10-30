---
name: frigg-canary-test
description: Test a published @friggframework/core canary build end-to-end against a self-contained minimal Frigg backend backed by a real database (PostgreSQL or MongoDB via Docker, no mocks). Use when verifying a Frigg core canary before merge, reproducing or regression-testing any framework or integration behavior against real persistence, or inspecting the real shape of persisted Frigg records (User/Credential/Entity/Integration). Triggers include "test a Frigg canary", "run the canary harness", or "spin up a minimal Frigg integration to test core".
---

# Frigg Canary Test

Run a published `@friggframework/core` canary against a real Frigg backend backed
by a **real database** — PostgreSQL or MongoDB, both started via Docker Compose.
Behavior runs through actual `IntegrationBase` subclasses, `createFriggCommands`,
and the `IntegrationEventDispatcher`, i.e. the same path production uses.

The harness is **bundled with this skill** at `assets/harness/`. Copy it to a
scratch dir and run it there; never run it from inside `.claude/`.

The bundled scenario (a `FindIntegrationContextByExternalEntityId` test) is just an
**example** — replace or add scenarios to test whatever behavior the canary changes.

## Understand Frigg first

If unfamiliar with Frigg concepts, consult the other skills before writing test
scenarios:

- **`frigg`** skill — framework architecture, API modules, integration lifecycle,
  commands pattern, encryption.
- **`frigg-management-api`** skill — the runtime HTTP API (users, auth, entities,
  integrations) for driving a deployed/running Frigg app via curl.

For a real, production-grade integration to mirror conventions from, see
**https://github.com/lefthookhq/quo--frigg** (`backend/src/integrations/`).

## Quick start

```bash
# 1. Copy the bundled harness from this skill's assets/harness/ to a scratch dir.
WORK=/tmp/frigg-canary-test            # any dir outside .claude/
rm -rf "$WORK" && mkdir -p "$WORK"
cp -R <this-skill-dir>/assets/harness/. "$WORK/"
cd "$WORK"

# 2. Start the databases (Postgres on 5433, Mongo replica set on 27018).
docker compose up -d

# 3. Choose the DB and canary.
cp .env.example .env                   # defaults to PostgreSQL; edit for Mongo
npm pkg set dependencies.@friggframework/core="2.0.0--canary.<PR>.<HASH>.0"

# 4. Install, generate the client for the chosen DB, sync schema, test.
npm install
#   PostgreSQL:
npm run prisma:generate:postgres && npm run db:migrate:postgres
#   MongoDB (instead):
#   npm run prisma:generate:mongo && npm run db:push:mongo
npm test
```

A green run ends with `Results: N passed, 0 failed`. Tear down with `docker compose down`.

## Choosing the database

Set `DB_TYPE` + `DATABASE_URL` in `.env` (see `.env.example`), then use the matching
client/schema commands. Core selects the Prisma client from `DB_TYPE`.

| | PostgreSQL | MongoDB |
|---|---|---|
| `.env` `DB_TYPE` | `postgresql` | `mongodb` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/frigg_canary_test` | `mongodb://localhost:27018/frigg_canary_test?replicaSet=rs0&directConnection=true` |
| generate client | `npm run prisma:generate:postgres` | `npm run prisma:generate:mongo` |
| sync schema | `npm run db:migrate:postgres` (migrate deploy) | `npm run db:push:mongo` (db push) |

Both DBs run from the bundled `docker-compose.yml` on **non-default ports** (5433 /
27018) so they never clash with a project's own stack. Mongo runs as a single-node
replica set (`rs0`) because Prisma requires one; `mongo-init.sh` initialises it.

## Critical setup notes

- **Generate the client and it is per-DB.** The client is built into
  `node_modules/@friggframework/core/generated/prisma-<db>`. Run the matching
  `prisma:generate:*` before syncing schema or testing, or core fails to load.
- **`DB_TYPE` must be set** — core's `prisma.js` picks the client from it.
- **`STAGE=dev`** bypasses field-level encryption, so persisted data is readable.
- **Pin a matching canary.** Canaries publish per commit as
  `2.0.0--canary.<PR>.<short-sha>.0`; check
  `npm view @friggframework/core dist-tags.canary` and use the hash matching the PR
  HEAD, not an earlier build.

## Integration structure conventions

The bundled integrations follow real production conventions (verified against
`AxisCareIntegration` in quo--frigg). Preserve these when adding integrations:

- **Wrap modules as `{ definition: <ModuleDefinition> }`** under `Definition.modules`.
  The declaration key is how the module attaches to `this` (`this.testApiA.api`).

  ```javascript
  static Definition = {
      modules: { testApiA: { definition: testApiA.Definition } }, // ✅
      // modules: { testApiA: testApiA.Definition },               // ❌ see gotcha
  };
  ```

- **Use `createFriggCommands`** (public API), not `createIntegrationCommands`
  (internal). It exposes integration + user + entity + credential commands.
- **No `static modules` field.** The framework only reads `Definition.modules`.
- **Namespace a shared module** by overriding `getName`/`moduleName` inside its
  `definition` (AxisCare mounts `quo` as `quo-axisCare`):

  ```javascript
  modules: { quo: { definition: { ...quo.Definition, getName: () => 'quo-axisCare', moduleName: 'quo-axisCare' } } }
  ```

## Gotcha

- **Missing the `{ definition }` wrapper** makes
  `getModulesDefinitionFromIntegrationClasses` read `module.definition` as
  `undefined`, and `loadIntegrationContextById` throws
  `Cannot read properties of undefined (reading 'moduleName')`.

## Adding or changing test scenarios

1. Seed real records with the Prisma client (`@friggframework/core/database/prisma`)
   and clean them up in a `finally` step.
2. Drive behavior through `IntegrationBase` subclasses and the
   `IntegrationEventDispatcher` — not by calling use cases directly — so the test
   mirrors the production flow. To exercise an integration's own state, load context
   first (`commands.loadIntegrationContextById(id)`), then hydrate the instance
   (`new MyIntegration({ ...context.record, modules: context.modules })`) before
   dispatching.
3. Add the script to `package.json` (or replace `test-find-integration-context.js`).
4. After validating here, mirror changes back into this skill's `assets/harness/`.
