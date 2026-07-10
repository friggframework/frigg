# ADR-027: SSM Parameter Offload and Per-Function Environment Scoping

**Status**: Accepted
**Date**: 2026-07-10
**Deciders**: Daniel Klotz

## Context

AWS Lambda enforces a hard 4096-byte cap on the JSON-serialized environment
variables of a function. Frigg composes a single app-wide environment block
(`provider.environment`) and broadcasts it to every function in the stack:
each integration's OAuth credentials and API keys, every per-integration SQS
queue URL, migration and scheduler variables, and any observability config.
A multi-integration app therefore sits near the ceiling on *every* Lambda.
Measured on a production app (~25 functions): base functions 3817/4096 bytes,
`dbMigrationRouter` 3881, `adminScriptRouter` 4009. Adding three
`OTEL_EXPORTER_OTLP_*` variables (~243 bytes) pushed the heaviest functions
over the limit, and because the limit is enforced per function inside one
CloudFormation update, a single over-budget function fails and rolls back the
entire deploy.

Two aggravating facts shaped the solution:

1. Deploy-time indirection does not help. A `${ssm:...}` reference is
   resolved at package time and the *value* still lands in the function's
   environment — the 4KB footprint is unchanged.
2. `ssm.enable` was documented (in `docs/reference/ssm-configuration.md`) as
   attaching the AWS Parameters and Secrets Lambda Extension, scoping IAM to
   `/${service}/${stage}/*`, and exporting `SSM_PARAMETER_PREFIX` — but none
   of that was ever implemented. The real `SsmBuilder` only granted broad
   read IAM (`parameter/*`) and `ssm.parameters` was schema-validated but
   never consumed. `secretsManager.enable` is likewise a dead flag.

The root cause has two independent axes: **payload** (large static secret
values on every function) and **count** (framework-generated variables such
as `<NAME>_QUEUE_URL` broadcast to functions that never use them, growing
O(N) with integration count).

## Decision

Attack both axes with two composable, individually opt-in mechanisms.

### 1. SSM runtime-fetch offload (payload axis)

A variable marked for offload lives in SSM Parameter Store and is fetched by
the runtime at cold start; its value never enters the Lambda environment.

- **API**: `environment: { MY_SECRET: 'ssm' }` marks a variable for offload;
  `ssm.parameters: { MY_SECRET: { type: 'SecureString' } }` is the typed,
  secret-aware form. The union of both is the offload set. Framework-managed
  keys (`DATABASE_*`, `KMS_KEY_ARN`, `STAGE`, `FRIGG_*`, `SECRET_ARN`, …) are
  blocklisted from offload because the migration handlers bypass the loader
  and read them directly.
- **Build time** (`SsmBuilder`, `environment-builder`): offloaded keys are
  excluded from `provider.environment`; only two small pointers are
  broadcast — `SSM_PARAMETER_PREFIX` (default
  `/frigg/${service}/${stage}`) and `FRIGG_SSM_OFFLOADED_KEYS` (the declared
  key list, enabling fail-fast). A prefix-scoped read statement is added to
  the Lambda role. In local mode the same keys fall back to plain
  `${env:KEY, ''}` references so `frigg start` + `.env` is unaffected.
- **Runtime** (`parametersToEnv()` in `@friggframework/core`, invoked from
  the `createHandler` bootstrap next to `secretsToEnv()`): fetches the
  declared keys by explicit name (`GetParameters`, batched by 10,
  `WithDecryption: true`), populates `process.env`, and caches per container
  with a configurable TTL (default 300s, `FRIGG_SSM_CACHE_TTL`, `0` = cache
  forever). Precedence is **real env > Secrets Manager (`secretsToEnv`) >
  SSM**: the loader never touches a key that already exists in
  `process.env`, and on TTL refresh only updates keys it itself set. A
  console-set env var on a single function therefore overrides SSM instantly
  — the established debugging workflow keeps working. Missing declared
  parameters fail the cold start with an error naming the missing keys.
- **Provisioning** (`frigg ssm push`, also run automatically by
  `frigg deploy` before the serverless deploy): reads offloaded values from
  the CLI process environment (CI secrets or `.env`), validates them
  (non-empty, ≤4KB), and writes them via `PutParameter` with
  `Overwrite: true`. Running before the code deploy guarantees parameters
  exist before the first cold start of new code.
- **Encryption**: SecureString parameters default to the AWS-managed
  `aws/ssm` key. An optional `ssm.kmsKeyArn` selects a customer-managed key,
  in which case the Lambda role is granted `kms:Decrypt` on that key.
- **VPC**: when the offload set is non-empty and VPC is enabled, an SSM
  interface endpoint (`FriggSSMVPCEndpoint`) is created so private-subnet
  Lambdas can reach Parameter Store.

Everything above activates only when the offload set is non-empty. An app
with `ssm.enable: true` and no offload markers keeps today's exact behavior
(broad `parameter/*` read IAM, no new env vars, no loader activity, no VPC
endpoint). The legacy broad read grant is retained even with offload active
unless `ssm.restrictIamToPrefix: true` is set.

### 2. Per-function environment scoping (count axis)

Behind `lambda.scopedEnvironment: true` (default `false`), framework builders
emit function-scoped environment maps (`result.functionEnvironments`) instead
of pushing everything into the global block. The orchestrator merges these
after all functions exist; unknown target names are a hard build error, and
a key a builder already set directly on a function is never clobbered.

