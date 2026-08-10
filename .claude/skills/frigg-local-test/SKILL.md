---
name: frigg-local-test
description: Run and test the Frigg framework from the local "next" branch against a real database (PostgreSQL or MongoDB) via Docker — no mocks, no published canary. The entire harness is bundled with this skill and copied to a scratch dir to run. Use when asked to run Frigg locally, test a framework feature on the next branch, reproduce or regression-test framework or integration behavior against real persistence, inspect real persisted Frigg records (User/Credential/Entity/Integration), or write a new test scenario. Trigger phrases include "test this on next", "run the local test environment", "spin up the frigg harness", "add a scenario for X".
---

# Frigg Local Test

Run and test the **local `next` branch** of Frigg end-to-end against real
databases (PostgreSQL or MongoDB, both started via Docker Compose). Behavior
runs through actual `IntegrationBase` subclasses, `createFriggCommands`, and
the `IntegrationEventDispatcher` — the same path production uses.

The harness is **bundled with this skill** at `assets/harness/`. **Copy it to a
scratch dir and run it there; never run it from inside `.claude/`.** It pins
`@friggframework/core` to the local checkout via a `file:` dependency
(symlink into `node_modules`), so edits to `packages/core` are live without
reinstalling — this is the loop for validating framework features on `next`
before shipping.

Two other skills cover adjacent ground — consult them as needed:

- **`frigg`** — framework architecture, API modules, integration lifecycle,
  commands pattern, encryption.
- **`frigg-canary-test`** — same harness shape, but against a *published npm
  canary*. Prefer this skill when the target is a specific published canary.
- **`frigg-management-api`** / **`frigg-user-actions`** — driving a running
  app's Management HTTP API (auth, users, integrations, actions). Use these
  once the app is up (see Full-app path below).
- **`frigg-development-best-practices`** — the framework-development iteration
  loop (edit → canary → deploy) and TDD expectations; this harness gives that
  loop its real local database layer.

## Where everything lives

```
.claude/skills/frigg-local-test/
├── SKILL.md                          ← this runbook (starting point for agents)
└── assets/harness/                   ← the whole environment (copy to scratch to run)
    ├── package.json                  ← scripts: db:up/down, setup:db, prisma:*, scenarios, server
    ├── docker-compose.yml            ← postgres (:5433) + mongo rs0 (:27018)
    │                                    + profiles: agent sandbox, browser (Playwright server), localstack
    ├── Dockerfile + scripts/entrypoint.sh  ← agent sandbox image (node 22 + chromium)
    ├── index.js                      ← Frigg app Definition (integrations, database.type)
    ├── server.js                     ← poke server (:3001/health, /api/integrations)
    ├── src/integrations/             ← TestApiAIntegration / TestApiBIntegration
    ├── src/api-modules/              ← mock API-key modules
    ├── scenarios/                    ← one runnable script per feature area
    └── scripts/                      ← setup-db / run-scenario / smoke
```

## Quick start (host-driven — the common case)

```bash
# 1. Copy the bundled harness to a scratch dir.
WORK=/tmp/frigg-test                  # any dir outside .claude/
rm -rf "$WORK" && mkdir -p "$WORK"
cp -R <this-skill-dir>/assets/harness/. "$WORK/"
cd "$WORK"

# 2. Start the databases (Postgres on 5433, Mongo replica set on 27018).
npm run db:up

# 3. Pin the LOCAL core (next branch), then install.
npm install /path/to/frigg/packages/core   # file: dep -> live next code
npm install

# 4. Choose the DB and prep the schema.
cp .env.example .env                 # defaults to PostgreSQL; edit for Mongo
npm run setup:db                     # prisma generate + migrate deploy (or db push)

# 5. Run the scenario suite.
npm run scenario:integration-lifecycle
```

A green run ends with `Results: 4 passed, 0 failed`. Tear down with
`npm run db:down` (add `-v` to wipe data).

## Choosing the database

