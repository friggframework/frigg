# SSM Parameter Store Configuration

## Overview

Frigg integrates with AWS Systems Manager Parameter Store in two ways:

1. **Read access** (`ssm.enable`): grants your Lambda functions IAM
   permission to read parameters, so application code can fetch its own
   configuration from Parameter Store.
2. **Environment variable offload** (`environment: { KEY: 'ssm' }`): Frigg
   stores the variable's value in Parameter Store and fetches it at runtime,
   so the value never enters the Lambda environment. This is the built-in
   answer to AWS Lambda's hard **4KB environment-variable limit** — offloaded
   variables cost ~0 bytes of Lambda env instead of their full key+value
   size on *every* function.

Your application code does not change either way: offloaded variables are
populated into `process.env` before your handler runs.

See [ADR-027](../architecture-decisions/027-ssm-parameter-offload-and-env-scoping.md)
for the full design rationale.

## Quick Start: Offloading Variables

```javascript
// backend/index.js
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [/* ... */],
    ssm: {
        enable: true,
    },
    environment: {
        STAGE_URL: true,                    // stays in the Lambda environment
        HUBSPOT_CLIENT_SECRET: 'ssm',       // offloaded to Parameter Store
        OTEL_EXPORTER_OTLP_HEADERS: 'ssm',  // offloaded to Parameter Store
    },
};
```

For secrets, use the typed form so the parameter is stored encrypted
(`SecureString`):

```javascript
ssm: {
    enable: true,
    parameters: {
        HUBSPOT_CLIENT_SECRET: {
            type: 'SecureString',
            description: 'HubSpot OAuth app client secret',
        },
    },
},
```

The offload set is the union of `environment` keys valued `'ssm'` and the
keys of `ssm.parameters`. Keys in both places take their type from
`ssm.parameters`.

## How It Works

### Deploy time

`frigg deploy` (or a standalone `frigg ssm push --stage <stage>`) reads each
offloaded value from the deploy process environment — your CI secrets or
local `.env` — and writes it to Parameter Store **before** the serverless
deploy runs, so parameters always exist before new code cold-starts:

```
/frigg/<service>/<stage>/HUBSPOT_CLIENT_SECRET
```

The generated stack excludes offloaded keys from `provider.environment` and
broadcasts only two small pointers to every function:

- `SSM_PARAMETER_PREFIX` — e.g. `/frigg/my-frigg-app/prod`
- `FRIGG_SSM_OFFLOADED_KEYS` — the declared key names

The Lambda execution role receives read access scoped to the prefix (the
pre-existing broad `parameter/*` grant from `ssm.enable` is kept for
backward compatibility; set `ssm.restrictIamToPrefix: true` to drop it).

### Runtime — INIT phase (primary)

Offloaded values are fetched and written into `process.env` during Lambda
**INIT**, before your handler and any API module is loaded. This is required
for credentials: API modules capture their OAuth client secret in a top-level
`const Definition = { env: { client_secret: process.env.X } }` evaluated at
module-require — a handler-time fetch would be too late and the value would be
`undefined`. Frigg sets `NODE_OPTIONS=--import` on each function to load
`ssm-preload.mjs` (shipped in `@friggframework/core`), whose top-level `await`
completes before the entry module. A fetch failure rejects the preload and
fails INIT loudly (fail-fast), naming the missing key.

The preload is attached only to Frigg-generated (`skipEsbuild`) handlers, which
package the preload file. **Adopter custom functions that are esbuild-bundled
do not receive it** — they fall back to the handler-time loader below, which is
too late for module-load credential reads. A custom function that needs an
offloaded credential at module-load must be `skipEsbuild`.

### Runtime — handler fallback

