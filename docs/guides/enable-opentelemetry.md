# Enable OpenTelemetry

Frigg already watches your integrations — handlers, API modules, webhooks — and
emits traces and metrics when you ask it to. This guide gets you from the
zero-config defaults to an OTLP backend (Honeycomb, Datadog, or any collector)
without pasting vendor SDKs into integration code.

For the full exporter / env-var / counter tables, see
[Telemetry reference](../reference/telemetry.md). The decision record is
[ADR-011](../architecture-decisions/011-integration-telemetry-and-usage-tracking.md)
(Accepted).

> **Signals shipped today:** traces and metrics ([#622](https://github.com/friggframework/frigg/pull/622)).
> Structured logs already carry `trace_id` / `span_id` when a span is active —
> see [Logging](./LOGGING.md) and
> [Logging in an Integration](./LOGGING-IN-INTEGRATIONS.md). OTLP **log** export
> is not available yet; do not configure a logs exporter expecting Frigg to send it.

## What you get with no config

Leave `Definition.telemetry` unset:

| `STAGE` | Default exporter | What happens |
| --- | --- | --- |
| `local` | `console` | Spans and metrics print to stdout. Useful while developing. |
| any other stage (`dev`, `prod`, …) | `none` | No OpenTelemetry modules load. No export cost. Integration code can still call `this.telemetry.*` — it is a no-op. |

`none` and `noop` are equivalent: emit nothing, load zero `@opentelemetry/*`
packages.

You do **not** need to opt in for local console output. Run with `STAGE=local`
and watch the traces appear.

## Turn on an OTLP backend

1. Add a `telemetry` block to your backend app definition
   (`backend/index.js` or equivalent).
2. Set the OTLP endpoint (and headers / API key) via environment variables —
   never hardcode secrets.
3. Redeploy (or restart `frigg start` locally) so Lambdas / the local process
   pick up the new config and env.

### Generic OTLP (Collector, Grafana, …)

```js
// backend/index.js
const Definition = {
    name: 'my-app',
    integrations: [/* … */],

    telemetry: {
        exporter: {
            type: 'otlp',
            endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            // optional: headers: { Authorization: `Bearer ${process.env.OTEL_TOKEN}` },
        },
        // optional cost knob for high-traffic fleets (traces only; default 1.0)
        sampleRatio: 1.0,
    },
};

module.exports = Definition;
```

Set:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
# optional auth / vendor headers:
export OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer …'
```

When an OTLP-family exporter is configured, Frigg's generated Lambda
environment passes `OTEL_EXPORTER_OTLP_ENDPOINT` and
`OTEL_EXPORTER_OTLP_HEADERS` through automatically.

### Honeycomb

```js
telemetry: {
    exporter: {
        type: 'honeycomb',
        apiKey: process.env.HONEYCOMB_KEY,
        // endpoint defaults to https://api.honeycomb.io
    },
},
```

### Datadog

Datadog ingests OTLP/HTTP natively — use `type: 'datadog'` (same builder as
generic OTLP) and point the endpoint at your Datadog OTLP intake:

```js
telemetry: {
    exporter: {
        type: 'datadog',
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        headers: {
            // e.g. DD API key header required by your intake
        },
    },
},
```

### Force console or none on a deployed stage

Defaults only apply when `telemetry.exporter` is **absent**. To override:

```js
telemetry: {
    exporter: { type: 'console' }, // explicit — even on STAGE=dev/prod
},
```

```js
telemetry: {
    exporter: { type: 'none' }, // silence local console too
},
```

## Confirm it is working

1. **Local / console:** with `STAGE=local` (or `exporter: { type: 'console' }`),
   invoke a handler or user action. You should see ConsoleSpanExporter /
   ConsoleMetricExporter output on stdout.
2. **OTLP:** send traffic, then look for service spans named
   `frigg.handler.<TYPE>` and `frigg.apimodule.request` in your backend.
3. **Logs ↔ traces:** inside `this.telemetry.span(...)` (and auto-instrumented
   handler spans), log records include `trace_id`, `span_id`, and
   `trace_flags`. Correlate in your log tool the same way you would any OTel
   trace — see [Logging in an Integration](./LOGGING-IN-INTEGRATIONS.md).

## Optional next steps

- **Custom counters and spans** from integration code —
  `this.telemetry.count` / `span` / `event`. Declared usage keys also feed the
  durable usage store (see reference).
- **North Star** — pick one counter (or derive it from an auto-signal) in
  `telemetry.northStar`.
- **Sampling** — lower `sampleRatio` (for example `0.1`) in high-volume prod.
  This thins **traces** only; durable usage counters stay exact. It is not
  error-aware — for "keep all errors, sample the rest," use tail-based sampling
  at an OTel Collector.
- **VPC egress** — a Lambda in a private subnet needs a NAT gateway or VPC
  endpoint to reach an external OTLP backend. Without egress the exporter fails
  silently within `OTEL_FLUSH_TIMEOUT_MS` (default `500`).

## See also

- [Telemetry reference](../reference/telemetry.md) — exporters, env vars,
  auto-instrumentation, usage counters, cardinality, caveats
- [Logging](./LOGGING.md) ·
  [Logging in an Integration](./LOGGING-IN-INTEGRATIONS.md) — log ↔ trace
  correlation
- [ADR-011: Integration Telemetry, Eventing & Feature-Usage Tracking](../architecture-decisions/011-integration-telemetry-and-usage-tracking.md)
