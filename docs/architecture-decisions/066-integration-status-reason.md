# ADR-066: Integration Status Reason

**Status**: Proposed
**Date**: 2026-11-04
**Deciders**: Daniel Klotz, Sean Matthews

## Context

`Integration.status` tells an operator *that* an integration stopped. It does not tell *why*.
`ERROR` today covers at least these different conditions:

| Condition | Typical signal | Can the integration recover without the user? |
|---|---|---|
| The user revoked the grant, or the refresh token expired | `400 invalid_grant` / `401` from the token endpoint | No. The user must reconnect. |
| The provider account has no active plan (trial ended, unpaid) | `402 Payment Required` | Yes, when the customer pays. |
| The grant is missing a scope the integration needs | `403` from a data endpoint | No. The user must reconnect with the new scope. |
| Any other error that `addError` records | an unhandled exception | Unknown. |

All four produce the same row: `status = 'ERROR'` and an `errors` entry with a fixed,
user-facing text. To learn the cause, an operator reads logs one integration at a time.

Three facts in the current code make this worse:

1. **A 402 from the token endpoint is retried forever.** `OAuth2Requester._isDefinitiveAuthRejection`
   accepts only 400 and 401 (RFC 6749 §5.2). A 402 becomes a transport failure. The worker throws,
   SQS retries, and the message goes to the DLQ. The integration stays `ENABLED`, and every event
   for it fails.
2. **Adopters build the reason themselves.** One adopter records a provider 402 as a hand-written
   `errors` entry plus a `config.lastBillingErrorAt` timestamp with a 24-hour debounce. That is a
   status reason, kept in `config` because core has no place for it.
3. **The `errors` array is for humans.** Entries are free text with a title. No query can group
   integrations by cause, and the built-in integrations report cannot count them.

A real incident shows the cost. A webhook migration refreshed the token of every install of one
provider. Many installs went to `ERROR` in one day. They were accounts with no active plan. The installs had been dead for weeks, but nothing had refreshed their tokens until
then. The health report showed a negative trend, and only a manual log investigation found that
the cause was billing, not a defect.

## Decision

Keep `IntegrationStatus` as it is. Add a machine-readable **status reason** next to it, and
classify the reason in core at the point where a failure is detected.

### 1. Schema

Add two nullable fields to `Integration` (PostgreSQL and MongoDB schemas):

```prisma
model Integration {
  // ...
  status          IntegrationStatus        @default(IN_CREATION)
  statusReason    IntegrationStatusReason?
  statusReasonAt  DateTime?
}

enum IntegrationStatusReason {
  CREDENTIAL_REVOKED   // grant rejected: invalid_grant, invalid_client, 401 on refresh
  PAYMENT_REQUIRED     // provider account has no active plan: 402
  PERMISSION_DENIED    // grant lacks a required scope or role: 403 on a required call
  CONFIG_INCOMPLETE    // a required config field or setup step is missing
  UNCLASSIFIED         // ERROR from a path that does not classify (addError, legacy rows)
}
```

The enum is provider-agnostic and short on purpose. A new value needs an ADR amendment. Detail
that is specific to one provider goes into the `errors` message, not into the enum.

### 2. One write path

The `UpdateIntegrationStatus` use case takes an optional `reason` and writes both fields in one
update. `IntegrationBase.persistStatus(status, reason)` passes it through. `addError`, which today
sets `this.status = 'ERROR'` in memory only, goes through the same path. The rules:

- `ERROR` and `NEEDS_CONFIG` require a reason. `persistStatus('ERROR')` without a reason writes
  `UNCLASSIFIED`, so no new `ERROR` row has a null reason.
- Any other status clears `statusReason` and `statusReasonAt`.
- `statusReasonAt` is set only when the reason changes. A repeat of the same reason does not
  move it, so it tells how long the integration has been in this state.

### 3. Classification in the requester

Add one classifier to the requester layer, next to `_isDefinitiveAuthRejection`:

| Signal | Reason | Integration status | Credential `authIsValid` |
|---|---|---|---|
| 400 / 401 / `invalid_grant` / `invalid_client` from the token endpoint | `CREDENTIAL_REVOKED` | `ERROR` | `false` |
| 402 from the token endpoint or from `testAuthRequest` | `PAYMENT_REQUIRED` | `ERROR` | unchanged |
| 403 from `testAuthRequest` | `PERMISSION_DENIED` | `ERROR` | unchanged |
| 429, 5xx, timeout, network error | none | unchanged | unchanged |

