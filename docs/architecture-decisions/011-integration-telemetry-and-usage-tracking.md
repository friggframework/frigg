# ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking

**Status**: Proposed
**Date**: 2026-06-30
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

### Relationship to ADR-010

ADR-011 **produces** the feature-usage counters; ADR-010 **reads** them. The comparison report
renders its structural columns today and its usage columns once this lands; ADR-010's `snapshot`
mode persists the rollup over time.

### Cardinality note

Per-user / per-integration labels explode metric cardinality. Rule: high-cardinality identifiers
(userId, integrationId) belong on **traces/baggage**; **metrics** aggregate to bounded dimensions
(integrationType, event, endpoint, status). The usage rollup derives per-integration counts from
spans, not from unbounded metric labels.

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
