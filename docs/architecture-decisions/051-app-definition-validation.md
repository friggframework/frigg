# ADR-051: App Definition Validation and One Source for Its Defaults

**Status**: Proposed  
**Date**: 2026-10-02  
**Deciders**: Sean Matthews

## Context

A Frigg app is configured by the `Definition` object that the backend's
`index.js` exports. Three programs read it:

- the infrastructure builders in `packages/devtools/infrastructure`
  (through `createFriggInfrastructure`, when `osls` loads `infrastructure.js`
  during `frigg build`, `frigg deploy` and `frigg start`);
- core at runtime, through `loadAppDefinition`
  (`packages/core/handlers/app-definition-loader.js`) and a few direct
  readers (`database/config.js`, the encryption schema registry, the admin
  script bootstrap);
- the CLI (`deploy-command` reads `environment` and `deployment`,
  `ssm-command` reads `ssm.parameters`).

`packages/schemas/schemas/app-definition.schema.json` was meant to describe
that object. It had drifted from all three readers, and nothing noticed,
because only `frigg init` ran the schema, as a warning, against a
hard-coded stand-in object instead of the generated file.

### What was wrong

1. **Integrations.** `integrations.items` was `type: object`. Apps list
   integration *classes* (functions), so every app with an integration
   failed `validateAppDefinition`.
2. **Enums the builders reject.** The schema allowed
   `database.postgres.management: 'existing' | 'create-new'` and
   `vpc.management: 'existing'`; the Aurora builder accepts only
   `discover | managed | use-existing` and the VPC builder only
   `discover | create-new | use-existing`. Those values passed the schema and
   failed the build. `vpc.subnets.management` and
   `vpc.natGateway.management` listed values the builder ignores and left
   out the values it acts on (`create`, `createAndManage`).
3. **Defaults nobody applies.** The schema declared defaults that no code
   applied, and several disagreed with the code:
   `managementMode: managed` (the builders default to `discover`),
   `vpcIsolation: isolated` (the builders disagree among themselves),
   `encryption.fieldLevelEncryptionMethod: aes` (omitting it provisions no
   key at all), `postgres.maxCapacity: 1` (the builder uses 4),
   `user.usePassword: true` and `user.individualUserRequired: true`
   (`loadAppDefinition` passed `user` through unchanged, so a `user` block
   without `individualUserRequired` made `POST /user/login` throw, and an app
   without `user` got `userConfig = null` and a TypeError on every
   authenticated request).
4. **Keys the runtime reads that the schema rejected** (with
   `additionalProperties: false`): the ownership/external configuration of
   VPC, Aurora, KMS and migrations, `usePrismaLambdaLayer`, `scheduler`,
   `aws.discovery`, `telemetry`, `admin`, `adminScripts`, `reports`,
   `deployment`, `lambda.keepNestedNodeModules`, `encryption.disable`,
   `encryption.kmsKeyAlias`/`keyAlias`, `user.strictUserValidation`,
   `database.postgres.engineVersion`, `database.dynamodb`, and more.
