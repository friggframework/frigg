# ADR-027: Configuration & Secrets — Model & Tiers

**Status**: Draft
**Date**: 2026-07-10
**Deciders**: Sean Matthews

> Draft capturing the design in progress. Companion ADRs: **ADR-028** (provider plugin) and
> **ADR-029** (management interface). Open questions at the end; not yet ready to send.

## Context

Today Frigg can really only set environment variables **manually at build time**: the declarative
`appDefinition.environment` list pulls values from the deploy pipeline and injects them into the
functions via serverless-oss. Beyond that, an adopter must hand-roll a Lambda layer or already know
about the `secrets-to-env.js` (Secrets Manager) path; the SSM runtime loader is drafted and unmerged.

That single flat env list **blends separable concerns with no distinction**:
- **Infra/runtime** config — `DATABASE_URL`, `KMS_KEY_ARN`, `STAGE` (framework-owned).
- **Framework-behavior** settings — how Frigg itself should behave.
- **Per-environment / dev flags** — feature flags, code-path toggles a dev wants per stage.
- **API-module app credentials** — the client id / secret / scopes each API module needs.

The last category is the one that breaks. **Every adopter eventually hits "env overload,"** usually
at **10+ API modules**, each with OAuth-style credentials (client id + secret + scopes ≈ 3+ values)
= **30+ "env variables"** in one undifferentiated list.

**Correction to an earlier assumption:** the existing DB models are **instance-scoped** and are *not*
a home for app/definition-level env or module credentials:
- `Integration.config` — per-**instance** user/instance configuration.
- `Credential` — auth for a given `Entity` (rolls up to an `Integration` via relationship),
  injected into the API-class instance for the `Requester` base-class fetch. Per-instance
  authentication only.

So there is currently **no first-class home** for app-level, per-API-module credentials/config —
they get dumped into the flat platform env, which is exactly what overloads.

## Decision — a tiered model

Configuration/secrets sort into **three scopes**, each crossed with **{config, secret}**:

| Scope | Config | Secret | Where today |
|---|---|---|---|
| **1. Platform / app-wide** (per env) | infra, framework behavior, feature/dev flags | platform secrets | build-time `environment` → env; Secrets Manager → env (live); SSM (draft) |
| **2. App-level per-API-module** (per env, shared across tenants) | module settings/scopes | **module client id/secret** | ❌ **no home — dumped into flat env (the overload)** |
| **3. Instance / per-tenant** | `Integration.config` | `Credential.data` (field-encrypted) | ✅ exists; injected on demand |

**Invariant (keep):** tier-3 secrets are **never** promoted to `process.env` — they're decrypted and
injected into the module instance on demand. This isolation already holds and must stay.

**The new concept is tier 2** — an app-level, per-module credential/config store, distinct from the
instance `Credential`/`config`. Two ways to realize it (open decision):
- **Option A — mirror models:** new `ModuleCredential` / `ModuleConfig` tables/collections, scoped by
  **app + environment + module** (not by `Entity`), secrets field-encrypted via the existing registry.
- **Option B — repurpose existing models at a different reference/filter POV:** app/definition-level
  rows in `Credential`/config, distinguished from instance rows by scope/reference.

Either way: field-encrypt the secrets, and **inject per module at build/instantiation** rather than
flattening them into the global env — which both removes the overload and scopes each module to only
its own credentials.

### Maturation path (free & fast → mature) — a hard requirement

No adopter should pay for a tier they don't use; each level is opt-in and backward compatible:

- **L0 — day one, free/fast:** build-time env via `appDefinition.environment` from the pipeline. Zero
  infra. (What exists today.)
- **L1:** platform secrets via a provider store (Secrets Manager / SSM / provider), opt-in.
- **L2:** structured **app-level module credentials** (tier 2) — solves env overload — DB-backed or
  provider-namespaced, managed via the admin API / CLI (ADR-029).
- **L3:** multi-provider (GCP / Azure / 1Password / Vault, ADR-028), **per-function scoping**
  (least privilege), and a hosted management GUI.

### Least-privilege scoping (gap to close)

Today env is **global to every function** and IAM sits on one shared role — a function gets *all*
envs, not only what it needs. The target (phased, likely L3): a **per-function env manifest** +
**per-function role**, so each function receives only its declared keys/paths. Tier-2's per-module
injection is a step toward this.

## Consequences

### Positive
- Names and separates the four concerns currently mashed into one env list.
- Gives app-level module credentials a real home → directly kills env overload at scale.
- Preserves the (already-true) instance-secret isolation invariant.
- Free/fast default with an opt-in maturation path — no day-one tax.

### Negative
- Introduces a new storage tier (tier 2) to design, build, and migrate onto.
- Requires reconciling three overlapping platform-env mechanisms (build-time, Secrets Manager, SSM).

### Neutral
- Establishes scope × sensitivity as the vocabulary the CLI/API and docs are organized around.

## Open questions (to resolve)
- **Tier-2 storage:** Option A (mirror models) vs Option B (repurpose existing at app-level filter)?
- Do app-level module secrets live in the **DB** or in a **provider store** (or either, per adopter)?
- **Least-privilege scoping:** commit to per-function manifest + per-function role, and when (L3)?
- Rule for what counts as **platform** vs **app-level-module** vs **instance** — is the boundary
  always obvious, or do we need explicit categorization in the app definition?

## Related
- [ADR-028: Secrets & Config Provider Plugin](./028-secrets-config-provider-plugin.md)
- [ADR-029: Variable & Secret Management (Admin API / CLI / GUI)](./029-variable-secret-management.md)
- ADR-PLUGINS (provider/database/encryption plugin taxonomy), ADR-005 / ADR-010 (admin surface),
  field-level encryption registry (`packages/core/database/encryption/`).
