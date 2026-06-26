# Reporting API

A **read-only, deployment-wide** HTTP API for pulling operational metrics out of a
running Frigg instance — without giving an external tool direct database access.

Frigg apps are commonly deployed **one instance per tenant** (each in its own
account + database). The reporting API lets an outside caller (an admin dashboard,
a fleet monitor, a scheduled job) ask a single instance *"what integrations exist
here, and how are they doing?"* over plain HTTPS, gated by an API key.

It is part of `@friggframework/core` and ships with every app once the core version
that includes it is deployed.

---

## What it gives you

For the instance it runs in, in one call:

- **How many integrations exist**, broken down by **status** and by **type**.
- **Per-integration detail**: type, status, owning user, version, how many modules
  (connected accounts) it wires, how many errors it currently carries, and how many
  `IntegrationMapping` records it holds.
- The same data **filtered** by status, integration type, or user.

It reads **no encrypted fields** — counts come from aggregate/passthrough queries and
non-secret columns, so it never decrypts credentials or mapping payloads.

---

## Enabling it on an instance

1. Deploy a `@friggframework/core` version that includes the reporting domain.
2. Set **`REPORTING_API_KEY`** in that instance's environment / Secrets Manager.
3. Redeploy. The route (`/api/v2/reports*`) is registered automatically as a Lambda
   in the infrastructure's `functions` block.

If `REPORTING_API_KEY` is unset, the endpoint **fails closed** — every request gets
`401`. There is no unauthenticated path.

---

## Authentication

Every request must send the key in a header:

```
x-frigg-reporting-api-key: <REPORTING_API_KEY>
```

This is a dedicated key, separate from `ADMIN_API_KEY` (db-migration) and
`HEALTH_API_KEY` (health) — so the blast radius of the reporting key is limited to
read-only reporting.

---

## Endpoints

### `GET /api/v2/reports`

Index of available reports.

```json
{ "service": "frigg-core-api", "reports": ["integrations"] }
```

### `GET /api/v2/reports/integrations`

The integrations report. All query params are optional:

| Param | Meaning |
|---|---|
| `status` | Only integrations in this state. One of `ENABLED`, `ERROR`, `NEEDS_CONFIG`, `PROCESSING`, `DISABLED`. |
| `type` | Only integrations of this type (matches `config.type`, e.g. `hubspot`). |
| `userId` | Only integrations owned by this user. |

```bash
curl -s https://<instance-host>/api/v2/reports/integrations \
  -H "x-frigg-reporting-api-key: $REPORTING_API_KEY"

# filtered
curl -s "https://<instance-host>/api/v2/reports/integrations?status=ERROR" \
  -H "x-frigg-reporting-api-key: $REPORTING_API_KEY"
curl -s "https://<instance-host>/api/v2/reports/integrations?type=hubspot" \
  -H "x-frigg-reporting-api-key: $REPORTING_API_KEY"
```

#### Response

```jsonc
{
  "schemaVersion": 1,
  "service": "frigg-core-api",
  "generatedAt": "2026-06-22T20:45:05.142Z",
  "filters": { "status": null, "type": null, "userId": null },
  "metrics": {
    "total": 12,
    "byStatus": { "ENABLED": 9, "ERROR": 2, "NEEDS_CONFIG": 1, "PROCESSING": 0, "DISABLED": 0 },
    "byType": [
      { "type": "hubspot", "total": 5,
        "byStatus": { "ENABLED": 4, "ERROR": 1, "NEEDS_CONFIG": 0, "PROCESSING": 0, "DISABLED": 0 } },
      { "type": "salesforce", "total": 3,
        "byStatus": { "ENABLED": 3, "ERROR": 0, "NEEDS_CONFIG": 0, "PROCESSING": 0, "DISABLED": 0 } }
    ],
    "integrations": [
      {
        "id": "17",
        "type": "hubspot",
        "status": "ENABLED",
        "userId": "3",
        "version": "1.0.0",
        "moduleCount": 2,
        "errorCount": 0,
        "mappedRecordCount": 412,
        "createdAt": "2026-06-22T20:45:05.140Z",
        "updatedAt": "2026-06-22T20:45:05.142Z"
      }
    ]
  }
}
```