For values read lazily (request time) and for TTL refresh, a loader also runs
in the `createHandler` bootstrap. It never touches a key already in
`process.env` (so the preload's values and console overrides win), and
refreshes the preloaded keys per container on a TTL (default 300 seconds,
`FRIGG_SSM_CACHE_TTL`; `0` caches for the container lifetime).

**Precedence** (highest wins):

1. Real Lambda environment variables — a value set directly on a function's
   configuration always wins, and the SSM loaders never touch it.
2. Secrets Manager values injected via `SECRET_ARN` (`secretsToEnv`), which
   runs first in the handler and overwrites, so it wins over SSM.
3. INIT preload / handler loader SSM values.

If a declared parameter is missing from Parameter Store, INIT fails
immediately with an error naming the missing key — a deliberate fail-fast
instead of `undefined` surfacing somewhere downstream.

> **Keep offloaded keys and Secrets Manager keys disjoint.** The ordering above
> holds only when a key is offloaded to SSM *or* in the `SECRET_ARN` bundle, not
> both. A key in both has undefined precedence: the INIT preload sets the SSM
> value before modules load (so module-load reads see SSM), `secretsToEnv` then
> overwrites it in the handler (Secrets Manager), and a later cache-TTL refresh
> writes the SSM value back. Framework-managed secrets (`DATABASE_*`, etc.) are
> already on the offload blocklist, so this only arises if an app marks one of
> its own `SECRET_ARN` keys `'ssm'` — don't.

### What cannot be offloaded

Framework-managed variables (`DATABASE_URL`, `DATABASE_*`, `KMS_KEY_ARN`,
`AES_*`, `STAGE`, `FRIGG_*`, `SECRET_ARN`, `DB_TYPE`, and the AWS-reserved
set) are rejected at build time: the database-migration handlers read them
before the loader runs.

## Debugging and On-the-Fly Changes

**Inspect values** in the AWS console (Systems Manager → Parameter Store →
filter by `/frigg/<service>/<stage>/`, toggle "Show decrypted value") or:

```bash
aws ssm get-parameter --name /frigg/my-app/dev/HUBSPOT_CLIENT_SECRET --with-decryption
aws ssm get-parameters-by-path --path /frigg/my-app/dev --with-decryption
```

Parameters keep full version history, so "what was this value last Tuesday"
is answerable — something Lambda env config never offered.

**Change a value for all functions**: `aws ssm put-parameter --overwrite ...`
(or edit in the console). Warm containers converge within the cache TTL
(default 5 minutes); new containers pick it up immediately.

**Override one function instantly** (the classic debugging workflow): set the
variable directly in that function's Lambda console configuration. Real env
vars beat SSM, and saving the config recycles that function's containers, so
the override applies immediately and only there.

Both kinds of edits are temporary: the next `frigg deploy` re-pushes
parameters from CI/`.env` values and resets function configs.

## Local Development

Nothing changes. In local mode (`frigg start`), offloaded keys fall back to
plain `${env:KEY}` resolution from your `.env` — no SSM calls, no AWS
dependency, and the runtime loader is inert because the SSM pointer
variables are never set.

## Configuration Reference

```javascript
ssm: {
    enable: true,                 // required for any SSM feature
    parameterPrefix: '/custom',   // optional; default /frigg/${service}/${stage}.
                                  // Non-default prefixes without "frigg" require
                                  // widening the generated deployment IAM policies.
    kmsKeyArn: 'arn:aws:kms:...', // optional customer-managed key for SecureString;
                                  // grants the Lambda role kms:Decrypt on it.
                                  // Default: the AWS-managed aws/ssm key.
    restrictIamToPrefix: true,    // optional; drop the legacy broad parameter/* read grant
    parameters: { /* typed offload declarations, see above */ },
},
```

### `frigg ssm push`

```bash
frigg ssm push --stage prod                 # write offloaded values from env/.env to SSM
frigg ssm push --stage prod --allow-empty    # skip keys with no value (only for keys already in SSM)
frigg ssm push --stage prod --tier advanced  # allow values up to 8KB (advanced tier, billed by AWS)
frigg ssm push --stage prod --region eu-west-1  # target a specific region (default: AWS_REGION, else us-east-1)
```

`frigg deploy` runs the push automatically before deploying whenever the
offload set is non-empty. Use the standalone command to rotate a value
without deploying (containers converge within the cache TTL) or to seed a
new stage.

Values are validated at push time: missing/empty values are an error unless
`--allow-empty`, which skips them — but only for keys whose parameter already
exists (rotation); a skipped key with no parameter aborts the push, since it
would fail every function at cold start. Values over 4KB (the standard-tier
limit) require the advanced tier (up to 8KB, billed by AWS): set
`ssm.parameters.<KEY>.tier: 'advanced'` in the app definition, or pass
`--tier advanced`.

## VPC Integration

When the offload set is non-empty and `vpc.enable` is true, Frigg creates an
SSM interface endpoint (`FriggSSMVPCEndpoint`, ~$7–22/month) so Lambdas in
private subnets can reach Parameter Store without a NAT route. Without it,
SSM calls from a VPC-enabled Lambda would hang.

## Cost

| Configuration | Parameter cost | Endpoint cost |
|---------------|----------------|---------------|
| Standard-tier parameters (≤4KB values) | $0 | — |
| + VPC enabled with offload | $0 | ~$7–22/month (SSM interface endpoint) |

API traffic is one batched fetch per container per TTL window — negligible
against standard throughput limits.

## Deployment Notes and Accepted Trade-offs

- **Rollbacks**: parameters are pushed before the stack update. If the
  deploy fails and CloudFormation rolls back the code, parameters keep their
  new values — use parameter version history to revert manually if needed.
- **Concurrent deploys** to one stage are last-writer-wins on parameters.
- **Warm containers** keep values fetched at cold start until the TTL
  expires or the container recycles.
- The management UI's environment utilities use a separate
  `/frigg/<environment>` namespace; it does not read or write this feature's
  `/frigg/<service>/<stage>` parameters.

## Version Requirements

- `@friggframework/core` and `@friggframework/devtools` releases that
  include ADR-027 (offload requires BOTH: devtools generates the pointers,
  core fetches at runtime — upgrading devtools alone would silently drop
  offloaded variables).
- Works in all AWS regions; no Lambda layers or extensions required (the
  loader uses `@aws-sdk/client-ssm` directly).
