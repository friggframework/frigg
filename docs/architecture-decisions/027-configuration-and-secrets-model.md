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
| **2. App-level per-API-module** (per env, shared across all connections) | module settings/scopes | **module client id/secret** | ❌ **no home — dumped into flat env (the overload)** |
| **3. Per-connection** (instance) | `Integration.config` | `Credential.data` (field-encrypted) | ✅ exists; injected on demand |

> **Terminology:** tier 3 is **per-connection** — one `Credential` per `Entity`, i.e. the tokens a
> specific end user gets when they authorize *their* account (`User → Integration → Entity →
> Credential`). Not to be confused with **deployment tenancy** (one Frigg instance per adopter
> customer), a separate axis. Tier 2 is the **app-level** OAuth *application* credential (one per
> module per environment, shared by all connections) — e.g. the HubSpot `client_id`/`secret` you
> register once. Tier 3 is what Jane gets when she clicks "Connect HubSpot."

**Invariant (keep):** tier-3 (per-connection) secrets are **never** promoted to `process.env` —
they're decrypted and injected into the module instance on demand. This isolation already holds and
must stay.

**Two planes.** Every tier has a **management plane** (where values are authored — the admin API /
CLI / UI, ADR-029) and a **runtime plane** (where the app reads them). Any provider (ADR-028) can
serve one or both: e.g. an adopter can make **1Password the system of record** for tiers 1–2 while
the runtime reads from a cloud store (materialized) or from 1Password directly. Tier 3 is authored by
the *running app* (at connect time), not by an admin — so it lives in the DB by default.

```
 SCOPE                MANAGEMENT PLANE          STORE (routing map, ADR-029/028)         RUNTIME PLANE
                      admin API / CLI / UI
 Tier 1 platform      ──write──►                SSM / Secrets / 1Password / local  ──►   process.env  (every function)
 Tier 2 app-module    ──write──►                ModuleCredential/Config | provider ──►   env of functions running
                                                                                          that module (scoped)
 Tier 3 per-conn.     (written by running app)  DB Credential / Integration.config ──►   injected on demand,
                                                                                          never in process.env
```

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

The adopter-facing narrative of this journey — plus a cross-pattern worked example — is **ADR-030**.

### Variable scoping — deliver only what a function needs

**Principle: a variable reaches only the bundled functions that need it.** Three scoping levels,
which Frigg can **derive from the app definition's integration→module graph** (it already knows which
integration uses which modules — no hand-authored manifest):

- **Global** — `DATABASE_URL`, `KMS_KEY_ARN`, `STAGE`, framework-behavior settings → every function.
- **Module-scoped** — tier-2 creds like `HUBSPOT_CLIENT_ID`/`SECRET`/scopes → **only functions that
  run the HubSpot module.** The Asana function never sees them *unless* it also runs HubSpot — the
  rule is **usage-based, not name-based**, so the graph handles the "adopter runs HubSpot through
  their Asana app" case correctly.
- **Per-connection** — tier-3 → never in env; fetched on demand for the specific connection.

This maps onto the two runtime modes (ADR-028):
- **`materialized`** → each function's env = `global ∪ creds(modules it serves)` (a per-function env
  manifest).
- **`direct`** → each function's role/identity is scoped to `global ∪ module-cred paths for modules
  it serves`; modules pull creds at instantiation — which also **eliminates env-overload** (nothing
  sits in env).

**Boundary rule — derive by default, annotate the edge cases.** Tier-2 module creds are derived from
the module's auth definition + the graph (no annotation); per-connection is inherently distinct;
everything else defaults to platform-global. The app definition can override scope for
adopter-specific values the graph can't infer:

```js
environment: {
  DATABASE_URL: true,                          // platform (global) — inferred
  MY_HUBSPOT_ONLY_FLAG: { scope: 'hubspot' },  // override: only functions running the hubspot module
}
// HUBSPOT_CLIENT_ID/SECRET/scopes (tier-2) need no annotation — derived from the module + graph.
```

**Confirmed against the code — the granularity is already there.** The infra builder emits
**per-integration functions**: `integration-builder.js` creates, per integration, an HTTP handler
(`functions[integrationName]`), a webhook handler (`{name}Webhook`), a queue worker, and one function
per extension binding (`{name}__{binding}`) — and packaging is **`package: { individually: true }`**
(`base-definition-factory.js`), so each is a discrete, separately-packaged Lambda. Per-function
env/IAM scoping therefore needs **no bundling restructure**.

Env is global today only by **wiring**: the composer does
`Object.assign(provider.environment, merged.environment)` (`infrastructure-composer.js`), dumping all
vars onto the shared provider block. The fix (`materialized` mode) is to emit
`functions[name].environment` = `global ∪ creds(that integration's modules)` from the
integration→module graph instead of onto the global block; shared/non-integration functions (auth,
health, reporting, db-migrate) get `global` only. `direct` mode remains the alternative that keeps
creds out of env entirely.

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

### Resolved so far
- **Tier-2 storage: Option A — mirror models.** New `ModuleCredential` / `ModuleConfig`
  tables/collections scoped by **app + environment + module** (not by `Entity`), secrets
  field-encrypted via the existing registry. Chosen for clarity/cleanliness over overloading
  `Credential`/`config`.
- **Runtime modes:** support **both** `materialized` and `direct`; **`materialized` is the default**
  for external managers on serverless (avoids a bootstrap token in functions). (ADR-028.)
- **Per-connection creds:** **DB by default.** A pluggable **non-Frigg credential source** (resolve
  tier-3 from an adopter's own store) is a considered, overridable **extension point — deferred, not
  built now.**
- **Function scoping is feasible now** (confirmed in code): functions are already per-integration and
  `individually` packaged, so `materialized` per-function env/IAM is a wiring change (emit per-function
  env from the graph), not a bundling restructure.
- **Terminology:** the instance tier is **per-connection** (not "tenant").
- **Scope boundary:** **derive by default, annotate the edge cases** — tier-2 from module + graph,
  per-connection inherently distinct, everything else platform-global; app definition can override a
  variable's scope.
- **Precedence:** tiers are separate namespaces (most-specific wins: per-connection > app-module >
  platform); the routing map fixes **one backend per (tier, env)** so there's no in-tier collision by
  construction; genuine overlaps → provider/routing-map source wins, local overrides for local env,
  deploy validation **warns** (opt-in strict mode fails).

## Open questions (implementation detail, non-blocking)
- Exact **annotation syntax** for scope overrides in the app definition.
- Whether collision detection defaults to **warn** or **strict**.

## Related
- [ADR-028: Secrets & Config Provider Plugin](./028-secrets-config-provider-plugin.md)
- [ADR-029: Variable & Secret Management (Admin API / CLI / GUI)](./029-variable-secret-management.md)
- ADR-PLUGINS (provider/database/encryption plugin taxonomy), ADR-005 / ADR-010 (admin surface),
  field-level encryption registry (`packages/core/database/encryption/`).
