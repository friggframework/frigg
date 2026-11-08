# Telemetry

Vendor-neutral observability (traces + metrics) and durable per-integration
usage counters for `@friggframework/core`, built on OpenTelemetry. Shipped in
[#622](https://github.com/friggframework/frigg/pull/622); decision record
[ADR-011](../architecture-decisions/011-integration-telemetry-and-usage-tracking.md)
(Accepted).

How to turn exporters on: [Enable OpenTelemetry](../guides/enable-opentelemetry.md).
Log ↔ trace correlation: [Logging](../guides/LOGGING.md) and
[Logging in an Integration](../guides/LOGGING-IN-INTEGRATIONS.md).

> **Not shipped:** OTLP **log** export (OpenTelemetry JS logs SDK). Logs already
> carry `trace_id` / `span_id` / `trace_flags` when a span is active; that is
> correlation, not log export.

## Capabilities

1. **Observability** — spans + low-cardinality metrics across handlers, API
   modules, queues, and webhooks, exported to any OTLP backend (Honeycomb,
   Datadog, Grafana, an OTel Collector, …).
2. **Usage tracking** — durable per-integration counters (records synced,
   webhooks received, API requests, user actions, …) folded into a Frigg-owned
   store that reporting reads for cross-integration comparison.

Key properties:

- **Rides for free.** Framework seams are auto-instrumented.
- **No-op by default on deployed stages.** With exporter `none` / `noop`, the
  service emits nothing and loads **zero** OpenTelemetry modules.
- **Vendor-neutral.** Integration code never imports a backend SDK; swap
  exporters in the app definition.
- **Usage store ≠ APM.** Reports read the durable Frigg store, never an
  external APM.

## Configuration shape

```js
// backend/index.js — Definition.telemetry
telemetry: {
    exporter: {
        type: 'otlp', // none | noop | console | otlp | honeycomb | datadog
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        // headers: { … },
        // apiKey: process.env.HONEYCOMB_KEY, // honeycomb preset
    },
    sampleRatio: 1.0, // parent-based trace sampling (0..1), default 1
    northStar: {
        default: { name: 'records.synced' },
        // byType: { hubspot: { name: 'contacts_synced', deriveFrom: { … } } },
    },
    subscribers: [
        // { event: 'metric', handler: ({ name, value, attributes, context }) => { … } },
        // (telemetry) => telemetry.on('event', (payload) => { … }),
    ],
},
```

Resolved by `resolveTelemetryConfig` in
`packages/core/telemetry/telemetry-config.js`.

## Exporters

| `exporter.type` | Behavior |
| --- | --- |
| *(absent)* | **Default:** `console` when `STAGE=local`; `none` for every other stage (including `dev`). |
| `none` / `noop` | No-op adapter. Loads zero `@opentelemetry/*` modules. Event bus (usage rollup + plugins) still runs. |
| `console` | `ConsoleSpanExporter` + `ConsoleMetricExporter` (stdout). |
| `otlp` | OTLP/HTTP traces (`/v1/traces`) + metrics (`/v1/metrics`). Endpoint/headers from the descriptor, else SDK env fallbacks. |
| `honeycomb` | OTLP preset: endpoint defaults to `https://api.honeycomb.io`; `apiKey` sets `x-honeycomb-team`. |
| `datadog` | Same OTLP/HTTP builder as `otlp` (Datadog ingests OTLP natively). |

Invalid `type` values throw at config resolve. Pre-built
`traceExporter` / `metricExporter` instances on the descriptor bypass the type
map (tests / advanced adopters).

### Sampling (`sampleRatio`)

- Range `0..1`, default `1`.
- Fraction of **traces** exported (trace-ID-based + parent-based — a
  distributed trace is never half-kept).
- Does **not** thin durable **usage counters** (those ride the event bus).
- Not error-aware: a low ratio drops failed-run traces too. For "keep all
  errors, sample the rest," use tail-based sampling at an OTel Collector.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP backend URL. Referenced from `telemetry.exporter.endpoint`; SDK fallback when `url` is unset. Auto-passed through to Lambda when an OTLP-family exporter is configured. |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP headers (e.g. auth). Also auto-passed through to Lambda for OTLP-family exporters. |
| `OTEL_FLUSH_TIMEOUT_MS` | Max time the handler waits to flush telemetry before returning (default `500`). Bounds tail latency if the backend is unreachable. |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | Metric reader interval (default `60000`). |
| `STAGE` | `local` enables the `console` default when `exporter` is unset. |

> **VPC:** a Lambda in a private subnet needs a NAT gateway or VPC endpoint to
> reach an external OTLP backend. Without egress the exporter fails silently
> within `OTEL_FLUSH_TIMEOUT_MS`.

## Auto-instrumentation

No integration code required. Emissions carry bounded labels
`{integration_type, event, status, …}`; high-cardinality ids ride span baggage
/ the bus `context` only.

| Seam | Span | Metric |
| --- | --- | --- |
| Handler dispatch (`USER_ACTION` / `CRON` / `QUEUE` / `WEBHOOK` / lifecycle) | `frigg.handler.<type>` | `frigg.handler.invocations{integration_type, event, status}` |
| Outbound API-module request | `frigg.apimodule.request` | `frigg.apimodule.requests{module, method, status}` |

Request URLs are redacted (query string + userinfo stripped) before they touch
a span.

> **Usage-attribution boundary.** OTel metrics fire for every seam invocation.
> The durable **usage** rollup only counts emissions that carry an integration
> context (set by handler seams). API-module requests *before* an integration
> exists (OAuth/token exchange, entity discovery during connection setup) show
> up in traces but are not attributed to an `api.requests` usage counter.

## Custom metrics (integration code)

Every integration instance has `this.telemetry` (auto-tagged with its
`integration_type`):

```js
class HubSpotIntegration extends IntegrationBase {
    async deltaSync() {
        await this.telemetry.span('delta_sync', async () => {
            const batch = await this.hubspot.api.getContacts();

            // Declare 'records.synced' in Definition.usage to persist it:
            this.telemetry.count('records.synced', batch.length, {
                entity: 'contact',
            });

            this.telemetry.event('workflow_invoked', { workflow: 'lead_route' });
        });
    }
}
```

Port surface (duck-typed): `count`, `event`, `span`, `startSpan`,
`withContext`, `on`, `forceFlush`, `shutdown`, `isEnabled`,
`getActiveSpanContext` → `{ traceId, spanId, traceFlags } | null`.

## Usage counters (durable)

### Declare

```js
class HubSpotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        usage: {
            // Comparable across integration types (reporting):
            canonical: ['records.synced', 'webhooks.received', 'api.requests'],
            // Comparable only within this integration type:
            custom: {
                'deals.enriched': { unit: 'count', label: 'Deals enriched' },
            },
        },
    };
}
```

### Canonical vocabulary

Core-owned, versioned, **additive** (new keys may be added; existing keys are
not renamed or removed):

| Key | Source |
| --- | --- |
| `api.requests` | auto — every outbound API-module request |
| `user_actions` | auto — every `USER_ACTION` handler |
| `webhooks.received` | auto — the `ON_WEBHOOK` queue dispatch (per-integration, DB-connected) |
| `records.synced` | explicit — `this.telemetry.count('records.synced', n, { entity })` |
| `workflows.invoked` | explicit — `this.telemetry.count('workflows.invoked', 1, { workflow })` |

Only **declared** keys are persisted. Declaring a canonical key opts the
integration into the comparison report.

### Read (`frigg.usage.*`)

Via `createFriggCommands` — reads the durable store, never an APM:

```js
const { createFriggCommands } = require('@friggframework/core');
const frigg = createFriggCommands({ integrationClass: HubSpotIntegration });

await frigg.usage.getTotalsByDimension({
    metric: 'records.synced',
    groupBy: 'integrationType', // or 'metric'
    since: daysAgo(30),
    bucket: 'day', // 'day' (default) | 'hour'
});

await frigg.usage.getTimeSeries({
    metric: 'records.synced',
    integrationType: 'hubspot',
    from: daysAgo(7),
    to: new Date(),
    bucket: 'day',
});

await frigg.usage.recordUsageCounter({
    integrationId: 'int_1',
    integrationType: 'hubspot',
    metric: 'deals.enriched',
    value: 3,
    at: new Date(),
});
```

Reporting surfaces these as additive `usage` columns on each `byType` bucket.

## North Star

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
                deriveFrom: {
                    apiRequest: { endpoint: '/contacts', method: 'POST' },
                },
                // or: deriveFrom: { userAction: { action: 'route_lead' } }
            },
        },
    },
},
```

`byType` wins over `default` per integration type.

```js
await frigg.usage.getNorthStarTotals({
    northStar: definition.telemetry.northStar,
    integrationType: 'hubspot',
    since: daysAgo(30),
});
// → { metric: 'contacts_synced', totals: […] }
// → null when northStar is absent or has no entry for the type
```

The North Star config is a **call argument** — nothing telemetry-specific is
threaded through `createFriggCommands`. Omit it and `getNorthStarTotals()`
returns `null`. You can also read the underlying key with
`getTotalsByDimension` / `getTimeSeries`.

## Plugin / extension tap

Telemetry flows onto an internal event stream independent of OTel export (taps
fire even with `exporter: none`).

**Declarative** (app definition) — wired once per cold start; each subscriber
is guarded so a bad handler cannot break emission or siblings:

```js
telemetry: {
    subscribers: [
        {
            event: 'metric', // optional; omit to receive both metric and event
            handler: ({ name, value, attributes, context }) => {
                forwardToStatsd(name, value, attributes);
            },
        },
        (telemetry) =>
            telemetry.on('event', (payload) => auditSink.write(payload)),
    ],
},
```

**Imperative:**

```js
const { getTelemetry } = require('@friggframework/core');

