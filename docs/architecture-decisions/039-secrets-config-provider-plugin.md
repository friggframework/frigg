# ADR-039: Secrets & Config Provider Plugin

**Status**: Proposed
**Date**: 2026-07-10
**Deciders**: Sean Matthews

> Proposed. The "where do values physically live and how are they read" half of the Configuration &
> Secrets work (ADR-038 is the model; ADR-040 is management; ADR-041 is docs & maturation).

## Context

The configuration/secrets tiers in ADR-038 need concrete backends, and the reality is multi-cloud:
a live **GCP** deployment, **Azure** on the radar, plus **1Password / Vault** as secret managers
adopters already use. Today only **AWS** is implemented (Secrets Manager → env is live; SSM runtime
loading is a draft; `SsmBuilder` grants IAM but nothing reads it), and there is **no functional
implementation** for GCP Secret Manager, Azure Key Vault, 1Password, or Vault — only commented-out
provider stubs.

There is already a hexagonal seam — `CloudProviderAdapter` (a port with an AWS impl and GCP/Azure
stubs), and **ADR-016 (Plugins)** proposes required-with-defaults plugins with typed core interfaces
(`provider | database | encryption | queue | scheduler`) selected via `appDefinition.plugins`. The
problem is **cloud-agnostic; only the transport is provider-specific.**

## Decision

**Extend the ADR-016 plugin taxonomy with a new `secrets` / `config` plugin type** — this is a
taxonomy extension (a new core interface added to the five existing types), after which adapters
follow ADR-016's no-core-change rule: one typed core interface, many adapters. The framework never
imports a vendor SDK directly; adopters select an adapter in the app definition.

```js
// appDefinition (illustrative)
plugins: {
  secrets: { provider: 'aws' },   // 'aws' | 'gcp' | 'azure' | 'onepassword' | 'vault' | 'database'
}
```

**Port (illustrative) — read *and* write, so any provider can be system-of-record and/or runtime source:**
```js
class SecretsConfigProvider {                 // Port — ADR-016 plugin interface
  async resolve(keysOrPrefix, { scope, env }) {}  // runtime read → { KEY: value }
  async write(key, value, { scope, env, secret }) {}  // management-plane write (ADR-040)
  runtimeMode() {}                            // 'materialized' | 'direct'
  refreshPolicy() {}                          // e.g. { ttlSeconds: 300 }
}
```

**Runtime mode (decided): support both, `materialized` is the default for external managers.**
- **`materialized`** — values are synced into the function's runtime store (cloud env/SSM/Secrets or
  the DB tier) at write/deploy; the function never calls the external manager at runtime. Default for
  1Password/Vault on serverless, because `direct` needs a **bootstrap secret** (a Service-Account
  token) living in platform env — chicken-and-egg — whereas cloud-native stores authorize via the
  function's IAM role with no stored token.
- **`direct`** — the function reads from the provider at cold start (Connect / Service Account / SDK).
  Available for adopters who want the store to *literally be* 1Password/Vault at runtime.

Mode also selects how **variable scoping** (ADR-038) is realized: `materialized` → per-function env
manifest (`global ∪ creds(modules the function serves)`); `direct` → per-function IAM scoped to those
paths, creds pulled at module instantiation.

```
    write (ADR-040)                                   runtime read
         │                                                 ▲
         ▼                                                 │
 ┌──────────────────── SecretsConfigProvider (port) ──────────────────┐
 │   resolve()      write()      runtimeMode()      refreshPolicy()    │
 └───┬──────────┬──────────┬───────────┬──────────────┬───────────────┘
    aws        gcp       azure     1password         database
  (SSM+SM)  (Secret Mgr)(Key Vault)(Connect/SA)  (ModuleCredential / Credential)

  materialized (default, external mgrs): write ─► sync into runtime store ─► process.env
  direct:                                function ─► provider at cold start
                                         (needs bootstrap token; cloud-native uses IAM)
```