Set `DB_TYPE` + `DATABASE_URL` in `.env` (see `.env.example`), then run
`npm run setup:db`. Core selects the Prisma client from `DB_TYPE`.

| | PostgreSQL | MongoDB |
|---|---|---|
| `.env` `DB_TYPE` | `postgresql` | `mongodb` |
| `DATABASE_URL` (host) | `postgresql://postgres:postgres@localhost:5433/frigg_test` | `mongodb://localhost:27018/frigg_test?replicaSet=rs0&directConnection=true` |
| `DATABASE_URL` (sandbox) | `postgresql://postgres:postgres@postgres:5432/frigg_test` | `mongodb://mongodb:27017/frigg_test?replicaSet=rs0&directConnection=true` |
| schema sync | `migrate deploy` (migrations exist) | `db push` (no migrations for Mongo) |

Both DBs run from the bundled `docker-compose.yml` on **non-default ports**
(5433 / 27018) so they never clash with a project's own stack. Mongo runs as a
single-node replica set (`rs0`) because Prisma requires one; `mongo-init.sh`
initialises it.

## Critical setup notes

- **Generate the client per DB.** The Prisma client is built into the core
  package's `generated/` dir (`packages/core/generated/prisma-<db>` when core
  is the local `file:` dep). Run `npm run setup:db` after switching `DB_TYPE`
  or after any core change touching the schema, or core fails to load its
  database layer.
- **`DB_TYPE` must be set** — core's `prisma.js` picks the client from it.
- **`STAGE=dev`** bypasses field-level encryption, so persisted data is readable.
- **Local core, not registry.** The harness must resolve core to your checkout.
  `npm install /path/to/frigg/packages/core` adds a `file:` dependency. Verify:
  `node -e "console.log(require.resolve('@friggframework/core/package.json'))"`
  should print a path under `*/packages/core/`. The bundled `npm run smoke`
  FAILS if core does not resolve to the local checkout.
- **Mongo needs the replica set** (`rs0`) — wait for the `mongodb-init` one-shot
  service to complete before connecting.

## Raw Prisma commands (when you need them)

`npm run setup:db` wraps these and resolves the schema path via
`require.resolve` (robust to symlinks) and reads `DB_TYPE` from `.env`. The raw
equivalents — from the harness dir, where core is symlinked into
`node_modules/`:

```bash
# PostgreSQL: generate client + apply migrations
npx prisma@6 generate --schema=node_modules/@friggframework/core/prisma-postgresql/schema.prisma
npx prisma@6 migrate deploy --schema=node_modules/@friggframework/core/prisma-postgresql/schema.prisma

# MongoDB: generate client + push schema (no migrations for Mongo)
npx prisma@6 generate --schema=node_modules/@friggframework/core/prisma-mongodb/schema.prisma
npx prisma@6 db push --schema=node_modules/@friggframework/core/prisma-mongodb/schema.prisma
```

Also available as npm scripts: `prisma:generate:postgres`, `prisma:generate:mongo`,
`db:migrate:postgres`, `db:push:mongo`.

Notes:
- `prisma@6` pins the major so the CLI always matches core's schema (core
  targets Prisma 6.x). Plain `npx prisma` also works — it resolves the
  harness's installed 6.19.3.
- Generate must run **before** migrate/deploy or db push, and the generated
  client must exist before any scenario runs.

## Fully isolated mode (agent sandbox)

The `agent` compose profile (opt-in) runs the whole environment inside a
sandbox container: repo mounted read-only at `/workspace`, harness mounted
read-write at `/harness`, DBs reached by service hostname (no host ports).

```bash
# Set the frigg checkout path once (compose interpolation):
echo "FRIGG_REPO_DIR=/path/to/frigg" >> .env

# Build + boot the sandbox, then open a shell:
docker compose up -d --profile agent
docker compose exec agent bash
# inside: cd /harness && npm run scenario:integration-lifecycle
```