5. **Keys the schema described that nothing reads**: `auth.*`,
   `security.*` (CORS and rate limits), `webhooks.*`, `custom.*`,
   `secretsManager`, `label`, `user.fields`, `user.model`,
   `database.uri`, `postgres.selfHeal`, `websockets.routeSelectionExpression`.
   The same is true of `rateLimit` on API module definitions (PR #656).
6. **No validation step.** There was no `frigg validate`, and `frigg build`,
   `frigg deploy` and `frigg start` never validated, so a typo such as
   `encrpytion` silently deployed an app without encryption.

The full key-by-key comparison is in the appendix.

## Decision

### 1. The schema describes what the runtime reads

- Every key a builder, core or the CLI reads is in the schema, with the
  values the code acts on as its `enum`.
- A key nothing reads stays in the schema only so existing definitions keep
  validating, marked `"deprecated": true` and without a `default`.
  `frigg validate` warns that it has no effect.
- An enum value the code ignores (but that does not break the build) stays
  accepted for the same reason, and `frigg validate` warns. An enum value
  that makes the build fail (`postgres.management: 'existing'`) is removed:
  rejecting it at validation is the fix.

### 2. Schema defaults are applied by one loader step, used by core and devtools

We considered two ways to make the schema defaults true: apply them, or
delete them. We apply them, in exactly one place:

- `applyAppDefinitionDefaults(definition)` in `@friggframework/schemas`
  (`packages/schemas/app-definition.js`) walks the schema and fills every
  declared `default` the way Ajv `useDefaults` does: only for properties of
  objects that exist, plus blocks that themselves declare a default
  (`user: {}`). It returns a copy, keeps class references, loads only the
  JSON (no Ajv at Lambda cold start) and is idempotent. It also maps the
  deprecated `user.password` to `user.usePassword` when only the old
  spelling is set.
- core's `loadAppDefinition` and devtools' `createFriggInfrastructure` call
  it on the loaded `Definition`; `frigg validate` calls it before its
  semantic checks. No other code applies schema defaults.
- **Rule:** a schema `default` must equal what the code does when the key is
  absent. Where the code has no single default (`managementMode`,
  `vpcIsolation`, `postgres.enable`, `vpc.selfHeal`,
  `createResourceIfNoneFound`, `logging.level`), the schema has no default and
  the description says what omission does. A contract test enforces the rule
  for the builders (section 5).

Applying rather than deleting keeps one declaration for "what happens when I
leave this out" that documentation, editors and the runtime all read, and it
fixes the `user` block, the one place where the documented defaults were
the intended behaviour and the code's were a bug.

**Behaviour changes** (all in `user`, all through `loadAppDefinition`):

| Definition | Before | After |
|---|---|---|
| no `user` block | `userConfig = null`; every authenticated route and `/user/login` throw a TypeError | individual users, appUserId login, Frigg token and shared-secret auth |
| `user: { usePassword: true }` (no `individualUserRequired`) | `/user/login` throws "must require either …" | username/password login works |
| `user: { password: true }` (old spelling) | `password` ignored, login throws | treated as `usePassword: true` |
| `user: { organizationUserRequired: true }` (no `individualUserRequired`) | login looks up the organization user only | `individualUserRequired` defaults to true, as the x-frigg header path and the `User` model already assumed; `frigg validate` warns and suggests `individualUserRequired: false` for organization-only login |

The schema default of `user.usePassword` changes from `true` to `false`
(what core did with an absent value), so apps that identify users by
appUserId keep working; `authModes.sharedSecret` changes from `false` to
`true` (core accepts the shared secret unless it is `false`).

### 3. Integration classes: a serialised view plus structural checks

JSON Schema cannot type a JavaScript class. `validateAppDefinition` now
validates a view of the definition in which every class in `integrations`,
`adminScripts` and `reports` is replaced by `{ Definition: <its static
Definition> }`; the schema item requires `Definition` to be an object. That
keeps non-class garbage (strings, numbers, a class without a Definition)
failing at the schema level with a JSON pointer, while staying independent of
how a class is built.

The class itself is checked structurally by `frigg validate`, mirroring what
core does with it: the entry is a class, `Definition.name` is a valid AWS
resource name segment and unique, `Definition.modules` is an object, and each
module definition passes the same rules as `Module.validateDefinition`
(`moduleName`, `API`, `requiredAuthMethods` including `getToken` for OAuth2
requesters). A missing `version` is a warning. A module `rateLimit` (top level
or under `config`) is a warning: nothing applies it.

We did not make the item schema permissive (`{}`): a definition listing
`'hubspot'` instead of the class would then pass. We did not validate
`Definition` against `integration-definition.schema.json` in this step: real
Definitions carry functions and module objects that schema cannot describe,
and the structural checks cover what the runtime depends on.

### 4. `frigg validate`, and validation before build, deploy, start and init

```
frigg validate [--stage <stage>] [--json] [--verbose]
```

1. Loads the backend's `index.js` the way build does (the current directory
   when it holds `package.json` and `index.js`, else the nearest
   `backend/` above it). A load error is reported, not thrown.
2. Validates it against the schema (keys, types, enums) and maps Ajv errors
   to issues with a JSON pointer, a message and a fix hint (closest known key
   for typos, allowed values for enums).
3. Applies the schema defaults and runs the semantic checks the schema cannot
   express: integration classes (section 3); a database is enabled; management
   values versus other settings (`use-existing` without ids, `managed` with
   legacy VPC keys that the VPC builder still applies, `managed` without
   `vpcIsolation`, a private Aurora cluster with Lambdas outside a VPC);
   encryption (`aes` without `AES_KEY_ID`/`AES_KEY` in `environment`, the KMS
   key fallback, no method on a deployed stage, stages `dev`/`test`/`local`
   that never encrypt); a user config with which login works; `'ssm'`
   environment entries without `ssm.enable`; deprecated keys. `--stage` adds
   the stage-dependent checks.
