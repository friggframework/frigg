# ADR-040: Variable & Secret Management — Admin API, CLI, GUI

**Status**: Proposed
**Date**: 2026-07-10
**Deciders**: Sean Matthews

> Proposed. The "how do humans/tools manage values across all tiers" half of the Configuration &
> Secrets work (ADR-038 is the model; ADR-039 is the storage/provider port; ADR-041 is docs &
> maturation).

## Context

Even with the tier model (ADR-038) and provider port (ADR-039), adopters need a way to *manage*
variables and secrets. Today there is **no `frigg secrets` / `frigg env` command**, no unified
surface, and management is scattered: hand-edited pipeline env, `setup-gh-env-secrets.sh` scripts, a
local-only `.env` editor in the management UI. We must not solve this by putting routing logic in the
CLI (it would diverge from any future GUI).

## Decision

**The management interface is a set of admin API routes; every front-end is a thin client of them.**

- **Admin API is the one brain.** Routes (admin-authed, in the same admin-operation surface family as
  ADR-005 / ADR-010; this ADR introduces its own `/api/v2/admin/variables` namespace)
  accept a value plus its **category / scope / sensitivity**, and the **API decides where to store
  it** based on the Frigg base app config/definition (which providers/tiers are configured per
  ADR-038/039) and the target environment. Storage routing lives here, once.
- **The CLI is a client of those routes** — and, because they're plain admin API, the same calls are
  **curl-able** and a **hosted GUI/UI** can drive all layers of variables and secrets through the
  identical API. One API, many front-ends, no duplicated logic.
- **Smart routing** = a function of (sensitivity: config vs secret) × (scope: platform /
  app-level-module / per-connection) × (environment) × (configured provider). The caller states
  intent; the API places it: platform → provider store; app-level module cred → tier-2 store
  (DB/provider); per-connection → `Integration.config` / `Credential`.
- **Routing map (per tier × environment → backend).** The placement rules live in a declared map so
  the same intent routes differently per env, and **"unified 1Password" = set every tier's backend to
  `1password`** (persona: "manage all of it in one place"). Mixed setups are just a different map.
  ```js
  // app definition (illustrative)
  secretsRouting: {
    prod:  { platform: '1password', appModule: '1password', perConnection: 'database' },
    local: { platform: 'local',     appModule: 'local',     perConnection: 'database' },
  }
  ```
- **Local parity.** A first-class **`local` provider** (gitignored file / docker DB) is the default
  backend for local envs, so `frigg start` + the CLI/UI work with **zero cloud**. Because backend is
  per-environment, a dev who lives in 1Password can point `local` at it too (via `op`), ideally
  `materialized` so there's no runtime dependency.
- **Scoping is emitted, not manual.** On deploy/build the API + infra derive each function's variable
  set / IAM from the integration→module graph (ADR-038) — the management layer never hand-maintains
  per-function manifests.

```
   CLI       curl       GUI / UI          (thin clients — no routing logic)
     └─────────┼──────────┘
               ▼
     ┌──────────────── Admin API ─────────────────┐
     │  reads routing map (tier × env → backend);  │
     │  places / resolves each value once          │
     └───┬──────────────┬─────────────────┬────────┘
     platform        app-module        per-connection
     provider store   ModuleCredential/   DB Credential /
     (SSM/Secrets/    provider            Integration.config
      1Password/local)
```

**Illustrative CLI (thin wrappers over admin routes):**
```
frigg config set FEATURE_X=on --stage prod            # platform config  → SSM / App Config
frigg secret set DATABASE_URL --stage prod            # platform secret  → Secrets Manager / KV / 1Password
frigg module cred set hubspot --client-id … --secret … --scopes … --stage prod   # app-level module → tier-2 store
frigg integration config set <integrationId> key=val  # instance config  → Integration.config (DB)
```
```
GET/PUT /api/v2/admin/variables            # curl or GUI hit the same routes the CLI does
```

## Consequences

### Positive
- One place decides storage routing → CLI, curl, and a future GUI stay consistent by construction.
- Adopters manage all tiers through a uniform surface; a hosted UI becomes "just another client."
- Reuses the established admin-auth/admin-operation surface rather than a new mechanism.

### Negative
- Requires admin write routes that mutate real secret stores — needs careful auth, redaction, audit.
- Routing rules must be well-specified so `set` is predictable.

### Neutral
- Positions variable/secret management as part of Frigg's admin API, alongside reporting/scripts.

## Open questions
- **Routing:** inferred (from sensitivity/scope) vs explicit subcommands/flags?
- **Auth:** reuse the admin API key (per ADR-010, which folded the earlier separate reporting key into
  one admin key), or mint a dedicated management credential given these routes mutate secret stores?
- **Read-back & redaction:** can values be read back (never secrets in plaintext?), and what's audited?
- Where the **routing policy** itself is declared — app definition vs API config.

## Alternatives Considered
- **Put routing logic in the CLI.** Rejected explicitly: it would diverge from any future GUI; the
  routing decision must live once, in the admin API, so every front-end stays consistent.
- **A dedicated non-admin secrets service/endpoint family.** Rejected: reuses none of the established
  admin-auth/admin-operation surface and adds a second security perimeter to harden.
- **Per-tier bespoke commands with no routing map.** Rejected: the routing map is what makes "unified
  1Password" and mixed per-env setups a config change rather than new code.

## Related
- [ADR-038: Configuration & Secrets — Model & Tiers](./038-configuration-and-secrets-model.md)
- [ADR-039: Secrets & Config Provider Plugin](./039-secrets-config-provider-plugin.md)
- [ADR-041: Configuration & Secrets — Docs & Adopter Maturation](./041-configuration-secrets-docs-and-maturation.md)
- ADR-005 (Admin Script Runner — admin auth/surface), ADR-010 (admin operations / admin API key).
