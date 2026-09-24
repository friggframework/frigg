# ADR-030: Integration Versioning

**Status**: Proposed (exploratory: decision deliberately deferred pending research)
**Date**: 2026-09-27
**Deciders**: Sean Matthews, Daniel Klotz

## Context

"Migration" and "versioning" are related but distinct. [ADR-013](./013-integration-version-migrations.md) proposes how to *transform* persisted integration records between versions, but explicitly defers the underlying **version contract**: how versions are declared, compared, gated, and made backward or forward compatible. This ADR opens that contract.

### Current state (grep-verified in `next`)

- `IntegrationBase.Definition.version` defaults to `'0.0.0'`. Comment reads "used for migration and storage purposes, as well as display."
- `IntegrationBase.Definition.supportedVersions = []`. Comment reads "Eventually usable for deprecation and future test version purposes." No code reads it today.
- `static getCurrentVersion()` returns `Definition.version`.
- On `createIntegration`, the string is stored in the `Integration.version` column (nullable `String?` in the Postgres and Mongo schemas).
- On subsequent reads, `record.version` is passed through `map-integration-dto.js` for display and preserved in every Mongo repository write. **No code path in `next` gates behavior on the value.** No routing keys on it. No handler differs by it. It is a label.

### What versioning management would mean

For Frigg to support integration versions as more than a label, the framework needs answers to four coupled questions:

| Dimension | Question |
|---|---|
| **Declaration** | How does an author create v2 of an integration that has records at v1 in the wild? |
| **Routing** | When a runtime event (webhook, cron, user action) arrives for record R at version V, which code runs it? |
| **Storage** | How is the version stamped on records, config, entities, credentials, and mappings? What survives a version change? |
| **Compatibility** | What guarantees does a version make about the versions before and after it? What is a "breaking" change? |

These are not independent. A declaration model constrains the routing model; a storage model constrains what a migration ([ADR-013](./013-integration-version-migrations.md)) can transform.

## Decision

This ADR **commits to reasoning about** the four dimensions above as one coupled design space, and lays out the paths that have been explored so far with their tradeoffs, serverless-specific concerns, and edge cases. It **explicitly does not** land a decision on which path to take. Landing that decision is a follow-up step gated on the exploration below plus (per Sean) more research on global routing behavior in serverless environments.

Concretely, this ADR:

1. Enumerates the design space as four dimensions.
2. Presents four explored paths that cover the space.
3. Catalogs the serverless-specific concerns that any chosen path must handle.
4. Lists the edge cases that a naive path would break on.
5. Leaves the final path selection to a follow-up ADR (or a revision of this one) once the open questions below are resolved.

## Design space

### Path A: Bump-in-place with migration on read

Author bumps `Definition.version` on the same class. Existing records at the prior version are transformed by an [ADR-013](./013-integration-version-migrations.md) migration on read (or on next event), then stamped with the new version. There is only one class per integration type at any time.

| Aspect | Details |
|---|---|
| Declaration | Increment `Definition.version` string in the same file. Optionally add the old version to `supportedVersions` for a compatibility window. |
| Routing | No routing decision. One class runs everything. |
| Storage | `record.version` stamps the record; a migration writes the new value after transforming. |
| Compatibility | Semver interpreted at the migration layer. `patch` = no migration needed. `minor` = additive, backward-compatible fields. `major` = mandatory migration. |

**Tradeoffs**

- Simple. No dispatch machinery. One code path per integration type at any time.
- Requires reliable migration for every version bump. If migration is slow or expensive, the first event after deploy pays that cost.
- Rollback is only possible if the migration is bidirectional. Prisma-style up-only migrations trap adopters at the newest version.
- The class file is a single mutating surface. Blaming ("what did v1 do?") requires git archaeology.

**Serverless concerns unique to this path**

- Migration on read must be idempotent under concurrent reads (two Lambdas may attempt to transform the same record simultaneously).
- Cold-start Lambdas pay the migration cost. Provisioned concurrency does not help because the migration runs on the record, not on the module.
- In-flight jobs enqueued before the deploy may run against a stale record shape.