const off = getTelemetry().on(
    'metric',
    ({ name, value, attributes, context }) => {
        // attributes = bounded labels; context = high-cardinality ids
    }
);
// off() to unsubscribe
```

Stable bus payload shapes:

- `'metric'`: `{ name, value, attributes, context? }`
- `'event'`: `{ name, attributes, context? }`

## Cardinality rule

High-cardinality identifiers (`integrationId`, `userId`, request `url`, action
names) ride **span baggage / the bus `context`** — never OTel **metric**
labels. Metric labels stay bounded (`integration_type`, `event`, `status`,
`method`, `module`). The usage rollup derives per-integration counts from the
bus context, not from metric labels.

## Runtime path

```
this.telemetry.count / auto-instrumented seam
        │  (bounded metric labels → OTel; ids → bus context via AsyncLocalStorage)
        ├──────────────► OTel exporter (traces + metrics)
        └──────────────► TelemetryEventBus ('metric' / 'event')
                              │
                              ├─ UsageRollupSubscriber — buffers per invocation,
                              │     flushes to UsageCounter on handler exit
                              │     (discards on SQS redelivery — approximate)
                              └─ plugin taps

frigg.usage.* ◄── UsageCounter store ──► reporting usage columns
```

- **Flush is Lambda-safe:** the handler awaits a bounded `forceFlush` in a
  `finally` (background timers cannot fire once the container freezes).
- **Usage accuracy is approximate:** at-least-once delivery can double-count on
  retry. The invocation buffer is discarded only when the **whole** SQS batch
  is a redelivery (`ApproximateReceiveCount > 1`); a mixed batch flushes so a
  redelivered sibling never drops a fresh record's counts.

## Caveats / current limitations

- **Usage persistence requires a DB-connected handler.** DB-free handlers (for
  example the raw webhook-receipt route) cannot write; `webhooks.received` is
  counted at the DB-connected `ON_WEBHOOK` queue dispatch instead.
- **DocumentDB** uses a raw-command adapter (`$runCommandRaw`) for increment and
  aggregate; command shapes are unit-tested but not yet run against a real
  cluster.
- **Retention:** the `UsageCounter` table has no pruning yet — hour-grain rows
  accumulate. Add a scheduled prune for high-volume deployments. Read paths use
  composite indexes `(metric, window)` and
  `(metric, integrationType, window)`.
- Metric `value` is a `BigInt` per
  `(integrationId, integrationType, metric, window)` row; reads coerce the sum
  to a JS Number (safe below 2^53).
- **No OTLP log export.** Correlation ids on structured logs are the supported
  bridge to traces today.

## See also

- [Enable OpenTelemetry](../guides/enable-opentelemetry.md) (how-to)
- [Logging](../guides/LOGGING.md) ·
  [Logging in an Integration](../guides/LOGGING-IN-INTEGRATIONS.md)
- [ADR-011](../architecture-decisions/011-integration-telemetry-and-usage-tracking.md)
- Package README (canonical implementation notes):
  `packages/core/telemetry/README.md`
