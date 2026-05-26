---
name: frigg-canary-test
description: Test a Frigg core canary version end-to-end against a minimal Frigg backend harness backed by a real PostgreSQL database. Use when verifying a published @friggframework/core canary build, validating an integration use case (e.g. FRI-498 find-integration-context), or inspecting the real shape of persisted records.
---

# Frigg Canary Test

Run a published `@friggframework/core` canary against a real Frigg backend
harness with a **real PostgreSQL database** (no mocks). Verifies framework
behavior end-to-end through actual `IntegrationBase` subclasses, the commands
pattern, and the `IntegrationEventDispatcher`.

## Usage

```
/frigg-canary-test [canary-version]
```

- `canary-version` (optional): the `@friggframework/core` version to test,
  e.g. `2.0.0--canary.593.29890e5.0`. If omitted, test against the version
  already pinned in the harness `package.json`.

## Harness location

The harness is a full Frigg backend app at:

```
/home/user/frigg-canary-test/backend/
├── index.js                          # App Definition (integrations, user config)
├── server.js                         # Express server (npm run frigg:start)
├── test-find-integration-context.js  # FRI-498 test script (npm test)
├── package.json                      # @friggframework/core canary pinned here
└── src/
    ├── api-modules/
    │   ├── test-api-a/   # ApiKeyRequester module (getName: 'test-api-a')
    │   └── test-api-b/   # ApiKeyRequester module (getName: 'test-api-b')
    └── integrations/
        ├── TestApiAIntegration.js    # extends IntegrationBase, has the user action
        └── TestApiBIntegration.js    # extends IntegrationBase
```

All commands run from `/home/user/frigg-canary-test/backend`, not the repo root.

## What it does

1. Ensures PostgreSQL is running (`sudo service postgresql start`).
2. If a version was given, updates `@friggframework/core` in
   `/home/user/frigg-canary-test/backend/package.json`.
3. Runs `npm install` to fetch the canary.
4. Runs Prisma migrations against the canary's bundled schema.
5. Runs `npm test` to execute the suite against the real database.
6. Reports pass/fail and the shape of persisted records.

## Manual execution

```bash
sudo service postgresql start
cd /home/user/frigg-canary-test/backend
npm install
npx prisma migrate deploy --schema=./node_modules/@friggframework/core/prisma-postgresql/schema.prisma
npm test
```

Example with an explicit version:

```
/frigg-canary-test 2.0.0--canary.593.29890e5.0
```

## Test coverage

### FRI-498: FindIntegrationContextByExternalEntityId

The use case resolves an integration from an entity's `externalId` **filtered by
`config.type`**, so that when one entity is shared by multiple integrations the
correct one is returned (the original bug returned the first integration found
for the user).

The test seeds real records:

- User (`type=INDIVIDUAL`)
- Credential (with `api_key` data)
- One **shared** Entity with an `externalId`
- Integration A (`config.type='test-api-a'`) bound to the entity
- Integration B (`config.type='test-api-b'`) bound to the **same** entity

It exercises the `FIND_INTEGRATION_BY_EXTERNAL_ID` USER_ACTION on
`TestApiAIntegration`. Crucially, the action does **not** take `externalId` /
`type` as params — it sources them from the integration itself:

```javascript
async findIntegrationByExternalId() {
    const type = this.config?.type;                   // integration's own config
    const externalId = this.entities?.[0]?.externalId; // the bound entity
    const result = await this.commands
        .findIntegrationContextByExternalEntityId({ externalId, type });
    // ...
}
```

So the harness **loads context first, then dispatches** — it hydrates the
instance so `this.config` and `this.entities` are populated before the action
runs:

```javascript
const commands = createIntegrationCommands({ integrationClass: TestApiAIntegration });
const { context } = await commands.loadIntegrationContextById(integrationId);
const integration = new TestApiAIntegration({ ...context.record, modules: context.modules });
const dispatcher = new IntegrationEventDispatcher(integration);
await dispatcher.dispatchJob({ event: 'FIND_INTEGRATION_BY_EXTERNAL_ID' });
```

Assertions:

- Hydrated as Integration A → resolves A by its own `config.type` ✅
- Hydrated as Integration B (same shared entity) → resolves B, not A ✅
  *(this is the FRI-498 regression guard)*
- `config.type` matching no integration → `INTEGRATION_NOT_FOUND` ✅
- `config` with no `type` → `TYPE_REQUIRED` ✅

## Where the lookup inputs live on `this`

- `type` → `this.config.type` (integration config).
- `externalId` → the use case queries **`Entity.externalId`**, available at
  `this.entities[0].externalId` on a hydrated integration. The module instance
  also exposes it at `this['test-api-a'].entity.externalId`.
  (`Credential` has its own separate `externalId` column at
  `this['test-api-a'].credential.externalId` — that is **not** what the use
  case filters on.)

## Gotchas

- **Module declaration must use the `{ definition }` wrapper.** Frigg's
  `getModulesDefinitionFromIntegrationClasses` reads `module.definition`, so a
  Definition must be declared as:

  ```javascript
  static Definition = {
      modules: { testApiA: { definition: TestApiAModule } }, // ✅
      // modules: { testApiA: TestApiAModule },               // ❌ breaks loadIntegrationContext
  };
  ```

  Without the wrapper, `loadIntegrationContextById` throws
  `Cannot read properties of undefined (reading 'moduleName')`.

- **Pin a matching canary.** The commands layer
  (`findIntegrationContextByExternalEntityId`) only forwards `{ externalId,
  type }` correctly in canaries at/after the commands fix. Use the canary whose
  hash matches the PR head (e.g. `2.0.0--canary.593.29890e5.0`), not an earlier
  one.

- **Encryption is bypassed** in this harness (dev stage), so persisted
  credential/entity data is readable for inspection.

## Adding new tests

1. Add cases to
   `/home/user/frigg-canary-test/backend/test-find-integration-context.js`,
   or add a new script file and wire it into `package.json` scripts.
2. Create real records and clean them up in a `finally`/cleanup step.
3. Drive behavior through `IntegrationBase` subclasses and the
   `IntegrationEventDispatcher` (not by calling use cases directly) so the test
   mirrors production flow.
