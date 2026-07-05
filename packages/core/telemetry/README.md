# Frigg Telemetry & Usage Tracking

Vendor-neutral observability (traces + metrics) and durable, per-integration
feature-usage counters for `@friggframework/core`, built on OpenTelemetry.
Implements [ADR-011](../../../docs/architecture-decisions/011-integration-telemetry-and-usage-tracking.md).

## Overview

Two capabilities ride the same primitive:

1. **Observability** — spans + low-cardinality metrics across handlers, API
   modules, queues and webhooks, per integration, exported to any OTLP backend
   (Honeycomb, Datadog, Grafana, an OTel Collector, …).
2. **Usage tracking** — durable per-integration counters (records synced,
   webhooks received, API requests, user actions, …) folded into a Frigg-owned
   store that the reporting endpoint reads for apples-to-apples comparison.

### Key properties

- **Rides for free.** Framework seams are auto-instrumented — integrations get
  handler/API-module/webhook metrics with zero code.
- **No-op by default.** With no exporter configured the service emits nothing and
  loads **zero** OpenTelemetry modules — no cold-start cost. Integration code can
  always call `this.telemetry.*`.
- **Vendor-neutral.** Integration code never imports a backend SDK. Swap exporters
  in the app definition.
- **Usage store ≠ APM.** Reports read the durable Frigg store, never an external
  APM.

## Configuration (app definition)

```js
// backend/index.js
const Definition = {
    name: 'my-app',
    integrations: [HubSpotIntegration, SalesforceIntegration],

    telemetry: {
        // none | console | otlp | honeycomb | datadog
        exporter: {
            type: 'otlp',
            endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            // headers: { 'x-honeycomb-team': process.env.HONEYCOMB_KEY }, // or use type:'honeycomb' + apiKey
        },
        sampleRatio: 1.0, // parent-based trace sampling (0..1)
        northStar: {
            default: { name: 'records.synced' },
        },
    },
};
```

**Exporter default (no `telemetry.exporter` set):** `console` only when
`STAGE=local` (a genuinely local run); every deployed stage — including `dev` —
defaults to `none` (no per-event cost, no data written to CloudWatch). Point
`exporter` at an OTLP backend to turn export on.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP backend URL (referenced from `telemetry.exporter.endpoint`). Auto-passed through to Lambda when an OTLP-family exporter is configured. |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP headers (e.g. auth). |
| `OTEL_FLUSH_TIMEOUT_MS` | Max time the handler waits to flush telemetry before returning (default `500`). Bounds tail latency if the backend is unreachable. |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | Metric reader interval (default `60000`). |
| `STAGE` | `local` enables the `console` default. |

> **VPC note:** a Lambda in a private subnet needs a NAT gateway or VPC endpoint
> to reach an external OTLP backend. Without egress the exporter fails silently
> within `OTEL_FLUSH_TIMEOUT_MS`.

## What you get for free (auto-instrumentation)

No integration code required — every emission carries `{integration_type, event,
status, ...}` bounded labels, with high-cardinality ids on span baggage / the bus
context only.

| Seam | Span | Metric |
| --- | --- | --- |
| Handler dispatch (USER_ACTION / CRON / QUEUE / WEBHOOK / lifecycle) | `frigg.handler.<type>` | `frigg.handler.invocations{integration_type, event, status}` |
| Outbound API-module request | `frigg.apimodule.request` | `frigg.apimodule.requests{module, method, status}` |

Request URLs are redacted (query string + userinfo stripped) before they touch a
span, so credentials in query params never leak.

## Custom metrics (integration code)

Every integration instance carries `this.telemetry` (auto-tagged with its
`integration_type`):

```js
class HubSpotIntegration extends IntegrationBase {
    async deltaSync() {
        // A span wraps the operation (nested under the handler span):
        await this.telemetry.span('delta_sync', async () => {
            const batch = await this.hubspot.api.getContacts();

            // A counter — declare 'records.synced' in Definition.usage to persist it:
            this.telemetry.count('records.synced', batch.length, {
                entity: 'contact',
            });

            // A one-off event (attached to the active span):
            this.telemetry.event('workflow_invoked', { workflow: 'lead_route' });
        });
    }
}
```

## Usage counters (durable, comparable)

### 1. Declare which counters an integration reports

```js
class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        usage: {
            // Canonical keys → comparable ACROSS integration types (reporting):
            canonical: ['records.synced', 'webhooks.received', 'api.requests'],
            // Custom keys → comparable only WITHIN this integration type:
            custom: { 'deals.enriched': { unit: 'count', label: 'Deals enriched' } },
        },
    };
}
```

**Canonical vocabulary** (core-owned, versioned):

| Key | Source |
| --- | --- |
| `api.requests` | auto — every outbound API-module request |
| `user_actions` | auto — every `USER_ACTION` handler |
| `webhooks.received` | auto — the `ON_WEBHOOK` queue dispatch (per-integration, DB-connected) |
| `records.synced` | explicit — `this.telemetry.count('records.synced', n, { entity })` |
| `workflows.invoked` | explicit — `this.telemetry.count('workflows.invoked', 1, { workflow })` |

