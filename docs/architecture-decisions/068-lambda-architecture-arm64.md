# ADR-068: Lambda Architecture Selection (arm64 / Graviton)

**Status**: Proposed
**Date**: 2026-11-05
**Deciders**: Daniel Klotz

## Context

AWS Lambda runs functions on `x86_64` or `arm64` (Graviton). arm64 costs about 20% less per
GB-second, and for typical Node.js I/O work it runs in a similar time. For a Frigg app whose
cost is mostly Lambda duration, moving to arm64 cuts that part of the bill by about a fifth.

Frigg had no way to deploy on arm64. The template never set `Architectures`, so every function
ran on the AWS default, `x86_64`. Setting the architecture by hand in an app's serverless config
would deploy, but the functions would fail, because of Prisma:

1. **Prisma's query engine is a native library, one per target.** Core generated the
   `prisma-postgresql` and `prisma-mongodb` clients with
   `binaryTargets = ["native", "rhel-openssl-3.0.x"]`. `rhel-openssl-3.0.x` is the x86_64 Lambda
   target. No client held a `linux-arm64-openssl-3.0.x` engine, so an arm64 function could not
   load Prisma.
2. **The Prisma layer was built for one target.** `build-prisma-layer.js` kept only the `rhel`
   engines, and its cache marker held no target. A cached x86_64 layer would be reused unchanged
   for an arm64 deploy.
3. **The migration worker needs two more engines.** `dbMigrate` runs the Prisma CLI, which loads
   the schema engine and the query engine library from `node_modules/@prisma/engines/`. Those
   files come from the `@prisma/engines` postinstall on the deploy host. They match the host's
   own platform, not the Lambda's. When the CLI cannot find the engine for the platform it runs
   on, it tries to download one into the read-only `/var/task`, and that fails.
4. **With the layer off, every function bundles every engine.** Under
   `usePrismaLambdaLayer: false`, each function zip carries `@friggframework/core/generated/`
   with every engine `prisma generate` built. Adding the arm64 target would add about 15 MB per
   client to every function, for every such app, whether it deploys on arm64 or not.

## Decision

Add an `architecture` key to the app definition, and make every architecture-dependent value
in devtools come from one registry.

```js
const appDefinition = {
    architecture: 'arm64', // or 'x86_64'; leave it unset to keep the AWS default
    // ...
};
```

### 1. One registry for every architecture-dependent value

`packages/devtools/infrastructure/domains/shared/lambda-architectures.js` maps each Lambda
architecture to its Prisma binary target:

| Architecture | Prisma binary target |
|---|---|
| `x86_64` | `rhel-openssl-3.0.x` |
| `arm64` | `linux-arm64-openssl-3.0.x` |

Every target string in devtools comes from this table: the engine file names, the package
excludes and the migration worker's engine paths. (A few host-platform globs, such as the
`darwin` excludes in the migration builder, predate this ADR and stay where they are.) `resolveLambdaArchitecture(appDefinition)` returns the name, the target and
whether the key was set. An unknown value fails packaging and names the value. Adding a target
later means adding one row.

### 2. The key has no default

The schema declares `architecture` as an enum (`x86_64`, `arm64`) with no `default`. Devtools
sets `provider.architecture` and the layer's `compatibleArchitectures` only when the key is set.
With the key unset, the template gains no `Architectures` value, so an upgrade changes no
existing stack's architecture. This follows [ADR-051](./051-app-definition-validation.md) §2: a
schema default must equal what the code does when the key is absent. A `default: x86_64` would
make every app's key explicit and add `Architectures` to every template, which breaks ADR-051's
contract test that applying the schema defaults changes nothing in the composed infrastructure.
When the key is unset, devtools resolves `x86_64` internally to choose the engine.

### 3. Core generates both Lambda targets

Both `schema.prisma` files declare
`binaryTargets = ["native", "rhel-openssl-3.0.x", "linux-arm64-openssl-3.0.x"]`. The published
core package therefore holds the engine for either architecture. Each app then picks one at
package time.

### 4. The Prisma layer is built for one target

- `buildPrismaLayer({ prismaBinaryTarget })` removes the engines of every other target.
- After the build, it checks that each client in the layer holds the target engine. If an engine
  is missing, packaging fails and the error names the core version that lacks it.
- The layer cache marker is JSON. A layer is reused only when the target, the client set, and
  the core and `@prisma/client` versions all match. The marker also records the Node version
  and the host platform, for diagnosis only. A marker in the old plain-text form
  never matches, so the first deploy after the upgrade rebuilds the layer once.

### 5. The migration worker's engines are fetched at package time and pinned

- Before packaging, `ensureMigrationEngines({ prismaBinaryTarget })` runs the `@prisma/engines`
  postinstall with `PRISMA_CLI_BINARY_TARGETS` set to the target. That postinstall downloads
  only the engines that are missing, into the app's own `node_modules/@prisma/engines`.
  Packaging fails if either engine is still missing afterwards.
- The worker's environment sets `PRISMA_SCHEMA_ENGINE_BINARY` and `PRISMA_QUERY_ENGINE_LIBRARY`
  to those two files. With both pinned, the CLI never downloads at runtime. If a file is missing,
  the CLI fails at once and names the path.
