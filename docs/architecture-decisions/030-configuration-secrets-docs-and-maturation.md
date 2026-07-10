# ADR-030: Configuration & Secrets — Docs & Adopter Maturation

**Status**: Proposed
**Date**: 2026-07-10
**Deciders**: Sean Matthews

> Proposed. The enablement half of the Configuration & Secrets work (model = ADR-027, provider =
> ADR-028, management = ADR-029). Covers how we document it for adopters and how a Frigg app is
> expected to grow over time. The full cross-pattern worked example is a **post-implementation doc
> deliverable**; an illustrative target-state version is included below.

## Context

The model (ADR-027–029) is only useful if adopters can (a) find a **free, fast on-ramp**, (b)
understand **when to reach for which tier/provider**, and (c) **grow** without rework. Today the docs
describe a single flat env list; there is no maturation story and no guidance separating the four
concerns that get mashed together (infra, framework behavior, dev/feature flags, API-module app
credentials). Adopters therefore hit "env overload" with no documented path out.

## Decision

Ship a dedicated **"Configuration & Secrets" guide** in the Frigg docs, organized around a
maturation journey and a cross-pattern worked example.

### 1. The guide (pages / questions it must answer)
- **Mental model** — the tiers (platform / app-level module / per-connection) × {config, secret}, the
  two planes (management vs runtime), and the isolation invariant. *(from ADR-027)*
- **When to reach for which** — the decision rule (scope first, then sensitivity).
- **Per-environment setup** — how to set values per stage; the routing map. *(ADR-029)*
- **"Only what a function needs"** — scoping derived from the integration→module graph. *(ADR-027)*
- **On-demand vs env** — why per-connection creds are always on-demand. *(ADR-027)*
- **Choosing a provider** — AWS / GCP / Azure / 1Password / Vault / local, and materialized vs
  direct. *(ADR-028)*
- **Managing values** — the `frigg` CLI / admin API / GUI, and the routing map. *(ADR-029)*
- **Local development** — the local provider; zero-cloud `frigg start`. *(ADR-029)*
- **Migrating** — moving from a flat pipeline env to structured tiers without downtime.

### 2. The adopter maturation journey
Document the growth path explicitly (tied to ADR-027's L0–L3) — the headline is **"start with all
globals set manually in your pipeline; graduate to managed config as you scale."**

| Level | Trigger | What the adopter does | Where values live |
|---|---|---|---|
| **L0 — Manual (free/fast)** | Day one | Set global envs in the deploy pipeline (`appDefinition.environment`) | Pipeline → `process.env` (global) |
| **L1 — Platform secrets** | First real secret / rotation need | Move secrets to a provider store | Secrets Manager / SSM / provider |
| **L2 — Structured module creds** | **Env overload** (10+ modules × OAuth) | Move app-level module creds to the tier-2 store; scope per function | `ModuleCredential`/`ModuleConfig` (or provider) |
| **L3 — Managed / multi-provider** | Fleet / compliance / DX | Multi-provider (GCP/Azure/1Password/Vault), per-function least-privilege, GUI | Chosen provider(s) via the routing map |

Each level is **opt-in and backward-compatible** — no adopter pays for a tier they don't use, and L0
keeps working forever.

### 3. Cross-pattern worked example
Provide **the same env set shown across adopter patterns** so an adopter can locate themselves. This
is a **post-implementation deliverable** (the real doc lands once ADR-027–029 ship); the illustrative
target-state below captures intent.

**The shared env set:** `DATABASE_URL` (platform secret), `FEATURE_X` (platform/dev flag),
`HUBSPOT_CLIENT_ID` + `HUBSPOT_CLIENT_SECRET` (tier-2 app-level module cred), a HubSpot **access
token** (tier-3 per-connection).

| Value | A: Day-one (L0) | B: Growth (L2, AWS) | C: 1Password-unified | D: Multi-cloud (GCP) |
|---|---|---|---|---|
| `DATABASE_URL` | pipeline env → global | Secrets Manager → global env | 1Password → materialized → global env | GCP Secret Manager → global env |
| `FEATURE_X` | pipeline env → global | SSM → global env | 1Password → materialized | GCP Runtime Config → global |
| `HUBSPOT_CLIENT_ID/SECRET` | pipeline env → **all** functions | tier-2 store → **only** HubSpot functions | 1Password (tier-2) → HubSpot functions | GCP SM (tier-2) → HubSpot functions |
| HubSpot **access token** (per-conn.) | DB `Credential`, on demand | DB `Credential`, on demand | DB `Credential`, on demand | DB `Credential`, on demand |
| Routing map | — (all pipeline) | `{platform: aws, appModule: aws, perConnection: database}` | `{platform: 1password, appModule: 1password, perConnection: database}` | `{platform: gcp, appModule: gcp, perConnection: database}` |

Two things the example makes obvious: **per-connection creds stay in the DB across every provider
pattern above** (the isolation invariant holds regardless of which cloud/secret store backs tiers 1–2)
— note this is the provider axis; whether a connection is per-end-user or an admin-authored **global
entity** (ADR-024) is a separate adoption choice, and both still live in the DB — and **moving from
A→B→C is a routing-map + storage change, not an app-code change.**

## Consequences

### Positive
- Gives adopters a legible on-ramp and a growth path; directly addresses the env-overload wall.
- The worked example lets adopters self-locate and see that migration is config, not code.

### Negative
- Docs must track ADR-027–029 as they're implemented (drift risk until they ship).

### Neutral
- Establishes the maturation levels as the shared vocabulary for docs, CLI help, and onboarding.

## Alternatives Considered
- **Fold this guidance into ADR-027 as a section rather than its own ADR.** Rejected: the enablement/
  maturation story and the cross-pattern worked example are substantial and adopter-facing; a dedicated
  ADR keeps ADR-027 focused on the model and gives docs a single anchor to track.
- **Write the full cross-pattern worked example now.** Deferred: the faithful version depends on the
  shipped shapes of ADR-027–029, so an illustrative target-state table is included and the complete
  example is called out as a post-implementation deliverable.

## Related
- [ADR-027](./027-configuration-and-secrets-model.md) (model & maturation levels),
  [ADR-028](./028-secrets-config-provider-plugin.md) (providers),
  [ADR-029](./029-variable-secret-management.md) (management).
- [ADR-024: Global Entities](./024-global-entities.md) (per-connection vs global adoption choice).
- Frigg docs site (`docs/`) — target home for the guide.