#### Field reference

| Field | Meaning |
|---|---|
| `schemaVersion` | Contract version. Branch on it; new metrics are added without bumping it. |
| `filters` | Echoes the filters that were applied (nulls when omitted). |
| `metrics.total` | Number of integrations matching the filters. |
| `metrics.byStatus` | Counts keyed by the raw `IntegrationStatus` values. Derive your own rollups (e.g. "needs attention" = `ERROR + NEEDS_CONFIG`). |
| `metrics.byType[]` | Same shape, per integration `type`. Integrations with no `config.type` bucket as `"unknown"`. |
| `metrics.integrations[]` | One lightweight row per integration. |
| · `moduleCount` | Number of connected modules (entities) wired into the integration. |
| · `errorCount` | Length of the integration's `errors` array. |
| · `mappedRecordCount` | Number of `IntegrationMapping` rows for the integration. |

Scope: the report is **deployment-wide** — it covers every integration in the
instance's database, not just one user's, unless you pass `?userId=`.

---

## Errors

| Status | When | Body |
|---|---|---|
| `401` | Missing or wrong `x-frigg-reporting-api-key` | `{ "status": "error", "message": "Unauthorized - x-frigg-reporting-api-key header required" }` |
| `400` | Malformed query param (non-string) or unknown `status` value | `{ "error": "Invalid status 'X'. Expected one of: ENABLED, ERROR, NEEDS_CONFIG, PROCESSING, DISABLED" }` |

---

## What you can build with it

- **Fleet / portfolio dashboard** — poll each tenant instance and aggregate
  "integrations per customer, by type and status" in one place.
- **Broken-integration radar** — surface everything in `ERROR` / `NEEDS_CONFIG`
  across the fleet (`?status=ERROR`), with per-integration `errorCount`.
- **Adoption view** — `?type=hubspot` to see how many customers run a given
  integration and how healthy those instances are.
- **Volume signal** — `mappedRecordCount` / `moduleCount` per integration as a
  rough "how much is flowing" indicator.
- **Per-account drill-down** — `?userId=` to scope to a single user/org within an
  instance.

It's read-only and cheap (no encrypted reads), so it's safe to poll on a schedule.

---

## Caveats

- **Treat the response as sensitive.** It exposes integration types, counts, user
  ids, and version metadata. Keep the key secret; the endpoint is on the instance's
  public API Gateway, so consider a WAF / IP allowlist in front if needed.
- **Read-only.** No mutations; it never writes.
- **DocumentDB.** The Postgres and MongoDB adapters are verified against real
  databases; the DocumentDB adapter (raw cursor draining) is currently covered by
  unit tests only.
- **Docs.** The endpoint is described in `docs/frigg-management-api.yml` (OpenAPI).
  Self-served Scalar docs (ADR-006) are not wired up yet.

---

## Extending it

The endpoint is built hexagonally so new metrics are additive:

- `repositories/` — the `ReportingRepository` port + per-DB adapters
  (`postgres` / `mongo` / `documentdb`) + factory (selects by `config.DB_TYPE`).
- `use-cases/` — `ListIntegrationsReport` (validation, filtering, aggregation).
- `reporting-router.js` — `createReportingRouter()` wires the repository into the
  use case behind the API-key middleware.

To add a new report (e.g. last-sync times, usage time-series): add a repository read
method (in all three adapters), a use case that returns a versioned envelope, and a
`GET /api/v2/reports/<name>` route. No new Lambda, auth, or infrastructure change is
needed — the existing `/api/v2/reports/{proxy+}` function already routes it.