The entrypoint pins core to `/workspace/packages/core`, runs `npm install` on
first boot (named volume, cached), and runs `setup:db`. Chromium is bundled in
the image for browser-driven tests (headless, `--no-sandbox`). Other opt-in
profiles: `browser` (standalone Chromium, Playwright server protocol on
:9222 — not CDP) and `localstack` (KMS/SQS/Scheduler). See `docker-compose.yml` for the isolation model.

## Scenario pattern (how to test a feature)

Copy `scenarios/integration-lifecycle.js`. Every scenario must:

1. **Seed real records** with the Prisma client
   (`@friggframework/core/database/prisma`): User, Credential, Entity,
   Integration — whatever the feature touches.
2. **Drive behavior through `IntegrationBase` subclasses and the
   `IntegrationEventDispatcher`** (or `createFriggCommands`) — never call use
   cases directly, so the scenario mirrors the production flow. To exercise an
   integration's own state: load context first
   (`commands.loadIntegrationContextById(id)`), hydrate
   (`new MyIntegration({ ...context.record, modules: context.modules })`), then
   dispatch (`dispatcher.dispatchJob({ event: 'EVENT_NAME' })`).
3. **Assert on real framework behavior / persisted state** — what changed in
   the DB, what the dispatch returned, which errors were thrown (match on
   `error.code`, e.g. `INTEGRATION_NOT_FOUND`, `TYPE_REQUIRED`).
4. **Clean up** in a `finally`-equivalent step and `prisma.$disconnect()`.

Add the script to `package.json` and mirror it back into this skill's
`assets/harness/scenarios/` when it covers a new feature area.

## Integration structure conventions (verified against production)

- **Wrap modules as `{ definition: <ModuleDefinition> }`** under
  `Definition.modules`. The declaration key is how the module attaches to
  `this` (`this.testApiA.api`).

  ```javascript
  static Definition = {
      modules: { testApiA: { definition: testApiA.Definition } }, // ✅
      // modules: { testApiA: testApiA.Definition },              // ❌ see gotcha
  };
  ```

- **Use `createFriggCommands`** (public API), not `createIntegrationCommands`
  (internal). It exposes integration + user + entity + credential commands.
- **No `static modules` field** — the framework only reads `Definition.modules`.

## Gotchas

- **Missing the `{ definition }` wrapper** makes
  `getModulesDefinitionFromIntegrationClasses` read `module.definition` as
  `undefined`, and `loadIntegrationContextById` throws
  `Cannot read properties of undefined (reading 'moduleName')`.
- **Don't run from inside `.claude/`** — copy the harness to a scratch dir
  first (its `.gitignore` and `.env` handling assume a scratch location).
- **Ports 5433/27018 are localhost-only bindings.** For a fully hermetic run,
  remove the `ports:` blocks in `docker-compose.yml`.
- **Generated clients are platform-local.** On the host they land in the core
  checkout's `generated/` dir (gitignored in the frigg repo). Inside the
  sandbox they go to a dedicated named volume over
  `packages/core/generated`, so container-generated clients never overwrite
  the host's (and the read-only repo mount never blocks prisma generate).
  Re-run `setup:db` on the host after host-driven runs.

## Full-app path (osls offline — how production runs locally)

The management API (user/login, /api/authorize, /api/integrations, actions)
runs via the same path a deployed app uses:

```bash
frigg build --stage dev     # local mode: FRIGG_SKIP_AWS_DISCOVERY=true
frigg start --stage dev     # spawns: osls offline --config infrastructure.js
# then: curl localhost:3000/health, POST /user/create, GET /api/integrations ...
```

The harness `index.js` provides the app `Definition`; a full `infrastructure.js`
for the osls path is a roadmap item (see `README.md` in the harness).

## Scenario catalog

| Scenario | Covers | How to run |
|---|---|---|
| `integration-lifecycle.js` | context loading, hydration, USER_ACTION dispatch, shared entities, error codes | `npm run scenario:integration-lifecycle` |

Add rows here as new scenarios land.
