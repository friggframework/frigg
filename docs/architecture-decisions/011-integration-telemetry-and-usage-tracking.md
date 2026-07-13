# ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking

**Status**: Accepted
**Date**: 2026-07-03
**Deciders**: Sean Matthews, Daniel Klotz

## Context

ADR-010 (Reporting as an Admin Operation) found that core exposes only *structural*
cross-integration generics — status, type, version, module/error/mapping counts, timestamps,
credential-refresh. It has **no feature-level usage tracking**: records synced, webhooks received,
workflows invoked, messages used, user actions taken. More broadly, Frigg has no first-class
observability layer — an operator running a fleet of per-tenant instances cannot see what
integrations are doing without bespoke logging, and there is no standard, vendor-neutral way to
emit traces/metrics/events or to tap into them.

Two needs converge on one substrate:

1. **Observability** — traces and logs across handlers, queues, API modules, per integration, for
   debugging and fleet health.
2. **Product/usage analytics** — durable per-integration counters that feed ADR-010's
   cross-integration comparison report and snapshot trends, plus an adopter-defined North Star.

Both should ride on the same primitive, emit useful signal *for free*, and be extensible by the
same plugin/extension model Frigg already uses.

## Decision

Adopt **OpenTelemetry (OTel)** as the vendor-neutral telemetry substrate (traces, metrics,
logs/events), wrapped by a core telemetry/logger abstraction, with auto-instrumentation at
framework seams, dev-defined custom metrics, an adopter North Star, and a plugin/extension tap that
feeds a durable usage store for reporting.

