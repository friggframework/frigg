# ADR-027: SSM-Based Runtime Environment Loading

**Status**: Proposed
**Date**: 2026-07-10
**Deciders**: Sean Matthews

## Context

Frigg apps run as Lambdas that need runtime configuration and secrets (`DATABASE_URL`, API keys,
etc.). Today **three overlapping mechanisms** exist — only one is the intended end state, and the
merged docs describe behavior that was never merged:

1. **Build-time env injection** — `appDefinition.environment` (merged, commit `6fa8219`). Wires env
   vars into the serverless template at **deploy time** (e.g. from CI secrets). Values are baked per
   deploy.
2. **IAM-only SSM** — `SsmBuilder` (merged on `next`, `packages/devtools/infrastructure/domains/parameters/ssm-builder.js`).
   `ssm: { enable: true }` currently produces **only** IAM `ssm:Get*` permissions scoped to
   `/${service}/${stage}/*`. No layer, no runtime loading — **the flag grants access to parameters
   nothing reads.**
3. **Runtime SSM→env loader (the intended feature)** — draft only, on branch
   `feature/finish-ssm-based-env-management` @ `3dcf1f8` ("Draft concept", Sean Matthews, Sep 2025),
   **never merged**. Auto-attaches the AWS Parameters & Secrets Lambda Extension layer and, on
   invocation, loads SSM params under the prefix into `process.env` (SecureString KMS-decrypted). The
   draft carries **two competing loaders** — a core `create-handler.js` hook (`packages/core/core/ssm-parameters.js`)
   and a devtools handler wrapper (`packages/devtools/handlers/ssm-handler-wrapper.js`) — never
   consolidated.
4. **Doc/code drift** — `docs/reference/ssm-configuration.md` (merged) already *describes* the
   layer + env-population behavior of #3, which is not in the merged code.

The intent: an app-config flag that makes runtime configuration "just work" — put params in SSM,
flip `ssm.enable`, and the app reads them from `process.env` with no per-integration code, secrets
KMS-decrypted, without baking values into the deploy.

## Decision

Adopt the **runtime SSM/Secrets loader via the AWS Parameters & Secrets Lambda Extension** as the
canonical mechanism, gated by `ssm: { enable: true }`, and reconcile it with the merged pieces.

1. **One flag, full behavior.** `ssm: { enable: true }` (optional `architecture: 'x86_64' | 'arm64'`)
   does three things: attach the extension layer, grant the scoped IAM, and load params at runtime.
   The merged `SsmBuilder` becomes **one component** (the IAM half) of the full feature, not the
   whole thing.
   ```js
   const appDefinition = {
     name: 'my-frigg-app',
     integrations: [ /* ... */ ],
     ssm: { enable: true, architecture: 'x86_64' },  // architecture optional
   };
   ```

2. **Load via the extension; cache on warm invocations.** Read parameters through the extension's
   localhost endpoint (not the SDK) under prefix `/${service}/${stage}`, mapping keys to `process.env`
   as UPPER_SNAKE (`database-url` → `DATABASE_URL`). Load on cold start / handler init and rely on
   the extension's local cache (configurable TTL) for warm invocations — **not** a fresh SSM
   round-trip per request.
   ```js
   // create-handler hook (consolidated single loader)
   await parametersToEnv(process.env.SSM_PARAMETER_PREFIX); // withDecryption, recursive
   // maps /svc/stage/database-url -> process.env.DATABASE_URL
   ```

3. **SSM + Secrets Manager, one layer.** The same extension serves both. Use **SSM Parameter Store**
   for configuration/non-secret params and **Secrets Manager** for secrets; both KMS-decrypted
   (SecureString / SM). Consolidate the draft's two competing loaders into a single core loader path.

4. **Distinct from build-time env.** Runtime SSM loading (invocation-time; values live in SSM) and
   `appDefinition.environment` (deploy-time; values baked into the template) are **complementary, not
   competing**: build-time for values known at deploy, runtime SSM for values that rotate or differ
   per environment without a redeploy. Keep both; document when to use which.

5. **KMS / SecureString policy.** All reads use `withDecryption: true`; SecureString params are
   KMS-decrypted by SSM. Under `vpc.enable`, provision the **SSM (and Secrets Manager) VPC endpoint**
   so the extension reaches the service from private subnets. Builds on the already-merged KMS +
   VPC-endpoint work (field-level encryption / `KmsBuilder`).

6. **Operational specifics.** Pin/parameterize the extension layer version (the draft hardcodes
   `:19`); select the layer ARN by region × architecture; keep the `/${service}/${stage}/...` naming
   contract; and **fix the doc/code drift** in `docs/reference/ssm-configuration.md` to match shipped
   behavior.

### Open decisions (for Sean)
- **Refresh model:** cold-start-only vs extension-cache TTL vs explicit refresh. *(Recommend
  extension cache with a configurable TTL.)*
- **SSM vs Secrets Manager split:** enforce a convention (params vs secrets) or allow either for both?
- **Layer default-on:** the draft attaches the layer unless `secrets.enable === false`. Keep it
  opt-in via `ssm.enable` / `secrets.enable`, or default-on when either is configured?

## Consequences

### Positive
- Config/secrets "just work" from SSM with no per-integration code; nothing secret baked into deploys.
- KMS decryption handled transparently; one extension serves both SSM and Secrets Manager.
- Turns the currently-inert `ssm.enable` flag into a complete feature.

### Negative
- Adds a Lambda layer (cold-start weight) + extension configuration.
- VPC mode requires the SSM/Secrets VPC endpoints.
- Real work remains: consolidate the draft's two loaders, reconcile with the merged `SsmBuilder`,
  pin the layer version, and add CI tests.

### Neutral
- Establishes `/${service}/${stage}` naming + UPPER_SNAKE mapping as the contract.
- Supersedes the `feature/finish-ssm-based-env-management` draft branch.

## Alternatives Considered
- **Keep IAM-only `SsmBuilder`.** Rejected: grants access to parameters nothing loads — the flag is
  inert.
- **SDK-based loading (no extension).** Rejected: the extension provides caching + Secrets Manager
  and avoids SDK weight in the handler path.
- **Build-time env only (`appDefinition.environment`).** Rejected as the sole mechanism: bakes values
  into deploys; no rotation without redeploy.
- **Ship the draft as-is.** Rejected: two competing loaders, hardcoded layer version, no VPC
  endpoint, tests not wired to CI.

## Related
- Draft: `feature/finish-ssm-based-env-management` @ `3dcf1f8` — `packages/core/core/ssm-parameters.js`,
  `packages/core/core/create-handler.js`, `packages/devtools/infrastructure/aws-ssm-layer-arns.js`,
  `packages/devtools/infrastructure/serverless-template.js`,
  `packages/devtools/handlers/ssm-handler-wrapper.js`, `packages/devtools/utils/ssm-parameter-store.js`.
- Merged: `packages/devtools/infrastructure/domains/parameters/ssm-builder.js`,
  `docs/reference/ssm-configuration.md` (needs a drift fix).
- Build-time env: `appDefinition.environment` (commit `6fa8219`).
- KMS field-level encryption + VPC endpoints (merged) — the KMS foundation this relies on.