Verified consumer sets (the reason this is not a naive "each integration's
functions only" split):

- `<NAME>_QUEUE_URL` → `auth` (the shared router dispatches integration
  actions synchronously) ∪ `adminScriptExecutor` and `adminScriptRouter`
  (admin scripts instantiate arbitrary integrations, including sync
  in-process execution) ∪ the owning integration's full function set
  (router, webhook, every extension handler, queue worker).
- `SCHEDULER_ROLE_ARN` / `SCHEDULE_GROUP_NAME` → the same union **except**
  `adminScriptRouter`, which keeps its already-scoped admin-scheduler role
  value.
- Migration vars (`S3_BUCKET_NAME`, `MIGRATION_STATUS_BUCKET`,
  `DB_MIGRATION_QUEUE_URL`) → `dbMigrationRouter` / `dbMigrationWorker` only.
- `ADMIN_SCRIPT_QUEUE_URL` → `adminScriptRouter` / `adminScriptExecutor`.
- Stays global: `STAGE`, `FRIGG_*`, `KMS_KEY_ARN`, `DATABASE_*`, `DB_TYPE`
  (tiny values with broad or bootstrap-time consumers).

Scoping is skipped entirely in local mode: the serverless-plugin injects
LocalStack queue URLs at provider level only, and function-level values would
shadow them.

## Consequences

### Positive

- Offloading an app's secrets/config removes their full byte weight from
  every function. On the measured app, the worst function drops from 4009B
  to ~1,640B with offload alone; base functions that also shed scoped
  framework vars reach ~500–700B.
- Adding integration N+1 no longer adds queue-URL bytes to unrelated
  functions (scoping), and adding observability/config vars no longer risks
  a stack-wide rollback (offload).
- Parameter Store adds version history and CloudTrail audit for config
  changes, and one `put-parameter` updates all functions (within the cache
  TTL) without a redeploy.
- Both features are inert until opted into; no existing app changes behavior
  on upgrade.

### Negative

- One extra API call per container cold start (and per TTL window), plus an
  SSM interface endpoint cost (~$7–22/month) for VPC deployments with
  offload.
- Warm containers hold values fetched at cold start; after an out-of-band
  parameter edit, containers converge only within the cache TTL. The
  Lambda console no longer shows offloaded values (they are in Parameter
  Store instead).
- A missing parameter fails cold starts app-wide (deliberate fail-fast);
  the auto-push in `frigg deploy` makes this practically unreachable in the
  normal flow.
- If a CloudFormation deploy fails *after* parameters were pushed, the
  rolled-back (old) code reads the new parameter values. Accepted risk;
  parameter version history enables manual revert. Concurrent deploys to
  one stage are last-writer-wins on parameters.
- Scoping can break app code that reads *another* integration's queue URL
  from its own env — the reason it ships opt-in. A `dependsOnQueues`
  declaration is the designed escape hatch if a real app needs
  cross-integration enqueue (not implemented until needed).

### Neutral

- The deployment IAM policies gain `ssm:PutParameter` / `ssm:DeleteParameter`
  / `ssm:AddTagsToResource`, still scoped to `*frigg*` parameter names; the
  default prefix `/frigg/${service}/${stage}` was chosen precisely to stay
  inside that scope. Overriding `ssm.parameterPrefix` to a path without
  "frigg" requires widening those policies manually.
- The management UI's parameter utilities use a two-segment
  `/frigg/${environment}` namespace that does not intersect with this
  feature's three-segment prefix. They remain separate namespaces; unifying
  them is follow-up work.
- `docs/reference/ssm-configuration.md` is rewritten to describe the
  implemented behavior (the extension-layer design it previously described
  was never built and is explicitly rejected below).

## Alternatives Considered

- **Deploy-time `${ssm:...}` resolution**: rejected — values are baked into
  the function environment at package time, so the 4KB footprint is
  unchanged.
- **AWS Parameters and Secrets Lambda Extension** (as the old docs
  promised): rejected in favor of `@aws-sdk/client-ssm`. The extension layer
  ARN is region-specific (per-region account IDs), it cannot batch-read by
  name list the way `GetParameters` can, and per-container memoization in
  the loader already provides the extension's caching benefit.
- **`AWS::SSM::Parameter` CloudFormation resources for provisioning**:
  rejected — CloudFormation does not support creating `SecureString`
  parameters, and secret values would leak into S3-stored templates.
- **Secrets Manager instead of Parameter Store**: the `SECRET_ARN` +
  `secretsToEnv()` path already exists and is retained (it runs first and
  wins over SSM on key collisions). Parameter Store was chosen for offload
  because standard-tier parameters are free, IAM/path scoping is simple,
  and no rotation machinery is needed for static config.
- **Per-function scoping as the only fix (no SSM)**: rejected as
  insufficient — `auth` and the admin-script functions must retain all queue
  URLs plus app secrets by design, leaving them near the ceiling; only
  removing secret payloads from the env entirely gives durable headroom.
- **Default-on scoping**: rejected for safety — a variable missing from a
  function that needs it is a runtime failure, worse than the deploy-time
  failure being fixed. Opt-in with a composer audit path first.

## Related

- [ADR-005](./005-admin-script-runner.md) — admin-script functions are why
  queue URLs cannot be scoped to owning integrations only.
- `docs/reference/ssm-configuration.md` — user-facing reference for the
  offload feature.
- `packages/devtools/infrastructure/domains/parameters/` — `SsmBuilder`,
  offload utilities.
- `packages/core/core/parameters-to-env.js` — runtime loader.
- `packages/devtools/frigg-cli/ssm-command/` — provisioning CLI.