- This applies to `x86_64` too, so an x86_64 worker also gets the two env vars. Before this
  change, an x86_64 worker worked only when the app's `node_modules/@prisma/engines` already
  held the `rhel` pair: on a rhel-like deploy host, or after an `npm install` run with
  `PRISMA_CLI_BINARY_TARGETS=rhel-openssl-3.0.x`.

### 6. A function that bundles Prisma keeps only the target's engines

- With the layer off, every function's `package.exclude` drops the engines of other targets:
  the deploy host's platforms (`darwin`, `debian`, `linux-musl`, `windows`) and the other
  Lambda target.
- Each pattern starts with an engine file prefix (`libquery_engine-`, `query-engine-`,
  `query_engine-`, `schema-engine-`). A dependency that only has a platform word in its name,
  such as `is-windows`, is kept.
- The base definition, the integration builder and the admin-script builder each build their
  own exclude list. All three call one helper, `bundledPrismaEngineExcludes()`.
- With the layer on, the helper adds nothing, because those functions already exclude all of
  Prisma.

## Consequences

### Positive

- An app moves to arm64 by setting one key, and its Lambda duration costs about 20% less.
- The upgrade is inert. With the key unset, no function changes architecture, the layer holds
  the same `rhel` engine as before, and layer-off zips do not grow.
- A wrong or missing engine fails at package time, with the file and the target named, instead
  of failing at cold start in a deployed stack.
- The migration worker no longer depends on what the deploy host's Prisma cache holds.
- The layer cache can no longer serve a layer built for another target, client set or version.

### Negative

- The core package grows by about 15 MB per client, about 30 MB in all, for the arm64 engines.
- When the migration engines are missing, packaging downloads them from Prisma's CDN
  (`binaries.prisma.sh`). A deploy host with no internet access must set
  `PRISMA_ENGINES_MIRROR`.
- The worker runs the app's own `prisma` CLI, and the engines are fetched for the app's own
  `@prisma/engines`, so the CLI and its engines always agree. The app's `prisma` must still be
  able to run core's schema and migrations; that requirement predates this ADR. The query
  engine pin also applies to any Prisma Client created inside the worker. The worker creates
  none today; one created there later would load the app's engine, not core's generated one.
- Frigg checks only Prisma. Other native dependencies in an app (for example image or crypto
  libraries) must also ship an arm64 build. The app owns that check.
- Layer-off function zips still carry the schema engine and the second client's engine, which
  ordinary functions never load. This was already true on x86_64, and this ADR does not change
  it.

### Neutral

- The first deploy after the upgrade rebuilds the Prisma layer once, because the marker format
  changed.
- Two deploys on one host can still race on the layer rebuild. This was true before this ADR.
- On the default x86_64 setup, the template changes in three ways:
  - the layer description no longer names an engine;
  - the migration worker gains the two engine path env vars;
  - the `package.exclude` of the migration worker and router gains the foreign-engine patterns,
    and so does every function's when the layer is off. These patterns are why layer-off zips
    do not grow.

## Alternatives Considered

- **Default to arm64.** Rejected. It would move every existing stack to a new architecture on
  upgrade, and break any app with an x86-only native dependency, with no change on the app's
  side.
- **Set the architecture per function.** Rejected for now. A function's architecture must match
  its layer's engine, so mixed architectures need one Prisma layer per architecture. No app has
  asked for it. The registry keeps this possible later.
- **Ship both engines in the layer and let Prisma pick at runtime.** Rejected. It adds about
  15 MB per client to every layer, and a layer is shared by every function. It also leaves the
  migration worker's problem unsolved.
- **Let the migration worker download its engines at cold start.** Rejected. `/var/task` is
  read-only, a cold-start download adds latency and a network dependency to every migration, and
  a missing engine would surface in a deployed stack instead of at package time.
- **Fetch the target's query engine at layer-build time instead of generating it into core.**
  This would avoid the 30 MB in core, and the migration worker already accepts a CDN fetch.
  Rejected, because the layer build today uses only files that core's own `prisma generate`
  built and that ship with core, so it needs no network and the engine always matches the
  generated client. A fetch would need the engine hash of core's exact Prisma version and a
  second CDN dependency on every layer build. The 30 MB lands on the deploy host's disk; no
  Lambda carries it, because the layer and the bundles keep only the target engine.
- **Publish one core package per architecture.** Rejected. It doubles the publish and install
  matrix to save package size that only the deploy host pays.
- **Prisma's driver adapters with the WASM query engine.** Not adopted. That path removes the
  native query engine (`engineType = "client"`, generally available since Prisma 6.16). It
  changes the runtime path of every query in every app, which is a larger change than an
  architecture switch should carry. It also does not help the migration CLI, which still needs
  the native schema engine.

## Related

- [ADR-051](./051-app-definition-validation.md): schema defaults must not change behaviour, which
  is why `architecture` has no default.
- [ADR-012](./012-database-schema-migrations.md): the migration worker whose engines this ADR
  pins.
- `packages/devtools/infrastructure/domains/shared/lambda-architectures.js`: the registry.
- `packages/devtools/infrastructure/scripts/build-prisma-layer.js` and
  `domains/shared/utilities/prisma-layer-manager.js`: the layer build and its cache marker.
- `packages/devtools/infrastructure/domains/database/migration-engines.js`: the migration engine
  fetch.
- `packages/devtools/infrastructure/README.md`, "Lambda architecture (arm64 / Graviton)": the
  user-facing guide.