### Path B: Side-by-side classes with per-version routing

Author ships `MyIntegrationV2` as a separately-registered class. Both `MyIntegrationV1` and `MyIntegrationV2` coexist in the app. New records go to V2; existing records stay on V1 until explicitly migrated. A record's version determines which class dispatches events for it.

| Aspect | Details |
|---|---|
| Declaration | New class file. Same module dependencies (or different, if the modules changed). Registered separately in `appDefinition.integrations`. |
| Routing | Dispatcher reads `record.version` and instantiates the class registered against that version tuple. |
| Storage | `record.version` and optionally `record.classRef` (or a `(type, version)` composite key). |
| Compatibility | Explicit: each class version is its own compatibility island. Migration ([ADR-013](./013-integration-version-migrations.md)) moves records between islands. |

**Tradeoffs**

- Clean blame. V1 code stays in the V1 file until deprecated.
- Rollback of V2 is trivial. Records at V2 either migrate back or continue on V2 while newly-registered records go to V1 again.
- Class registry gets busier over time. An integration type at V4 has four classes registered.
- Adopters must decide when to sunset old versions and force migration.

**Serverless concerns unique to this path**

- Lambda handler must include both classes' code. Bundle size grows with version count.
- Alternatively, per-version Lambda functions (one Lambda per class version). Solves bundle size, adds deploy-time coordination and cold-start-per-version.
- API Gateway routing: single stage with per-version dispatch inside the handler, or per-version stages? See [Serverless concerns](#serverless-specific-concerns) below.

### Path C: Version selector on `appDefinition`

Author registers the same class multiple times with different versions and configuration overrides. The `appDefinition` declares which versions are available and which is the default for new integrations.

```javascript
integrations: [
    {
        Definition: MyIntegration,
        versions: {
            '1.0.0': { configSchema: v1ConfigSchema },
            '2.0.0': { configSchema: v2ConfigSchema, default: true },
        },
    },
]
```

| Aspect | Details |
|---|---|
| Declaration | Version metadata declared in the app definition, not the class. Class code is version-aware (branches on `this.version`) or a set of version-scoped mixins. |
| Routing | Same as Path B (dispatcher reads `record.version`). |
| Storage | Same as Path B. |
| Compatibility | Declared explicitly in the app definition; the framework can validate. |

**Tradeoffs**

- Version policy is centralized in one file. Easy to audit which versions are supported.
- Class code becomes version-aware. Every method may need `if (this.version === '1.0.0')` branches. Readability suffers as versions accumulate.
- Adopters can offer beta versions to a subset of users by declaring them without `default: true`.
- Migration ([ADR-013](./013-integration-version-migrations.md)) still needed for records moving between versions.

### Path D: Version as a routing dimension outside the class

The class does not carry a version. Version is a header or path segment resolved by the framework before dispatch. Migration transforms the record's *shape* separately from any class change. Similar to API Gateway stage-based versioning.

| Aspect | Details |
|---|---|
| Declaration | The framework registers version-aware routes. Class authors do not think about versioning until an incompatibility forces the class to branch (Path A) or split (Path B). |
| Routing | HTTP: `/api/{integration}/v2/*` or `Accept-Version: 2.0.0` header. SQS / EventBridge: message envelope carries version. |
| Storage | `record.version` stamps the record but is derived from the last successful dispatch. |
| Compatibility | Framework-enforced compatibility ranges (min/max supported version per handler). |

**Tradeoffs**

- Cleanest separation of routing from code. Version is infrastructure, not integration logic.
- Requires framework work to enforce version-aware routing across HTTP, SQS, EventBridge, and adopter-app calls.
- Webhook receivers with signed URLs (see [Serverless concerns](#serverless-specific-concerns)) do not carry an `Accept-Version` header; version must be encoded in the URL path or in the payload.
- Third-party integration providers control the webhook URL they call. Once registered, changing that URL requires a re-registration flow.

## Serverless-specific concerns

Any chosen path must handle the following. These are the reason this ADR is explicit that global routing needs more research.

### Lambda module-scope caching

Lambda caches module-level state across invocations on a warm instance. A `Definition.version` read at module-scope is snapshot at deploy time. Path A cannot hot-swap versions without a full deploy. Path B and C avoid this because dispatch is per-invocation.

### Global routing

If Frigg apps are fronted by CloudFront or an equivalent CDN, version-aware routing can happen at the edge (Path D) or at the origin. Each has cost:

- **Edge routing** (CloudFront Functions, Lambda@Edge). Fast, but per-request compute cost multiplies across the fleet. Cannot read the DB, so version must be encoded in the URL or a header.
- **Origin routing** (API Gateway stage or per-version Lambda). Simpler, but the DB lookup to resolve `record.version` happens on every request. Cold-start pays the lookup cost.

### Signed webhook URLs

Third-party providers commonly sign the full URL as part of the payload signature (HubSpot v3, Stripe, Slack Events API). Changing the URL when versioning breaks signature verification until the provider is re-registered.

- Path B with per-version URL paths (`/api/hubspot-v2-integration/webhooks`) requires re-registration of every existing HubSpot webhook when v2 ships. For adopters with hundreds of installed instances, this is a fleet operation.
- Path D with `Accept-Version` headers avoids this if the version is derived at the origin from the payload, not the URL. But not all providers send an `Accept-Version` header.

### In-flight jobs

SQS messages enqueued at time T reference a record that may be at v1. At time T+ε the record is migrated to v2. The worker consuming the message must:

- Detect the version drift.
- Either migrate the message payload on read, reject to DLQ, or dispatch to the v1 handler.

Path A must handle this at every worker. Paths B, C, D can dispatch by the payload's declared version.

### EventBridge Scheduler entries

[Scheduled jobs](../guides/scheduled-jobs.md) target integration IDs (see `packages/core/scheduler-commands.js`). A scheduled job set at v1-time fires at v2-time. Same drift issue as SQS; same handling options.

### Rollback semantics

- Path A: rollback requires a down-migration. Not all transformations are reversible.
- Path B: rollback re-points new records at the older class. Records already at V2 either migrate back or stay.
- Path C: rollback is a config change (flip `default: true` back to the prior version).
- Path D: rollback re-routes traffic. Records at V2 stay stamped V2 until re-migrated.

### Encryption schema

`packages/core/database/encryption/encryption-schema-registry.js` declares which fields are encrypted per model. If v2 introduces new sensitive fields (or removes them), the registry must handle both versions during the compatibility window.

### Deploy-time coordination

- ADR-012 covers DB schema migrations. If a v2 introduces a new required column on `Integration`, the schema migration must land before v2 code deploys.
- ADR-013 covers record migrations. If v2 requires a data transformation, the migration must be executable at deploy time (blocking) or after (best-effort).
- This ADR must define whether integration version bumps are gated on either.

## Edge cases catalog

Enumerated to make the failure modes concrete. Any chosen path must handle each or explicitly deprioritize it.

1. **Mixed-version fleets.** Adopter's app has 10,000 integrations. 60% are still at v1 during a rolling migration. Any query that iterates integrations sees a mixed set.
2. **Third-party API changes force the version bump.** Adopter cannot delay migration because the third-party API deprecated the endpoint their v1 uses.
3. **Adopter apps calling old endpoints.** External systems calling `/api/hubspot-integration/*` don't know about v2. Compatibility window is required.
4. **Webhook subscriptions registered against v1 URLs.** As above; requires re-registration when the URL changes.
5. **Credential shape change.** OAuth flow changes between v1 and v2. Credentials from v1 do not decode against v2's schema.
6. **Mapping schema change.** `IntegrationMapping` records at v1 use one shape; v2 uses another. Migration must transform.
7. **Config shape change.** `Integration.config` is `Json?`. Adopters may be reading fields directly. Version-aware code must know which shape applies.
8. **Beta versions.** Adopter wants to run v2 for 5% of users while v1 continues. Requires per-user version selection.
9. **Multi-tenant version pinning.** Enterprise adopter A wants to stay on v1 for compliance. Adopter B wants v2. Same Frigg app.
10. **Framework version ships breaking change.** `@friggframework/core` v3 changes `IntegrationBase`. Integration versions across all adopters need re-baselining.
11. **Rollback after partial migration.** Migration ran on 40% of records, then failed. Half the fleet is at v2, half at v1, and the code is now v1.
12. **Cross-integration references.** Integration A's config references Integration B by ID. B migrates to v2 in a way A doesn't understand.

## Consequences

### Positive

- Enumerates the design space so subsequent decisions are made against a stated set of tradeoffs rather than intuition.
- Surfaces the coupling between routing, storage, and migration that a narrower ADR would miss.
- Documents serverless-specific constraints so any implementation ADR has to address them explicitly.

### Negative

- No decision landed. Every implementation ADR that references this must either accept the deferral or force a decision.
- Length. This ADR is longer than the register's norm because it is exploratory.

### Neutral

- Introduces vocabulary (Path A / B / C / D) that subsequent ADRs and PR discussions can reference.

## Alternatives considered

- **Land a decision now.** Rejected. Sean's call: this needs more research on global routing behavior in serverless environments before any of Paths A–D can be selected with confidence. Landing prematurely will produce the same "shipped on intuition" failure ADR-EVALS was designed to prevent.
- **Punt to per-adopter.** Rejected. Each adopter would build a slightly different version story, and ADR-013's migration runner needs a shared version contract to key off.
- **Fold this into ADR-013.** Rejected in ADR-013 itself. Migration and versioning are distinct concerns with distinct lifecycles.

## Open questions

1. **Which path?** The path selection is the primary open question. Suggested criteria: which path minimizes the fleet-operation cost of a version bump? Which path handles signed webhook URLs without re-registration? Which path is compatible with the shipped `Integration Router v2` (ADR-006)?
2. **Where does the version live?** Class file, appDefinition, framework registry, or split?
3. **Semver semantics.** What counts as `patch`, `minor`, `major` for an integration? Does the framework enforce, or is it convention?
4. **`supportedVersions` behavior.** Currently declared but unread. Should this be authoritative at dispatch time, or advisory?
5. **Cross-integration version references.** How does an integration declare that it depends on another integration being at a compatible version?
6. **Beta / canary versions.** Should the framework support running two versions concurrently for a subset of users, or is that an adopter concern?
7. **Framework-side version.** Does `@friggframework/core` version interact with `Definition.version`? A `core@3.0.0` upgrade that changes `IntegrationBase` semantics could force a rebaseline across every integration.
8. **Fleet coordination.** For multi-instance Frigg deployments (per-tenant Lambdas), how are version bumps sequenced?

## Research follow-ups

Explicit follow-ups Sean called out for further investigation before landing a decision:

- Global routing behavior in serverless environments. CloudFront Functions vs Lambda@Edge vs API Gateway stages vs origin dispatch. Cost, latency, cold-start impact per option.
- Signed-webhook-URL survival across URL-changing versioning schemes. Concrete provider survey (HubSpot v3, Stripe, Slack, Salesforce Streaming, Frontify) of which sign URLs vs headers vs payloads.
- Lambda alias + weighted traffic shifting as a native rollout mechanism. Does it map cleanly onto integration versioning, or is it orthogonal?
- Industry examples: how do Zapier, Merge.dev, Paragon, and similar platforms handle integration versioning behind the scenes? What did they choose, and what did they regret?

## Related

- [ADR-006: Integration Router v2](./006-integration-router-v2.md): current routing surface any versioning scheme must integrate with.
- [ADR-012: Database Schema Migrations](./012-database-schema-migrations.md): schema evolution, distinct from record versioning.
- [ADR-013: Integration Version Migrations](./013-integration-version-migrations.md): record transformation between versions. This ADR provides the version contract ADR-013 keys off.
- [ADR-004: Project Structure Migration Tool](./004-migration-tool-design.md): project-scaffold migration; distinct from all of the above.
- Implementation surface: `packages/core/integrations/integration-base.js` (`Definition.version`, `supportedVersions`, `getCurrentVersion`), `packages/core/prisma-postgresql/schema.prisma` (`Integration.version`), `packages/core/integrations/repositories/integration-repository-*.js`.