Only **declared** keys are persisted. Declaring a canonical key opts the
integration into the comparison report.

### 2. Read the usage store

`frigg.usage.*` (via `createFriggCommands`) reads the durable store — never an APM:

```js
const { createFriggCommands } = require('@friggframework/core');
const frigg = createFriggCommands({ integrationClass: HubSpotIntegration });

// Apples-to-apples comparison across integration types:
await frigg.usage.totals({
    metric: 'records.synced',
    groupBy: 'integrationType', // or 'metric'
    since: daysAgo(30),
    bucket: 'day', // 'day' (default) | 'hour'
});
// → [{ integrationType: 'hubspot', value: 4200 }, { integrationType: 'salesforce', value: 1180 }]

// Trend series for one type (aggregated across its instances):
await frigg.usage.series({
    metric: 'records.synced',
    integrationType: 'hubspot',
    from: daysAgo(7),
    to: new Date(),
    bucket: 'day',
});
// → [{ bucket: 'day:2026-07-04', value: 610 }, { bucket: 'day:2026-07-05', value: 720 }]

// Manual write (day + hour windows derived from `at`):
await frigg.usage.recordUsageCounter({
    integrationId: 'int_1',
    integrationType: 'hubspot',
    metric: 'deals.enriched',
    value: 3,
    at: new Date(),
});
```

The [reporting endpoint](../reporting/README.md) surfaces these as additive
`usage` columns on each `byType` bucket.

## North Star metric

Declare an adopter North Star that reports/snapshots read as a first-class
counter — populated by direct emission, or derived from a trace signal with no
integration code:

```js
telemetry: {
    northStar: {
        default: { name: 'records.synced' },
        byType: {
            hubspot: {
                name: 'contacts_synced',
                // derive from an auto-emitted signal:
                deriveFrom: { apiRequest: { endpoint: '/contacts', method: 'POST' } },
                // or: deriveFrom: { userAction: { action: 'route_lead' } }
            },
        },
    },
}
```

Read it like any counter: `frigg.usage.totals({ metric: 'contacts_synced' })`.

## Plugin / extension tap

Telemetry flows onto an internal event stream. Subscribe to forward to a custom
sink or compute aggregates:

```js
const { getTelemetry } = require('@friggframework/core');

const off = getTelemetry().on('metric', ({ name, value, attributes, context }) => {
    // `attributes` = bounded metric labels; `context` = high-cardinality ids
    // (integrationId, integrationType, userId, url, …). Never throws upstream.
});
// off() to unsubscribe
```

> The bus payload shape (`{ name, value, attributes, context? }` for `'metric'`,
> `{ name, attributes, context? }` for `'event'`) is a stable contract.

## Cardinality rule

High-cardinality identifiers (`integrationId`, `userId`, request `url`, action
names) ride **span baggage / the bus `context`** — never OTel **metric** labels.
Metric labels stay bounded (`integration_type`, `event`, `status`, `method`,
`module`). The usage rollup derives per-integration counts from the bus context,
not from metric labels.

## How it works

```
this.telemetry.count / auto-instrumented seam
        │  (bounded metric labels → OTel; ids → bus context via AsyncLocalStorage)
        ├──────────────► OTel exporter (traces + metrics)   [observability]
        └──────────────► TelemetryEventBus ('metric'/'event')
                              │
                              ├─ UsageRollupSubscriber ── buffers per invocation,
                              │     flushes to the UsageCounter store on handler exit
                              │     (discards on SQS redelivery — approximate contract)
                              └─ your plugin taps

frigg.usage.totals / series ◄── UsageCounter store ──► reporting usage columns
```

- **Flush is Lambda-safe:** `create-handler` awaits a bounded `forceFlush` in a
  `finally` (background timers can't fire once the container freezes).
- **Usage accuracy is approximate:** at-least-once delivery means a retried
  handler could double-count; obvious SQS redeliveries (`ApproximateReceiveCount
  > 1`) are discarded.

## Caveats / current limitations

- **Usage persistence requires a DB-connected handler.** DB-free handlers (e.g.
  the raw webhook-receipt route) can't write; `webhooks.received` is counted at
  the DB-connected `ON_WEBHOOK` queue dispatch instead.
- **DocumentDB** usage adapter inherits the Mongo (Prisma) implementation and is
  not yet verified against a real cluster.
- **Retention:** the `UsageCounter` table has no pruning yet — hour-grain rows
  accumulate. Add a scheduled prune for high-volume deployments.
- Metric `value` is a 32-bit int per `(integrationId, metric, window)` row.

## See also

- Architecture: [ADR-011](../../../docs/architecture-decisions/011-integration-telemetry-and-usage-tracking.md)
- Reporting hand-off: [`reporting/README.md`](../reporting/README.md)
- Encryption (same repository-triad pattern): [`database/encryption/README.md`](../database/encryption/README.md)