Rules:

- **Transient failures never set a reason.** They stay retryable, as they are today. This keeps
  the existing guarantee that a 429 or a 5xx does not flag a healthy credential.
- **`PAYMENT_REQUIRED` does not invalidate the credential.** The grant is still good; the account
  cannot use the API. When the customer pays, the next successful call or health check clears the
  status through the existing `CREDENTIAL_VALIDATED` path. The user does not need to reconnect.
- **The `CREDENTIAL_INVALIDATED` delegate carries the reason.** `IntegrationBase.receiveNotification`
  passes it to `persistStatus`. The `errors` entry keeps its fixed user-facing text, with a text
  per reason, so no provider response body reaches end users.

### 4. API module override

Providers do not agree on status codes. An API module can map its own signals to a reason:

```javascript
class Api extends OAuth2Requester {
    // Returns an IntegrationStatusReason, or null to use the default classifier.
    classifyFailure(error) {
        if (error.statusCode === 403 && /plan/i.test(error.code)) {
            return 'PAYMENT_REQUIRED';
        }
        return null;
    }
}
```

The override can only choose a value from the enum. It cannot make a transient failure permanent:
429 and 5xx are classified before the override runs.

### 5. Read surfaces

- The Management API returns `statusReason` and `statusReasonAt` on every integration read.
- The built-in integrations report (ADR-010) adds a count per `status × statusReason`.
- Telemetry (ADR-011) counts each transition as `frigg.integration.status_changed`
  with `status` and `reason` tags.

## Consequences

### Positive

- An operator sees the cause in one query: "100 `ERROR`, all `PAYMENT_REQUIRED`" is a billing
  trend, not an incident.
- A 402 at the token endpoint stops an endless retry loop and stops filling the DLQ.
- A paid-again account recovers without a reconnect.
- Adopters delete their hand-built billing flags from `config`.
- ADR-067 health checks and recovery scripts can select integrations by reason, for example
  "re-test `PAYMENT_REQUIRED` daily, never touch `CONFIG_INCOMPLETE`".

### Negative

- A schema migration on both databases.
- Integrations in `ERROR` before the migration have a null reason. They get a reason only after
  their next failure or health check (ADR-067).
- A 402 now flips an integration to `ERROR`. Before, the same integration stayed `ENABLED` and
  failed every event. This is a visible change in the status counts, though not in behavior.

### Neutral

- `errors`, `warnings` and `info` stay as human-readable history.
- `DISABLED` (a user pause) never has a reason.

## Alternatives Considered

1. **New status values** (`INACTIVE`, `BILLING_REQUIRED`, ...). Every consumer of `status`
   (queue worker checks, router guards, the Management UI, reports, adopter code) would have to
   learn each new value. A reason is additive: code that checks `status === 'ERROR'` keeps working.
2. **Keep the reason in the `errors` JSON.** No schema change, but a message is free text, it can
   be overwritten by the next message, and it cannot be indexed or counted.
3. **Store only the last HTTP status code.** The code alone is ambiguous across providers (one
   provider sends 403 for an unpaid plan, another sends 402). The reason is the normalized meaning.
4. **Leave classification to adopters.** This is the current state. Each adopter repeats the same
   work, and the token-endpoint 402 loop stays in core.

## Open Questions

1. Should a 402 or a 403 from a **data** call (not the token endpoint or `testAuthRequest`) set a
   reason? Proposal: no, by default. One endpoint can need a paid feature while the rest of the
   API works. An API module can opt in through `classifyFailure`.
2. Should `NEEDS_CONFIG` use the same field (`CONFIG_INCOMPLETE`), or keep its own warnings only?
   Proposal: same field, so a single query covers every non-healthy integration.

## Related

- [ADR-010](./010-reporting-as-admin-operation.md): built-in integrations report
- [ADR-011](./011-integration-telemetry-and-usage-tracking.md): telemetry counters
- [ADR-031](./031-concurrent-oauth-credential-refresh.md), [ADR-042](./042-in-process-single-flight-token-refresh.md): token refresh races
- [ADR-067](./067-built-in-maintenance-scripts.md): health check and recovery scripts that set and read the reason