- **AWS adapter** = the existing SSM Parameter Store + Secrets Manager work, consolidated. The draft
  runtime loader collapses into **one** core loader behind the port (`parametersToEnv` /
  `secretsToEnv` via the Parameters & Secrets Lambda extension); `SsmBuilder` becomes its IAM half.
  This folds in the SSM runtime-loading draft (branch `feature/finish-ssm-based-env-management`)
  rather than shipping it as a separate ADR.
- **GCP** (Secret Manager), **Azure** (Key Vault) adapters — turn the current stubs into real impls.
- **`database` adapter** — backs ADR-038's DB tiers (app-level module creds, instance
  `Credential`/`config`); the same port, a DB transport.
- **`onepassword` / `vault`** — see below.
- **Transport is adapter-internal** (Lambda extension vs SDK vs platform reference vs DB query); the
  port stays cloud-neutral. Refresh/caching is a **port policy** (per-invocation with TTL — on AWS the
  TTL cache is provided by the Parameters & Secrets Lambda extension that `secrets-to-env` reads
  through — so freshness/rotation works without redeploy).

### 1Password / Vault
Two modes, both behind the same interface:
- **Source-of-truth sync (default):** secrets live in 1Password/Vault; at **deploy** the CLI/API
  resolves `op://` / `vault kv` references and syncs them into the runtime provider store — runtime
  stays cloud-native and fast. Answers "is it just their toolchain?" → largely **yes** for authoring.
- **Runtime adapter (optional):** resolve at runtime via 1Password Connect / Service Accounts or
  Vault agent. More moving parts; only if the store should *be* 1Password/Vault.

## Consequences

### Positive
- One interface unlocks AWS/GCP/Azure/1Password/Vault + DB without further core changes once the type
  is added (the ADR-016 promise) — adapters need no core edits.
- Collapses the three competing AWS env mechanisms into a single adapter.
- Runtime stays cloud-native even when the source of truth is 1Password/Vault.

### Negative
- Real adapter work (GCP/Azure stubs → impls; 1Password/Vault new).
- The Lambda-extension transport has no clean cross-cloud analog — the port must not leak it.

### Neutral
- Establishes provider selection in `appDefinition.plugins` alongside database/encryption/etc.

### Resolved
- **Runtime mode:** support both; **`materialized` default** for external managers (see above).
- **1Password/Vault:** both modes (source-of-truth-sync **and** runtime adapter); sync is the default.
- **Per-connection (tier-3):** **DB by default.** A **pluggable non-Frigg credential source** — a
  `credentialSource` adapter so an adopter can resolve tier-3 from their own store — is a considered,
  overridable extension point, **deferred, not built now.**

- **Precedence (resolved):** the routing map (ADR-040) fixes **one backend per (tier, env)** → no
  in-tier collision by construction. For genuine overlaps (e.g. legacy build-time env vs the
  routing-map backend), the **provider/routing-map source wins**; the **local** provider overrides
  for the local env only; deploy validation **warns** (opt-in strict mode fails).

## Open questions
- Layer/extension **default-on vs opt-in** (minor; with per-function scoping confirmed, the extension
  attaches only to functions that need `direct` reads).

## Alternatives Considered
- **Keep AWS-only and hand-roll other clouds per adopter.** Rejected: GCP is already live and Azure is
  on the radar; a per-adopter fork multiplies maintenance and contradicts the cloud-agnostic reality.
- **A separate top-level plugin category outside the ADR-016 taxonomy.** Rejected: secrets/config fit
  the existing typed-interface-plus-adapters model; a parallel mechanism would fragment plugin
  selection (`appDefinition.plugins`).
- **`direct` runtime reads as the only mode.** Rejected: needs a bootstrap token in platform env for
  external managers; `materialized` is the default and `direct` remains available.

## Related
- [ADR-038: Configuration & Secrets — Model & Tiers](./038-configuration-and-secrets-model.md)
- [ADR-040: Variable & Secret Management](./040-variable-secret-management.md)
- [ADR-041: Configuration & Secrets — Docs & Adopter Maturation](./041-configuration-secrets-docs-and-maturation.md)
- [ADR-016: Plugins](./016-plugins.md) (plugin taxonomy this extends); `CloudProviderAdapter` port +
  AWS adapter; `secrets-to-env.js`; the SSM draft on `feature/finish-ssm-based-env-management`.