4. Prints errors, then warnings; `--json` prints
   `{ valid, source, stage, errors: [...], warnings: [...] }`, each issue
   `{ severity, code, pointer, message, hint }`. Exits 1 when there is an
   error.

`frigg build` and `frigg deploy` run the same validation first and stop on
errors; `--skip-validate` bypasses it and prints a highlighted
"VALIDATION SKIPPED" line. `frigg start` runs it and prints errors as
warnings, so local development is never blocked. `frigg init` validates the
generated `index.js` through the same code path (as warnings, and silently
skipped when the file cannot load before `npm install`).

Validation is not added to the Lambda runtime: a cold start must not fail on
a definition that built and deployed.

### 5. A contract test keeps the schema and the builders in step

`packages/devtools/infrastructure/app-definition-schema-contract.test.js`
composes the infrastructure for a matrix of definitions (minimal, scaffold,
discover, create-new, use-existing, managed isolated/shared, existing,
ownership-based stack/external, admin scripts and reports, DocumentDB) with
AWS discovery mocked, wraps each definition in a proxy that records every
key the builders read, and asserts that:

1. every key a builder reads is in the schema;
2. every schema key is read by a builder, or listed with the code that reads
   it (core, the CLI, discovery), or marked `deprecated`;
3. no builder reads a key marked `deprecated`;
4. applying the schema defaults changes nothing in the composed
   infrastructure (each default is the builders' own);
5. the schema accepts every definition in the matrix.

Run against the old schema it reports more than 50 keys the builders read
and the schema rejected. Keys a builder reads only from its own translated copy
(`translateLegacyConfig` clones the definition) are not recorded, which is why
the matrix also includes ownership-based definitions that skip translation.

## Consequences

### Positive

- An app with integrations validates; a typo, an unknown key or a value the
  builders reject stops `frigg build`/`frigg deploy` with a pointer and a fix
  instead of a CloudFormation failure or a silently different deployment.
- "What happens when I omit X" has one answer, read by the runtime, the
  builders, the validator and editors that use the schema.
- Login works with the user block the schema documents, and without one.
- Drift between the builders and the schema fails a unit test.

### Negative

- `@friggframework/core` depends on `@friggframework/schemas` (JSON plus
  Ajv, though the runtime path loads only the JSON).
- An organization-only app that relied on an absent `individualUserRequired`
  must now set it to `false` (`frigg validate` says so).
- `frigg build`/`frigg deploy` can now fail on definitions that used to
  deploy, when the definition contains an unknown key; `--skip-validate` is
  the escape hatch.
- Deprecated keys stay in the schema until a major release removes them.

### Neutral

- The semantic checks encode builder behaviour; when a builder changes, its
  check and the contract test change with it.
- Core keeps reading a few keys directly from the backend module
  (`database/config.js`, the encryption registry); the contract test lists
  them, and none of them has a default that differs from the code.

## Alternatives Considered

- **Delete every default from the schema.** Simpler, but leaves the `user`
  bug in place, loses the single documented answer to "what does omission
  do", and invites the defaults to creep back as code-only fallbacks.
- **Ajv `useDefaults` at runtime.** Same semantics, but compiles the schema
  at every cold start and mutates the app's object; the walker reads only the
  JSON and returns a copy.
- **Validate inside the Lambda runtime and refuse to start.** Turns a
  configuration mistake into an outage of a deployed stage; validation
  belongs before the build.
- **A permissive integrations item (`{}`).** Accepts strings and other
  non-classes; the serialised view keeps those errors at the schema level.
- **TypeScript types for the definition.** Useful later for editors, but most
  Frigg apps are JavaScript and the builders need a runtime check.

## Related

- [ADR-027](./027-ssm-parameter-offload-and-env-scoping.md) (`environment: 'ssm'`, `ssm.*`)
- [ADR-048](./048-structured-logging.md) (`logging.*`)
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md) (`telemetry.*`)
- [ADR-005](./005-admin-script-runner.md), [ADR-010](./010-reporting-as-admin-operation.md) (`admin`, `adminScripts`, `reports`)
- PR #639 (`database.postgres.management: 'external'` and the `frigg init`
  backend template), PR #663 (`fieldLevelEncryptionMethod: 'none'`),
  PR #656 (module `rateLimit`)

