# Reporting

Read-only, deployment-wide reporting endpoints for `@friggframework/core`.
Gated by a dedicated reporting API key — **not** the per-user auth used by the
rest of the Management API.

## Auth

Send the reporting key in the `x-frigg-reporting-api-key` header. It is validated
against the `REPORTING_API_KEY` environment variable. Missing or wrong key → `401`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v2/reports` | Index of available reports. |
| `GET` | `/api/v2/reports/integrations` | Integrations report (see below). |

### `GET /api/v2/reports/integrations`

Optional query params (all strings): `status` (an `IntegrationStatus`), `type`
(`config.type` slug), `userId`.

## Response shape

```jsonc
{
  "schemaVersion": 1,
  "service": "frigg-core-api",
  "generatedAt": "2026-06-29T20:45:05.142Z",
  "filters": { "status": null, "type": null, "userId": null },
  "metrics": {
    "total": 12,
    "byStatus": { "ENABLED": 9, "ERROR": 2, "NEEDS_CONFIG": 1, "PROCESSING": 0, "DISABLED": 0 },
    "byType": [
      {
        "type": "hubspot",
        "label": "HubSpot CRM",
        "total": 5,
        "byStatus": { "ENABLED": 4, "ERROR": 1, "NEEDS_CONFIG": 0, "PROCESSING": 0, "DISABLED": 0 }
      }
    ],
    "typeLabels": { "hubspot": "HubSpot CRM" },
    "integrations": [ /* lightweight per-integration rows */ ]
  }
}
```

## Field reference

- `schemaVersion` — contract version; branch on it. Additive changes do **not** bump it.
- `filters` — echoes the applied filters (nulls when omitted).
- `metrics.total` — count of integrations matching the filters.
- `metrics.byStatus` — counts keyed by `IntegrationStatus` value.
- `metrics.byType[]` — per `type` breakdown: `{ type, label, total, byStatus }`.
  - `type` — the `config.type` slug. Integrations with no type bucket as `"unknown"`.
  - `label` — human-readable name from the integration class's
    `Definition.display.label`. Falls back to the `type` slug when no registered
    class supplies a label (e.g. an integration that was removed, or run on an
    older app that doesn't register it). Additive — `type` is unchanged.
- `metrics.typeLabels` — map of `type` slug → human-readable label, so callers can
  label `integrations[].type` rows without bloating each row. Contains only types
  whose registered class supplies a non-default `display.label` (classes still
  carrying the IntegrationBase default `'Integration Name'` are excluded).
- `metrics.integrations[]` — lightweight per-integration rows (`id`, `type`,
  `status`, `userId`, `version`, `moduleCount`, `errorCount`, `mappedRecordCount`,
  `createdAt`, `updatedAt`). These rows carry `type` only — resolve display names
  via `metrics.typeLabels`.

## How labels are sourced

`createReportingRouter()` loads the app's registered integration classes via
`loadAppDefinition()` and builds a `{ slug → label }` map from each class's
`Definition.display.label`. Loading is wrapped in try/catch, so reporting still
works (labels fall back to slugs) if the app definition can't be loaded. The
`ListIntegrationsReport` use case stays storage-agnostic — it just reads the
injected `typeLabels` map, so all database adapters (PostgreSQL, MongoDB,
DocumentDB) get labels with zero adapter changes.

## Caveats

- The response is sensitive (exposes integration types, counts, user IDs, versions).
  Treat the reporting key as an admin secret.
- Read-only — no mutation endpoints.
- Labels only appear once the deployment runs a `@friggframework/core` version that
  includes this field and the app registers the integration classes.
