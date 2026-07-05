# Usage Store

The durable, Frigg-owned store behind ADR-011 feature-usage tracking. Holds
per-integration counters that the reporting endpoint reads for cross-integration
comparison and trend series.

Populated by the telemetry usage rollup and read via `frigg.usage.*` — see
[`telemetry/README.md`](../telemetry/README.md) for the full guide, config, and
usage examples. This README covers the store internals only.

## Fact row

`UsageCounter { integrationId, integrationType, metric, window, value, updatedAt }`,
uniquely keyed by `(integrationId, integrationType, metric, window)`. `window` is
`day:YYYY-MM-DD` or `hour:YYYY-MM-DDTHH` (UTC).

## Isolation (ADR-010 Decision 3)

The store is deliberately isolated from user/integration-scoped data:

- **No `userId`** and **no foreign key** to `Integration` — a user-scoped query
  can never return a usage row, and usage history survives integration deletion.
- **Not** in the encryption registry — dimensions are bounded and non-sensitive.

## Repository triad

Mirrors the reporting/process pattern — an interface plus PostgreSQL, MongoDB and
DocumentDB adapters selected by `DB_TYPE`:

```js
const { createUsageRepository } = require('@friggframework/core'); // usage-repository-factory

class UsageRepositoryInterface {
    async increment({ integrationId, integrationType, metric, window, value }) {} // atomic upsert
    async totals({ metric, groupBy, since, bucket }) {}   // comparison (one window granularity)
    async series({ metric, integrationType, from, to, bucket }) {} // trend (aggregated across instances)
}
```

- **`increment`** is atomic: PostgreSQL uses Prisma `upsert` with
  `{ value: { increment } }`; a concurrent first-insert race (`P2002`) retries
  once onto the atomic update path.
- **`totals`** filters to a single window granularity (default `day`) so day and
  hour rows are never double-summed. Requires a `metric`; `groupBy` is
  allow-listed to `integrationType` / `metric`.
- **`series`** aggregates across integration instances (`groupBy(window) + sum`)
  and range-filters on the window key. Requires an `integrationType`.

> **DocumentDB:** the adapter currently inherits the Mongo (Prisma) implementation
> and is **not yet verified** against a real DocumentDB cluster (every other
> DocumentDB adapter in this repo needed raw commands). Verify before relying on
> it in production.