## Appendix: schema versus runtime

| Key | Runtime (file) | Schema before | Schema now |
|---|---|---|---|
| `integrations[]` | classes (`integration-builder.js`, core loader) | `type: object` (rejects classes) | serialised view `{ Definition }` + structural checks |
| `managementMode` | `managed`, `existing`, else discover; default discover (`vpc-builder.js`, `aurora-builder.js`, `kms-builder.js`, `migration-builder.js`) | `managed\|discover\|custom`, default `managed` | `managed\|discover\|existing\|custom` (custom = discover, warns), no default |
| `vpcIsolation` | `\|\| 'shared'` in translation, undefined = isolated in discovery conversion | default `isolated` | no default; validate warns under `managed` |
| `vpc.management` | `discover\|create-new\|use-existing` (`vpc-builder.js` validate) | `discover\|create-new\|existing`, default discover | builder values, no default |
| `vpc.subnets.management` | acts on `create`, `use-existing` | `discover\|create-new\|existing` | adds `create`, `use-existing`; old values warn (no effect) |
| `vpc.natGateway.management` | acts on `createAndManage` only | `discover\|create-new\|existing` | adds `createAndManage`; old values warn |
| `vpc.selfHeal` | translated only when set; `config.selfHeal !== false` | default `false` | no default |
| `vpc.shareAcrossStages`, `vpc.ownership.*`, `vpc.external.*`, `vpc.config.*` | read by `vpc-builder.js`, `vpc-resolver.js` | missing | added |
| `database.postgres.management` | `discover\|managed\|use-existing` (`aurora-builder.js`) | `discover\|create-new\|existing` | builder values, no default |
| `database.postgres.enable` | Aurora `=== true`; migrations and Prisma layer `!== false` | default `false` | no default (omission documented) |
| `database.postgres.maxCapacity` | default 4 | default 1 | default 4 |
| `database.postgres.engineVersion`, `.ownership.*`, `.external.*`, `.clusterId`, `.instanceId` | `aurora-builder.js`, `aurora-resolver.js`, discovery | missing | added |
| `database.postgres.selfHeal`, `database.uri`, `database.mongoDB.uri` | not read | described | deprecated |
| `database.dynamodb.enable` | `vpc-resolver.js` (DynamoDB endpoint) | missing | added |
| `encryption.fieldLevelEncryptionMethod` | only `=== 'kms'` acts; omitted = no key; core reads env, not this key | default `aes` | no default; description says what omission does |
| `encryption.createResourceIfNoneFound` | undefined ≠ false (env-var fallback) | default `false` | no default |
| `encryption.ownership.key`, `.kmsKeyAlias`, `.keyAlias`, `.disable` | `kms-builder.js`, `kms-resolver.js`, discovery, encryption registry | missing | added |
| `user.*` defaults | not applied (`userConfig` passed through, `null` when absent) | declared | applied by the loader; `usePassword` default `false`, `authModes.sharedSecret` default `true` (code behaviour) |
| `user.password` | not read | deprecated alias, default `true` | alias applied by the loader, no default |
| `user.strictUserValidation` | `get-user-from-x-frigg-headers.js` | missing | added |
| `user.fields`, `user.model`, `auth.*`, `security.*`, `webhooks.*`, `custom.*`, `secretsManager`, `label`, `websockets.routeSelectionExpression` | not read | described, with defaults | deprecated, no defaults |
| `logging.level` | sets Lambda log config only when present | default `info` | no default |
| `logging.format` | not read (always JSON) | default `json` | no default |
| `usePrismaLambdaLayer`, `lambda.keepNestedNodeModules`, `scheduler.enable`, `aws.discovery.*`, `migration.ownership.*` | builders | missing | added |
| `telemetry.*`, `admin.*`, `adminScripts`, `reports`, `deployment.*`, `stage`, `region` | core, admin-scripts, CLI, KMS alias | missing | added (`region` deprecated: the region comes from `AWS_REGION`) |
| API module `rateLimit` | not read (`requester.js` has fixed back-off) | described in `api-module-definition` | `frigg validate` warns when set |
