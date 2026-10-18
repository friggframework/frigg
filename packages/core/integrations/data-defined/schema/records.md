# Data-defined integrations: database records (v0.1)

Three layers, stored separately. Worked examples for Quo ↔ HubSpot are in `examples/records/`.

| Layer | What it holds | Table | Changes when |
|---|---|---|---|
| Definition | What the integration can do | `IntegrationDefinitionVersion` (new) | A version is published (then never again) |
| Installation | What one customer turned on and chose | `Integration.config` (existing column, new shape) | The customer configures, or an upgrade moves the pin |
| State | What has happened | `IntegrationMapping` (existing), `WorkflowRun` (new) | Every event |

## IntegrationDefinitionVersion (new)

One row per published version. `document` is the definition verbatim; `checksum` is sha256 of its canonical JSON
(sorted keys), so the same content always has the same checksum and an installation can prove what it runs.

```prisma
model IntegrationDefinitionVersion {
  id            String   @id @default(cuid())
  definitionId  String                       // "quo-hubspot"
  version       String                       // "1.4.0" (semver)
  schemaVersion String                       // "0.1"
  status        DefinitionStatus @default(DRAFT)
  checksum      String                       // "sha256:..." of canonical(document)
  document      Json                         // the definition, immutable once PUBLISHED
  changeLevel   String?                      // patch | minor | major, computed by versioning.diff at publish
  previousVersion String?
  notes         String?
  createdBy     String?
  createdAt     DateTime @default(now())
  publishedAt   DateTime?

  @@unique([definitionId, version])
  @@index([definitionId, status])
}

enum DefinitionStatus { DRAFT PUBLISHED DEPRECATED RETIRED }
```

Rules: a `DRAFT` may be edited; publishing runs `validate` (must be valid) and `checkBump` against the latest
published version (the declared bump must cover the computed change level), then freezes the row. `DEPRECATED`
versions keep running for installations pinned to them but cannot be newly installed. A version is `RETIRED` only
when no installation pins it and no queued message references it.

## Integration.config (existing column)

```jsonc
{
  "definition": { "id": "quo-hubspot", "version": "1.4.0", "checksum": "sha256:…" },   // the pin
  "settings":  { "fromNumber": "+15125550100" },                                       // integration-level settings
  "syncs":     { "contacts": { "enabled": true, "mapping": [ /* optional full override */ ] } },
  "workflows": { "missed-call-task": { "enabled": true, "settings": { "owner": "81273645" } } },
  "ui":        { "quo-card": { "enabled": true } },
  "runtime":   { "installed": { "hook": { "id": "WHk2c9", "url": "…", "events": [ … ] } } }  // runtime-owned: onInstall results by step id
}
```

An absent `enabled` means "use the definition's default". The existing `Integration.version` column mirrors
`config.definition.version` so it can be queried and indexed.

## IntegrationMapping (existing) — three kinds of row

| `sourceId` | `mapping` | Written by |
|---|---|---|
| `link:<sync>:<moduleKey>:<id>` | `{ "<moduleKey>": id, …, linkedAt }` | `links.upsert` (both sides get a row) |
| `idx:<sync>:<identityKey>:<normalised value>` | same as link | `links.upsert` with `keys` (email lowercased, phone E.164) |
| `evt:<definition>:<workflow>:<providerEventId>` | `{ at }` | `runWorkflow`, insert-only (`createMapping`) so a redelivery is a no-op |

No new table: these are the rows hand-written integrations already keep, under a fixed naming scheme.

## WorkflowRun (new)

One row per workflow execution. Carries the definition version it ran on, so a run is always explainable against the
exact document, even after an upgrade.

```prisma
model WorkflowRun {
  id                String   @id @default(cuid())
  integrationId     String
  definitionId      String
  definitionVersion String
  workflowId        String
  triggerType       String                     // webhook | schedule | userAction | syncRecord
  eventId           String?                    // provider event id (dedupe key)
  status            String                     // completed | stopped | filtered | duplicate | failed
  reason            String?                    // why it stopped
  error             String?
  attempt           Int      @default(1)
  trace             Json                       // [{ id, use, status, ms, error? }] — no payload bodies
  startedAt         DateTime
  endedAt           DateTime?

  @@index([integrationId, workflowId, startedAt])
  @@index([integrationId, status])
}
```

Retention: keep `failed` runs 30 days and the rest 7 by default. `trace` holds step ids, timings and error messages,
never request or response bodies (those can hold customer data; the existing logging rules apply).