1. **One abstraction, vendor-neutral.** A core `TelemetryService` (working name) wraps the OTel
   SDK; integration code never imports a backend SDK. The exporter is configured in the app
   definition (OTLP → the adopter's backend: Honeycomb / Datadog / CloudWatch / etc.); the default
   is no-op/console so telemetry rides for free in dev and adds nothing mandatory.

   ```js
   // core wraps the OTel SDK; integrations use this, never a vendor SDK
   const telemetry = createTelemetry({
     exporter: appDefinition.telemetry?.exporter ?? { type: 'none' }, // no-op default
     resource: { service: appName, stage },
   });
   // injected onto each integration instance as this.telemetry
   ```

2. **Auto-instrumentation that rides for free.** Framework seams emit spans + low-cardinality
   counters with no developer effort:
   - **Instantiation** — every integration instance opens a context carrying standard identifiers
     (integrationId, integrationType, userId, version, stage, appName), logged once and propagated.
   - **Handlers** — each `USER_ACTION` / `CRON` / `QUEUE` / `WEBHOOK` invocation → a span +
     `frigg.handler.invocations{integration_type, event}`.
   - **API modules** — each outbound request from an Api class → a span +
     `frigg.apimodule.requests{module, endpoint, status}`.
   - **Queue / webhook / sync** — messages processed, webhooks received, sync runs — emitted from
     the `Worker`/queue and webhook seams.
   These yield ADR-010's usage counters as a byproduct of normal execution — zero per-integration
   code.

   ```js
   // framework wraps every handler dispatch — devs write no telemetry for this
   async function dispatch(event, handler, ctx) {
     return telemetry.span(`handler.${event.type}`, async (span) => {
       span.setAttributes(ctx.identifiers);              // integrationId, integrationType, userId, version
       telemetry.count('frigg.handler.invocations', 1, {
         integration_type: ctx.integrationType, event: event.type });
       return handler(event);
     });
   }
   ```

3. **Standard context / baggage.** The identifier set from instantiation rides every emission as
   resource attributes / baggage, so all telemetry is sliceable by integration, type, and tenant.

4. **Dev-defined custom metrics.** Integration developers emit through the same abstraction —
   same context, same exporters, no vendor lock-in:
   ```js
   this.telemetry.count('records_synced', batch.length, { entity: 'contact' });
   this.telemetry.event('workflow_invoked', { workflow: 'lead_route' });
   await this.telemetry.span('delta_sync', async () => { /* ... */ });
   ```

5. **Adopter North Star metric.** An adopter declares, at base or in config, a north-star metric
   for integrations (or for a given integration type), populated either way:
   - **(a) Derived from default traces** — config maps the north star to an auto-emitted signal:
     "every request to endpoint X," "every use of message Y," "every `USER_ACTION` Z counts."
     Config-only, no code.
   - **(b) Directly emitted** in integration code via `this.telemetry.*`.

   Either way it is surfaced through the telemetry/logger service as a first-class metric that
   reports and snapshots can read.
   ```js
   // app definition
   telemetry: {
     exporter: { type: 'otlp', endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT },
     northStar: {
       default: { name: 'records_synced' },
       byType: {
         crm: { name: 'contacts_synced',
                deriveFrom: { apiRequest: { endpoint: '/contacts', method: 'POST' } } },
       },
     },
   }
   ```

6. **Eventing + plugin/extension taps.** Telemetry also flows onto an internal event stream that
   plugins/extensions subscribe to — forward to a custom sink, compute aggregates, persist counters.
   This applies Frigg's existing module-plugin extension model to telemetry.

7. **Durable usage rollup for reporting (the ADR-010 hand-off).** A built-in subscriber rolls
   selected counters / north-star values into a Frigg-owned **usage store** that ADR-010's
   comparison report and snapshot series read. This is deliberately distinct from OTel export: OTel
   feeds observability backends; the rollup owns durable, queryable usage history for reports.
   **Reports never query an external APM.**

   ```js
   // built-in subscriber: fold selected signals into the durable usage store reports read
   telemetry.on('metric', ({ name, value, attrs }) => {
     if (!usageRollup.tracks(name)) return;              // only rolled-up metrics + north star
     usageRollup.increment({ integrationType: attrs.integration_type, metric: name, value });
   });
   // ADR-010 `snapshot` mode periodically persists usageRollup values → trend series
   ```

### Relationship to ADR-010

ADR-011 **produces** the feature-usage counters; ADR-010 **reads** them. The comparison report
renders its structural columns today and its usage columns once this lands; ADR-010's `snapshot`
mode persists the rollup over time.

### Cardinality note

Per-user / per-integration labels explode metric cardinality. Rule: high-cardinality identifiers
(userId, integrationId) belong on **traces/baggage**; **metrics** aggregate to bounded dimensions
(integrationType, event, endpoint, status). The usage rollup derives per-integration counts from
spans, not from unbounded metric labels.

## Usage-Counter Contract

The concrete contract behind ADR-010 Decision 5 — how integrations declare comparable counters, and
how those are emitted, persisted, and read by reports. It is a thin convention on the ADR-011
metrics primitive, **not** a parallel API.

**1. Canonical vocabulary (core-owned, versioned).** A registry of well-known counter keys is what
makes cross-integration comparison apples-to-apples. Canonical keys are the only metrics guaranteed
comparable *across* integration types.

```js
const CANONICAL_COUNTERS = {
  'records.synced':    { unit: 'count', label: 'Records synced',    dims: ['entity'] },
  'webhooks.received': { unit: 'count', label: 'Webhooks received', dims: ['event'] },
  'workflows.invoked': { unit: 'count', label: 'Workflows invoked', dims: ['workflow'] },
  'api.requests':      { unit: 'count', label: 'API requests',      dims: ['endpoint', 'status'] },
  'user_actions':      { unit: 'count', label: 'User actions',      dims: ['action'] },
};
```

**2. Declaration (opt-in per integration).** An integration declares which counters it reports.
Declaring a canonical key opts it into the comparison report and the rollup; custom keys are
surfaced but comparable only *within* that integration type.

```js
class HubSpotIntegration extends IntegrationBase {
  static Definition = {
    name: 'hubspot',
    usage: {
      canonical: ['records.synced', 'webhooks.received', 'api.requests'],
      custom: { 'deals.enriched': { unit: 'count', label: 'Deals enriched' } },
    },
  };
}
```

**3. Emission (one path, two sources).** A usage counter is an ordinary ADR-011 metric whose key is
canonical or declared in `usage`. Populated either by auto-instrumentation (Decision 2 maps
framework signals: api-module request → `api.requests`, webhook seam → `webhooks.received`,
`USER_ACTION` handler → `user_actions`) or explicitly:

```js
this.telemetry.count('records.synced', batch.length, { entity: 'contact' });
```

**4. Persistence (rollup store, isolated).** The Decision-7 subscriber folds declared counters into
a Frigg-owned usage store with its own repository triad (postgres/mongo/documentdb), isolated per
ADR-010 Decision 3. Dimensions must be bounded (Cardinality note); high-cardinality ids stay on
traces.

```js
class UsageRepositoryInterface {                 // port; adapters mirror reporting/process
  async increment({ integrationId, integrationType, metric, value, window }) {}
  async getTotalsByDimension({ metric, groupBy, since }) {}                     // comparison
  async getTimeSeries({ metric, integrationType, from, to, bucket }) {}  // trend
}
// fact row: { integrationId, integrationType, metric, window, value, updatedAt }
```

**5. Read contract (what reports call).**

```js
frigg.usage.getTotalsByDimension({ metric: 'records.synced', groupBy: 'integrationType', since })
  // → [{ integrationType, value }]                    powers the apples-to-apples comparison
frigg.usage.getTimeSeries({ metric: 'records.synced', integrationType: 'hubspot', from, to, bucket: 'day' })
  // → [{ bucket, value }]                             powers snapshot / trend
```

**6. North Star** references a counter key (canonical or custom); Decision 5's config maps it to a
derived-from-trace signal or a direct emission — no separate mechanism.

**Rules:** canonical keys compare across types; custom keys compare within a type; the registry is
versioned and additive (new keys never break existing reports); declaration in `Definition.usage` is
the single opt-in for rollup + report inclusion.

## Consequences

### Positive
- Free baseline observability across the fleet; vendor-neutral and swappable backend.
- Feature-usage tracking unblocks ADR-010's usage columns and trend snapshots.
- Adopters get a declarative North Star without bespoke plumbing.
- Telemetry is tappable through the existing plugin/extension model.

### Negative
- OTel SDK adds dependency weight and some cold-start cost (mitigate: lazy init, sampling, no-op
  default).
- Exporter configuration and backend cost fall on the adopter.
- The durable usage rollup + store is net-new and must stay isolated per ADR-010 Decision 3.

### Neutral
- Introduces a standard identifier / resource-attribute schema that all emissions carry.
- Establishes OTel as the observability standard, superseding ad-hoc console logging over time.

## Alternatives Considered

- **Ad-hoc / bespoke logging per integration.** Rejected: not standard, not tappable, no
  apples-to-apples, no free baseline.
- **Require adopters to bring their own instrumentation.** Rejected: no default signal; defeats core
  reports.
- **Reuse the `Process` model as the telemetry/usage store.** Rejected: `Process` tracks
  operations, not high-volume telemetry; cardinality and retention differ. The usage rollup is its
  own store.
- **A proprietary Frigg telemetry format.** Rejected: OTel is the interop standard; don't reinvent.

## Related
- [ADR-010: Reporting as an Admin Operation](./010-reporting-as-admin-operation.md)
- [ADR-005: Admin Script Runner Service](./005-admin-script-runner.md)
- Instrumentation + extension seams: integration events (`USER_ACTION`/`CRON`/`QUEUE`/`WEBHOOK`),
  `createFriggCommands`, the `Worker` queue base, the module-plugin system.
- OpenTelemetry: https://opentelemetry.io/
