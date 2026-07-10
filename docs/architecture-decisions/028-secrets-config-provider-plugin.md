# ADR-028: Secrets & Config Provider Plugin

**Status**: Draft
**Date**: 2026-07-10
**Deciders**: Sean Matthews

> Draft. The "where do values physically live and how are they read" half of the Configuration &
> Secrets work (ADR-027 is the model; ADR-029 is management).

## Context

The configuration/secrets tiers in ADR-027 need concrete backends, and the reality is multi-cloud:
a live **GCP** deployment, **Azure** on the radar, plus **1Password / Vault** as secret managers
adopters already use. Today only **AWS** is implemented (Secrets Manager → env is live; SSM runtime
loading is a draft; `SsmBuilder` grants IAM but nothing reads it), and there are **zero** references
to GCP Secret Manager, Azure Key Vault, 1Password, or Vault in the code.

There is already a hexagonal seam — `CloudProviderAdapter` (a port with an AWS impl and GCP/Azure
stubs), and **ADR-PLUGINS** proposes required-with-defaults plugins with typed core interfaces
(`provider | database | encryption | queue | scheduler`) selected via `appDefinition.plugins`. The
problem is **cloud-agnostic; only the transport is provider-specific.**

## Decision

Add a **`secrets` / `config` provider plugin type to the ADR-PLUGINS taxonomy** — one typed core
interface, many adapters. The framework never imports a vendor SDK directly; adopters select a
provider in the app definition.

```js
// appDefinition (illustrative)
plugins: {
  secrets: { provider: 'aws' },   // 'aws' | 'gcp' | 'azure' | 'onepassword' | 'vault' | 'database'
}
```

**Port (illustrative) — read *and* write, so any provider can be system-of-record and/or runtime source:**
```js
class SecretsConfigProvider {                 // Port — ADR-PLUGINS plugin interface
  async resolve(keysOrPrefix, { scope, env }) {}  // runtime read → { KEY: value }
  async write(key, value, { scope, env, secret }) {}  // management-plane write (ADR-029)
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

Mode also selects how **variable scoping** (ADR-027) is realized: `materialized` → per-function env
manifest (`global ∪ creds(modules the function serves)`); `direct` → per-function IAM scoped to those
paths, creds pulled at module instantiation.

- **AWS adapter** = the existing SSM Parameter Store + Secrets Manager work, consolidated. The draft
  runtime loader collapses into **one** core loader behind the port (`parametersToEnv` /
  `secretsToEnv` via the Parameters & Secrets Lambda extension); `SsmBuilder` becomes its IAM half.
  This subsumes the former "SSM runtime loading" ADR.
- **GCP** (Secret Manager), **Azure** (Key Vault) adapters — turn the current stubs into real impls.
- **`database` adapter** — backs ADR-027's DB tiers (app-level module creds, instance
  `Credential`/`config`); the same port, a DB transport.
- **`onepassword` / `vault`** — see below.
- **Transport is adapter-internal** (Lambda extension vs SDK vs platform reference vs DB query); the
  port stays cloud-neutral. Refresh/caching is a **port policy** (per-invocation with TTL — matching
  the shipped `secrets-to-env` behavior — so freshness/rotation works without redeploy).

### 1Password / Vault
Two modes, both behind the same interface:
- **Source-of-truth sync (default):** secrets live in 1Password/Vault; at **deploy** the CLI/API
  resolves `op://` / `vault kv` references and syncs them into the runtime provider store — runtime
  stays cloud-native and fast. Answers "is it just their toolchain?" → largely **yes** for authoring.
- **Runtime adapter (optional):** resolve at runtime via 1Password Connect / Service Accounts or
  Vault agent. More moving parts; only if the store should *be* 1Password/Vault.

## Consequences

### Positive
- One interface unlocks AWS/GCP/Azure/1Password/Vault + DB without core changes (ADR-PLUGINS promise).
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

## Open questions
- Precedence when the same key resolves from multiple sources (e.g. Secrets Manager vs SSM vs env)?
- Layer/extension **default-on vs opt-in** (ties to ADR-027 function-granularity).

## Related
- [ADR-027: Configuration & Secrets — Model & Tiers](./027-configuration-and-secrets-model.md)
- [ADR-029: Variable & Secret Management](./029-variable-secret-management.md)
- ADR-PLUGINS (plugin taxonomy this extends); `CloudProviderAdapter` port + AWS adapter;
  `secrets-to-env.js`; the SSM draft on `feature/finish-ssm-based-env-management`.
